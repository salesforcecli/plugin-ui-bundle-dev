/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect } from 'chai';
import { TestContext, MockTestOrgData } from '@salesforce/core/testSetup';
import { Messages, Connection } from '@salesforce/core';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import JSZip from 'jszip';
import UiBundleUpload from '../../../src/commands/ui-bundle/upload.js';
import type { UiBundleUploadResult } from '../../../src/config/types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-ui-bundle-dev', 'ui-bundle.upload');

/**
 * Create a placeholder zip fixture. Content is never inspected client-side,
 * so any bytes satisfy `Flags.file({ exists: true })`'s existence check.
 */
function createZipFixture(): string {
  const zipPath = join(tmpdir(), `upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  writeFileSync(zipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  return zipPath;
}

/**
 * Materialize an uncompressed source directory for the `--bundle-dir` path.
 * A couple of nested files are enough to exercise SDR's recursive compression.
 */
function createBundleDirFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'upload-test-dir-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'index.html'), '<html></html>');
  writeFileSync(join(dir, 'src', 'app.js'), 'console.log("hi");');
  return dir;
}

/**
 * Materialize an uncompressed source directory with dotfiles and dot-directories.
 * Used to verify the dotfile filter path.
 */
function createBundleDirWithDotfilesFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'upload-test-dir-dotfiles-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, 'index.html'), '<html></html>');
  writeFileSync(join(dir, 'src', 'app.js'), 'console.log("hi");');
  writeFileSync(join(dir, '.env'), 'SECRET=value');
  writeFileSync(join(dir, 'src', '.hidden'), 'hidden content');
  writeFileSync(join(dir, '.git', 'config'), '[core]');
  return dir;
}

/**
 * Materialize an uncompressed source directory containing a symlinked file and a
 * symlinked directory, alongside real entries. Used to verify that `collectFiles`
 * follows symlinks (via `statSync`) rather than skipping them (via `Dirent` checks).
 *
 * Returns `undefined` if symlink creation isn't permitted in this environment (e.g.
 * unprivileged Windows CI without Developer Mode), so callers can skip the test.
 */
function createBundleDirWithSymlinksFixture(): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'upload-test-dir-symlinks-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'index.html'), '<html></html>');
  writeFileSync(join(dir, 'src', 'app.js'), 'console.log("hi");');

  // A real file living outside the bundle dir, targeted by a symlink inside it.
  const realTargetDir = mkdtempSync(join(tmpdir(), 'upload-test-real-target-'));
  const realTargetFile = join(realTargetDir, 'real-target.js');
  writeFileSync(realTargetFile, 'console.log("linked file");');

  // A real subdirectory living outside the bundle dir, targeted by a symlinked directory inside it.
  const realSubdir = join(realTargetDir, 'real-subdir');
  mkdirSync(realSubdir);
  writeFileSync(join(realSubdir, 'nested.js'), 'console.log("linked dir");');

  try {
    symlinkSync(realTargetFile, join(dir, 'linked.js'), 'file');
    symlinkSync(realSubdir, join(dir, 'linked-dir'), 'dir');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // Unprivileged Windows runners (no Developer Mode/admin) reject symlink creation.
    if (err.code === 'EPERM' || err.code === 'ENOSYS') {
      return undefined;
    }
    throw e;
  }

  return dir;
}

/** Read the full multipart body (with the `bundle` part embedded) from a captured request. */
function bundleBufferFromRequest(request: unknown): Buffer {
  // The request body is now the fully-assembled multipart Buffer (form.getBuffer()).
  return (request as { body: Buffer }).body;
}

/** The local zip-file signature — every zip stream starts with these 4 bytes. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Marker for the `deployRequest` multipart part's Content-Disposition header. */
const DEPLOY_REQUEST_DISPOSITION = 'Content-Disposition: form-data; name="deployRequest"';

describe('ui-bundle:upload command unit tests', () => {
  const $$ = new TestContext();

  // Default resolved API version for every stubbed connection in this file. @salesforce/core's
  // test harness hardcodes the mocked `/services/data` response — used by `retrieveMaxApiVersion`
  // during `Connection.create()` — to `{ version: '42.0' }` (see `stubContext` in
  // node_modules/@salesforce/core/lib/testSetup.js). That's below MINIMUM_SUPPORTED_API_VERSION (67)
  // and isn't reachable via `$$.fakeConnectionRequest` (the hardcoded case short-circuits before
  // that hook runs). Stub `useLatestApiVersion` — the step `Connection.create()` runs before the
  // command ever calls `getApiVersion()` — so a connection resolves to a supported version by
  // default; tests exercising response mapping, dotfile filtering, symlinks, etc. never touch the
  // floor check. A test that needs a specific *resolved* (as opposed to explicitly-flagged) version
  // reassigns `resolvedApiVersion` before invoking the command. Explicit `--api-version` flags still
  // take priority: `Org.getConnection(apiVersion)` calls the real `setApiVersion` afterward, which
  // this stub doesn't touch.
  let resolvedApiVersion = '67.0';

  beforeEach(() => {
    resolvedApiVersion = '67.0';
    $$.SANDBOX.stub(Connection.prototype, 'useLatestApiVersion').callsFake(async function (this: Connection) {
      this.setApiVersion(resolvedApiVersion);
    });
  });

  afterEach(() => {
    $$.restore();
  });

  /* ------------------------------------------------------------------ *
   *  Flag-validation-only cases — fail during this.parse(), before any *
   *  org resolution or network interaction. No connection stubbing.    *
   * ------------------------------------------------------------------ */
  describe('flag validation (no network interaction)', () => {
    it('neither --zip-file nor --bundle-dir -> FailedFlagValidationError (exactly-one), no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(['--use-salesforce-pages', '--target-org', testOrg.username], import.meta.url);
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { message: string; cause?: Error };
        // Flag order in the message isn't stable; assert on the prefix and both names.
        expect(err.message).to.include('Exactly one of the following must be provided');
        expect(err.message).to.include('--zip-file');
        expect(err.message).to.include('--bundle-dir');
        // SfCommand wraps the thrown error in a generic Error; the original class survives as `cause`.
        expect(err.cause?.constructor.name).to.equal('FailedFlagValidationError');
      }
      expect(requestStub.called).to.be.false;
    });

    it('both --zip-file and --bundle-dir -> FailedFlagValidationError (exactly-one), no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const zipPath = createZipFixture();
      const bundleDir = createBundleDirFixture();

      try {
        await UiBundleUpload.run(
          [
            '--zip-file',
            zipPath,
            '--bundle-dir',
            bundleDir,
            '--use-salesforce-pages',
            '--target-org',
            testOrg.username,
          ],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { message: string; cause?: Error };
        // Message wording depends on parse order; assert on the stable prefix.
        expect(err.message).to.include('cannot also be provided when using');
        expect(err.cause?.constructor.name).to.equal('FailedFlagValidationError');
      }
      expect(requestStub.called).to.be.false;
    });

    it('missing --use-salesforce-pages -> FailedFlagValidationError, no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const zipPath = createZipFixture();

      try {
        await UiBundleUpload.run(['--zip-file', zipPath, '--target-org', testOrg.username], import.meta.url);
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { message: string; cause?: Error };
        expect(err.message).to.include('Missing required flag use-salesforce-pages');
        expect(err.cause?.constructor.name).to.equal('FailedFlagValidationError');
      }
      expect(requestStub.called).to.be.false;
    });

    it('missing --target-org with no default -> NoDefaultEnvError', async () => {
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const zipPath = createZipFixture();

      try {
        await UiBundleUpload.run(['--zip-file', zipPath, '--use-salesforce-pages'], import.meta.url);
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('NoDefaultEnvError');
        expect(err.message).to.include('target-org');
      }
      expect(requestStub.called).to.be.false;
    });

    it('non-existent --zip-file path -> file-existence validation error, no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const nonExistentPath = join(tmpdir(), `does-not-exist-${Date.now()}.zip`);

      try {
        await UiBundleUpload.run(
          ['--zip-file', nonExistentPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.message).to.include(`No file found at ${nonExistentPath}`);
      }
      expect(requestStub.called).to.be.false;
    });

    it('non-existent --bundle-dir path -> directory-existence validation error, no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const nonExistentDir = join(tmpdir(), `does-not-exist-dir-${Date.now()}`);

      try {
        await UiBundleUpload.run(
          ['--bundle-dir', nonExistentDir, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.message).to.include(nonExistentDir);
      }
      expect(requestStub.called).to.be.false;
    });
  });

  /* ------------------------------------------------------------------ *
   *  Response-mapping / SfError-name cases — exercise the org          *
   *  resolution + connection.request() path via a stubbed connection.  *
   * ------------------------------------------------------------------ */
  describe('response mapping and error semantics (stubbed connection)', () => {
    let testOrg: MockTestOrgData;
    let zipPath: string;

    beforeEach(async () => {
      testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      zipPath = createZipFixture();
    });

    it('Queued response -> correct return value and human log calls', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000001', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      const uxStubs = stubSfCommandUx($$.SANDBOX);

      const result = await UiBundleUpload.run(
        ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000001', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
      expect(uxStubs.log.args.flat()).to.deep.include('Upload queued successfully.');
      expect(uxStubs.log.args.flat()).to.deep.include('Job ID: 0BXxx0000000001');
      expect(uxStubs.logToStderr.called).to.be.false;

      // The multipart body includes a `deployRequest` JSON part alongside the `bundle` part.
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]).toString('utf8');
      expect(sent).to.include(DEPLOY_REQUEST_DISPOSITION);
      // requestedName defaults to the zip fixture's base name with the .zip extension stripped.
      const expectedName = basename(zipPath).replace(/\.zip$/i, '');
      expect(sent).to.include(`Content-Type: application/json\r\n\r\n{"requestedName":"${expectedName}"}`);
    });

    it('--bundle-name explicitly provided -> requestedName equals the flag value verbatim', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000007', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      await UiBundleUpload.run(
        [
          '--zip-file',
          zipPath,
          '--use-salesforce-pages',
          '--target-org',
          testOrg.username,
          '--bundle-name',
          'my-custom-bundle-name',
        ],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]).toString('utf8');
      expect(sent).to.include('Content-Type: application/json\r\n\r\n{"requestedName":"my-custom-bundle-name"}');
    });

    it('--bundle-dir with no --bundle-name -> requestedName defaults to the bundle dir basename', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000008', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const bundleDir = createBundleDirFixture();

      await UiBundleUpload.run(
        ['--bundle-dir', bundleDir, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]).toString('utf8');
      // Directories have no .zip suffix to strip; the basename is used as-is.
      const expectedName = basename(bundleDir);
      expect(sent).to.include(`Content-Type: application/json\r\n\r\n{"requestedName":"${expectedName}"}`);
    });

    it('--zip-file named ".zip" -> requestedName falls back to the unstripped filename, not empty', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000011', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const dotZipPath = join(tmpdir(), '.zip');
      writeFileSync(dotZipPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

      await UiBundleUpload.run(
        ['--zip-file', dotZipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]).toString('utf8');
      expect(sent).to.include('Content-Type: application/json\r\n\r\n{"requestedName":".zip"}');
    });

    it('--api-version below the minimum floor -> throws UiBundleUploadApiVersionError, no network call', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000009', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username, '--api-version', '66.0'],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadApiVersionError');
        expect(err.message).to.include('66.0');
        expect(err.message).to.include('67');
      }
      expect(requestStub.called).to.be.false;
    });

    it('--api-version at the minimum floor -> does not throw, proceeds to a Queued result', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000010', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      const result = await UiBundleUpload.run(
        ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username, '--api-version', '67.0'],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000010', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
    });

    it('omitted --api-version, connection resolves below the minimum floor -> throws UiBundleUploadApiVersionError, no network call', async () => {
      // Simulates an org-config default or auto-negotiated version below the floor, with no
      // --api-version flag on the command line at all. Before this change, only an explicit
      // --api-version input was checked; the resolved-version check must now catch this too.
      resolvedApiVersion = '66.0';
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000012', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadApiVersionError');
        expect(err.message).to.include('66.0');
        expect(err.message).to.include('67');
      }
      expect(requestStub.called).to.be.false;
    });

    it('omitted --api-version, connection resolves at/above the minimum floor -> does not throw, proceeds to a Queued result', async () => {
      // Sanity check for the shared default: an omitted flag with a supported resolved version
      // (the beforeEach default of 67.0) must behave like every other non-version-specific test.
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000013', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      const result = await UiBundleUpload.run(
        ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000013', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
    });

    it('--zip-file -> sends the file as-is (a zip) in the bundle part, no re-compression', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000003', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      await UiBundleUpload.run(
        ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      // getBuffer() returns the whole multipart body; the placeholder zip is embedded verbatim.
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]);
      expect(sent.includes(ZIP_MAGIC)).to.be.true;
    });

    it('--bundle-dir -> compresses the directory (via SDR) into a zip bundle part', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000004', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const bundleDir = createBundleDirFixture();

      const result = await UiBundleUpload.run(
        ['--bundle-dir', bundleDir, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000004', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
      // The bundle part is a real SDR-produced zip (its local-file-header magic appears in the body).
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]);
      expect(sent.includes(ZIP_MAGIC)).to.be.true;
      // A compressed two-file directory is meaningfully larger than the 4-byte placeholder.
      expect(sent.length).to.be.greaterThan(100);
    });

    it('--bundle-dir -> every zip entry is nested under a <basename(dir)>/ wrapper directory', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000014', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const bundleDir = createBundleDirFixture();
      const wrapperDir = basename(bundleDir);

      await UiBundleUpload.run(
        ['--bundle-dir', bundleDir, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]);
      const zip = await JSZip.loadAsync(sent);
      const entries = Object.keys(zip.files);

      // The Connect API rejects zips whose entries live at the root; every entry must be nested
      // under a single common top-level directory. We use the bundle dir's basename for it.
      expect(entries).to.include(`${wrapperDir}/index.html`);
      expect(entries).to.include(`${wrapperDir}/src/app.js`);
      // No entry lives at the zip root.
      expect(entries.every((e) => e.startsWith(`${wrapperDir}/`))).to.be.true;
    });

    it('--bundle-dir with dotfiles -> dotfiles and dot-directories are filtered out', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000005', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);
      const bundleDir = createBundleDirWithDotfilesFixture();
      const wrapperDir = basename(bundleDir);

      await UiBundleUpload.run(
        ['--bundle-dir', bundleDir, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]);
      const zip = await JSZip.loadAsync(sent);
      const entries = Object.keys(zip.files);

      // Assert non-dotfiles are present, nested under the wrapper directory.
      expect(entries).to.include(`${wrapperDir}/index.html`);
      expect(entries).to.include(`${wrapperDir}/src/app.js`);

      // Assert dotfiles and dot-directory contents are absent.
      expect(entries.some((e) => e.includes('.env'))).to.be.false;
      expect(entries.some((e) => e.includes('.hidden'))).to.be.false;
      expect(entries.some((e) => e.includes('.git'))).to.be.false;
    });

    it('--bundle-dir with symlinks -> symlinked files and directories are bundled, not skipped', async function () {
      const bundleDir = createBundleDirWithSymlinksFixture();
      if (!bundleDir) {
        this.skip();
        return;
      }
      const wrapperDir = basename(bundleDir);

      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000006', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      await UiBundleUpload.run(
        ['--bundle-dir', bundleDir, '--use-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(requestStub.calledOnce).to.be.true;
      const sent = bundleBufferFromRequest(requestStub.firstCall.args[0]);
      const zip = await JSZip.loadAsync(sent);
      const entries = Object.keys(zip.files);

      // Non-symlink entries are still present, nested under the wrapper directory.
      expect(entries).to.include(`${wrapperDir}/index.html`);
      expect(entries).to.include(`${wrapperDir}/src/app.js`);

      // The symlinked file and the symlinked directory's nested file are both bundled.
      expect(entries).to.include(`${wrapperDir}/linked.js`);
      expect(entries).to.include(`${wrapperDir}/linked-dir/nested.js`);

      const linkedFileContent = await zip.files[`${wrapperDir}/linked.js`].async('string');
      expect(linkedFileContent).to.equal('console.log("linked file");');

      const linkedDirFileContent = await zip.files[`${wrapperDir}/linked-dir/nested.js`].async('string');
      expect(linkedDirFileContent).to.equal('console.log("linked dir");');
    });

    it('Failed response (defensive) -> correct return value, logged to stderr, exitCode 1', async () => {
      const savedExitCode = process.exitCode;
      process.exitCode = undefined;
      try {
        const requestStub = $$.SANDBOX.stub().resolves({
          jobId: '0BXxx0000000002',
          status: 'Failed',
          message: 'Bundle validation failed',
        });
        $$.fakeConnectionRequest = requestStub;
        const uxStubs = stubSfCommandUx($$.SANDBOX);

        const result = await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );

        expect(result).to.deep.equal({
          jobId: '0BXxx0000000002',
          status: 'Failed',
          message: 'Bundle validation failed',
        } as UiBundleUploadResult);
        expect(process.exitCode).to.equal(1);
        expect(uxStubs.log.called).to.be.false;
        expect(uxStubs.logToStderr.calledOnce).to.be.true;
        const stderrOutput = uxStubs.logToStderr.args.flat().join('\n');
        expect(stderrOutput).to.include('Upload failed');
        expect(stderrOutput).to.include('0BXxx0000000002');
        expect(stderrOutput).to.include('Bundle validation failed');
        // Verify the stderr output matches what the message file produces.
        const expectedMessage = messages.getMessage('error.upload-failed', [
          '0BXxx0000000002',
          'Bundle validation failed',
        ]);
        expect(stderrOutput).to.equal(expectedMessage);
      } finally {
        process.exitCode = savedExitCode;
      }
    });

    it('HTTP error with errorCode -> throws UiBundleUploadValidationError, message verbatim', async () => {
      const serverError = new Error('The org rejected the bundle: unsupported file type') as Error & {
        errorCode: string;
      };
      serverError.errorCode = 'INVALID_INPUT';
      $$.fakeConnectionRequest = $$.SANDBOX.stub().rejects(serverError);
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadValidationError');
        expect(err.message).to.include('The org rejected the bundle: unsupported file type');
      }
    });

    it('network failure (no HTTP response) -> throws UiBundleUploadNetworkError, message verbatim', async () => {
      $$.fakeConnectionRequest = $$.SANDBOX.stub().rejects(new Error('ECONNREFUSED: connection refused'));
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadNetworkError');
        expect(err.message).to.include('ECONNREFUSED: connection refused');
      }
    });

    it('auth error via INVALID_SESSION_ID errorCode -> throws UiBundleUploadAuthError, message verbatim', async () => {
      const authError = new Error('Session expired or invalid') as Error & { errorCode: string };
      authError.errorCode = 'INVALID_SESSION_ID';
      $$.fakeConnectionRequest = $$.SANDBOX.stub().rejects(authError);
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadAuthError');
        expect(err.message).to.include('Session expired or invalid');
      }
    });

    it('auth error via ERROR_HTTP_401 errorCode -> throws UiBundleUploadAuthError, message verbatim', async () => {
      const authError = new Error('Unauthorized') as Error & { errorCode: string };
      authError.errorCode = 'ERROR_HTTP_401';
      $$.fakeConnectionRequest = $$.SANDBOX.stub().rejects(authError);
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadAuthError');
        expect(err.message).to.include('Unauthorized');
      }
    });

    it('auth error via refresh-failure message -> throws UiBundleUploadAuthError, message verbatim', async () => {
      const refreshError = new Error('Unable to refresh session due to: invalid grant');
      $$.fakeConnectionRequest = $$.SANDBOX.stub().rejects(refreshError);
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--use-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadAuthError');
        expect(err.message).to.include('Unable to refresh session due to:');
      }
    });
  });
});
