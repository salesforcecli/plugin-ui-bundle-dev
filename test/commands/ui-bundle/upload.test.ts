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

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'chai';
import { TestContext, MockTestOrgData } from '@salesforce/core/testSetup';
import { Org } from '@salesforce/core';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import type FormData from 'form-data';
import UiBundleUpload from '../../../src/commands/ui-bundle/upload.js';
import type { UiBundleUploadResult } from '../../../src/config/types.js';

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

/** Read the full multipart body (with the `bundle` part embedded) from a captured request. */
function bundleBufferFromRequest(request: unknown): Buffer {
  const body = (request as { body: FormData }).body;
  return body.getBuffer();
}

/** The local zip-file signature — every zip stream starts with these 4 bytes. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe('ui-bundle:upload command unit tests', () => {
  const $$ = new TestContext();

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
        await UiBundleUpload.run(['--as-salesforce-pages', '--target-org', testOrg.username], import.meta.url);
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
          ['--zip-file', zipPath, '--bundle-dir', bundleDir, '--as-salesforce-pages', '--target-org', testOrg.username],
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

    it('missing --as-salesforce-pages -> FailedFlagValidationError, no network call', async () => {
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
        expect(err.message).to.include('Missing required flag as-salesforce-pages');
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
        await UiBundleUpload.run(['--zip-file', zipPath, '--as-salesforce-pages'], import.meta.url);
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
          ['--zip-file', nonExistentPath, '--as-salesforce-pages', '--target-org', testOrg.username],
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
          ['--bundle-dir', nonExistentDir, '--as-salesforce-pages', '--target-org', testOrg.username],
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
        ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000001', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
      expect(uxStubs.log.args.flat()).to.deep.include('Upload queued successfully.');
      expect(uxStubs.log.args.flat()).to.deep.include('Job ID: 0BXxx0000000001.');
      expect(uxStubs.logToStderr.called).to.be.false;
    });

    it('--zip-file -> sends the file as-is (a zip) in the bundle part, no re-compression', async () => {
      const requestStub = $$.SANDBOX.stub().resolves({ jobId: '0BXxx0000000003', status: 'Queued' });
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      await UiBundleUpload.run(
        ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
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
        ['--bundle-dir', bundleDir, '--as-salesforce-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadNetworkError');
        expect(err.message).to.include('ECONNREFUSED: connection refused');
      }
    });

    it('org connection failure -> throws UiBundleUploadAuthError, message verbatim', async () => {
      // Stub only the explicit-args call (getConnection(undefined)); the flag parser's
      // own no-args getConnection() calls during --target-org resolution stay untouched.
      const getConnectionStub = $$.SANDBOX.stub(Org.prototype, 'getConnection').callThrough();
      getConnectionStub.withArgs(undefined).throws(new Error('Failed to refresh access token'));
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(
          ['--zip-file', zipPath, '--as-salesforce-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.name).to.equal('UiBundleUploadAuthError');
        expect(err.message).to.include('Failed to refresh access token');
      }
    });
  });
});
