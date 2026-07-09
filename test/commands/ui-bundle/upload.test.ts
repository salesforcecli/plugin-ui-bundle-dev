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

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'chai';
import { TestContext, MockTestOrgData } from '@salesforce/core/testSetup';
import { Org } from '@salesforce/core';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
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
    it('missing --zip-file -> FailedFlagValidationError, no network call', async () => {
      const testOrg = new MockTestOrgData();
      await $$.stubAuths(testOrg);
      const requestStub = $$.SANDBOX.stub();
      $$.fakeConnectionRequest = requestStub;
      stubSfCommandUx($$.SANDBOX);

      try {
        await UiBundleUpload.run(['--use-pages', '--target-org', testOrg.username], import.meta.url);
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { message: string; cause?: Error };
        expect(err.message).to.include('Missing required flag zip-file');
        // SfCommand wraps the thrown error in a generic Error; the original class survives as `cause`.
        expect(err.cause?.constructor.name).to.equal('FailedFlagValidationError');
      }
      expect(requestStub.called).to.be.false;
    });

    it('missing --use-pages -> FailedFlagValidationError, no network call', async () => {
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
        expect(err.message).to.include('Missing required flag use-pages');
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
        await UiBundleUpload.run(['--zip-file', zipPath, '--use-pages'], import.meta.url);
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
          ['--zip-file', nonExistentPath, '--use-pages', '--target-org', testOrg.username],
          import.meta.url
        );
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as Error & { name: string; message: string };
        expect(err.message).to.include(`No file found at ${nonExistentPath}`);
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
        ['--zip-file', zipPath, '--use-pages', '--target-org', testOrg.username],
        import.meta.url
      );

      expect(result).to.deep.equal({ jobId: '0BXxx0000000001', status: 'Queued' } as UiBundleUploadResult);
      expect(requestStub.calledOnce).to.be.true;
      expect(uxStubs.log.args.flat()).to.deep.include('Upload queued successfully.');
      expect(uxStubs.log.args.flat()).to.deep.include('Job ID: 0BXxx0000000001.');
      expect(uxStubs.logToStderr.called).to.be.false;
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
          ['--zip-file', zipPath, '--use-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--use-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--use-pages', '--target-org', testOrg.username],
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
          ['--zip-file', zipPath, '--use-pages', '--target-org', testOrg.username],
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
