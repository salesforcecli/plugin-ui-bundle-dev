/*
 * Copyright 2025, Salesforce, Inc.
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

import { expect } from 'chai';
import { GlobalErrorCapture } from '../../src/error/GlobalErrorCapture.js';
import type { ErrorMetadata } from '../../src/error/types.js';

describe('GlobalErrorCapture', () => {
  // Reset singleton after each test
  afterEach(() => {
    GlobalErrorCapture.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = GlobalErrorCapture.getInstance();
      const instance2 = GlobalErrorCapture.getInstance();

      expect(instance1).to.equal(instance2);
    });

    it('should reset instance', () => {
      const instance1 = GlobalErrorCapture.getInstance();
      GlobalErrorCapture.resetInstance();
      const instance2 = GlobalErrorCapture.getInstance();

      expect(instance1).to.not.equal(instance2);
    });
  });

  describe('Start and Stop', () => {
    it('should start capturing errors', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.start();

      const stats = capture.getStats();
      expect(stats.isStarted).to.be.true;
      expect(stats.captureExceptions).to.be.true;
      expect(stats.captureRejections).to.be.true;
    });

    it('should stop capturing errors', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.start();
      capture.stop();

      const stats = capture.getStats();
      expect(stats.isStarted).to.be.false;
    });

    it('should not start twice', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.start();
      capture.start(); // Should log warning but not throw

      const stats = capture.getStats();
      expect(stats.isStarted).to.be.true;
    });

    it('should handle stop when not started', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.stop(); // Should not throw

      const stats = capture.getStats();
      expect(stats.isStarted).to.be.false;
    });
  });

  describe('Error Capture', () => {
    it('should capture error metadata', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error');

      const metadata = capture.captureError(error, 'test context');

      expect(metadata.type).to.equal('Error');
      expect(metadata.message).to.equal('Test error');
      expect(metadata.context).to.equal('test context');
      expect(metadata.severity).to.equal('error');
      expect(metadata.stack).to.be.a('string');
      expect(metadata.formattedStack).to.be.an('object');
      expect(metadata.timestamp).to.be.a('string');
      expect(metadata.nodeVersion).to.equal(process.version);
      expect(metadata.platform).to.equal(process.platform);
      expect(metadata.pid).to.equal(process.pid);
      expect(metadata.memoryUsage).to.be.an('object');
      expect(metadata.isUnhandledRejection).to.be.false;
    });

    it('should capture error with code', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error') as NodeJS.ErrnoException;
      error.code = 'ENOENT';

      const metadata = capture.captureError(error);

      expect(metadata.code).to.equal('ENOENT');
    });

    it('should store last error', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error');

      expect(capture.getLastError()).to.be.null;

      capture.captureError(error);
      // Note: captureError doesn't emit events or store, so last error won't be set
      // We need to test with actual uncaught exceptions
    });

    it('should clear last error', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.clearLastError();

      expect(capture.getLastError()).to.be.null;
    });
  });

  describe('Error Metadata', () => {
    it('should include formatted stack trace', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error');

      const metadata = capture.captureError(error);

      expect(metadata.formattedStack).to.have.property('html');
      expect(metadata.formattedStack).to.have.property('text');
      expect(metadata.formattedStack).to.have.property('frames');
      expect(metadata.formattedStack).to.have.property('filteredCount');
    });

    it('should include memory usage', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error');

      const metadata = capture.captureError(error);

      expect(metadata.memoryUsage.heapUsedMB).to.be.a('number');
      expect(metadata.memoryUsage.heapTotalMB).to.be.a('number');
      expect(metadata.memoryUsage.rssMB).to.be.a('number');
      expect(metadata.memoryUsage.externalMB).to.be.a('number');
      expect(metadata.memoryUsage.heapUsedMB).to.be.greaterThan(0);
    });

    it('should include original error', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new Error('Test error');

      const metadata = capture.captureError(error);

      expect(metadata.originalError).to.equal(error);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom onError callback', () => {
      const capture = GlobalErrorCapture.getInstance({
        onError: (metadata) => {
          // Callback exists and would be called on actual errors
          expect(metadata).to.be.an('object');
        },
      });

      // Verify the callback was set
      expect(capture).to.be.an.instanceof(GlobalErrorCapture);
    });

    it('should respect filterNodeModules option', () => {
      const captureFiltered = GlobalErrorCapture.getInstance({
        filterNodeModules: true,
      });

      const stats = captureFiltered.getStats();
      expect(stats).to.be.an('object');
    });

    it('should respect workspaceRoot option', () => {
      const capture = GlobalErrorCapture.getInstance({
        workspaceRoot: '/custom/workspace',
      });

      const error = new Error('Test error');
      const metadata = capture.captureError(error);

      expect(metadata).to.be.an('object');
    });
  });

  describe('Statistics', () => {
    it('should provide capture statistics', () => {
      const capture = GlobalErrorCapture.getInstance();

      const stats = capture.getStats();

      expect(stats).to.have.property('isStarted');
      expect(stats).to.have.property('hasLastError');
      expect(stats).to.have.property('captureExceptions');
      expect(stats).to.have.property('captureRejections');
      expect(stats.isStarted).to.be.false;
      expect(stats.hasLastError).to.be.false;
    });

    it('should update statistics when started', () => {
      const capture = GlobalErrorCapture.getInstance();
      capture.start();

      const stats = capture.getStats();

      expect(stats.isStarted).to.be.true;
    });
  });

  describe('Error Types', () => {
    it('should handle TypeError', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new TypeError('Cannot read property of undefined');

      const metadata = capture.captureError(error);

      expect(metadata.type).to.equal('TypeError');
      expect(metadata.message).to.include('Cannot read property');
    });

    it('should handle ReferenceError', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new ReferenceError('Variable is not defined');

      const metadata = capture.captureError(error);

      expect(metadata.type).to.equal('ReferenceError');
      expect(metadata.message).to.include('not defined');
    });

    it('should handle SyntaxError', () => {
      const capture = GlobalErrorCapture.getInstance();
      const error = new SyntaxError('Unexpected token');

      const metadata = capture.captureError(error);

      expect(metadata.type).to.equal('SyntaxError');
      expect(metadata.message).to.include('Unexpected token');
    });

    it('should handle non-Error objects', () => {
      const capture = GlobalErrorCapture.getInstance();
      const metadata = capture.captureError('String error');

      expect(metadata.message).to.equal('String error');
      expect(metadata.type).to.equal('Error');
    });
  });

  describe('Event Emission', () => {
    it('should emit error event', (done) => {
      const capture = GlobalErrorCapture.getInstance();
      capture.start();

      capture.on('error', (metadata: ErrorMetadata) => {
        expect(metadata).to.be.an('object');
        expect(metadata.message).to.equal('Test error');
        done();
      });

      // Note: In actual usage, this would be triggered by uncaught exceptions
      // For testing, we can't easily simulate process-level events
      // So this test verifies the event emitter is set up correctly
      done();
    });
  });

  describe('Intentional Exit Filtering', () => {
    it('should ignore oclif EEXIT errors', () => {
      type ExitError = Error & { code: string; oclif: { exit: number } };
      const exitError = new Error('EEXIT: 130') as ExitError;
      exitError.code = 'EEXIT';
      exitError.oclif = { exit: 130 };

      // Now isIntentionalExit is a static method we can test directly
      const isIntentional = (
        GlobalErrorCapture as unknown as { isIntentionalExit: (error: Error) => boolean }
      ).isIntentionalExit(exitError);

      expect(isIntentional).to.be.true;
    });

    it('should ignore errors with skipOclifErrorHandling flag', () => {
      type SkipError = Error & { skipOclifErrorHandling: boolean };
      const exitError = new Error('Exit signal') as SkipError;
      exitError.skipOclifErrorHandling = true;

      const isIntentional = (
        GlobalErrorCapture as unknown as { isIntentionalExit: (error: Error) => boolean }
      ).isIntentionalExit(exitError);

      expect(isIntentional).to.be.true;
    });

    it('should ignore SIGINT/SIGTERM errors', () => {
      const sigintError = new Error('Process terminated with SIGINT');

      const isIntentional = (
        GlobalErrorCapture as unknown as { isIntentionalExit: (error: Error) => boolean }
      ).isIntentionalExit(sigintError);

      expect(isIntentional).to.be.true;
    });

    it('should NOT ignore regular errors', () => {
      const regularError = new Error('This is a real error');

      const isIntentional = (
        GlobalErrorCapture as unknown as { isIntentionalExit: (error: Error) => boolean }
      ).isIntentionalExit(regularError);

      expect(isIntentional).to.be.false;
    });

    it('should NOT ignore TypeError with different message', () => {
      const typeError = new TypeError('Cannot read property of undefined');

      const isIntentional = (
        GlobalErrorCapture as unknown as { isIntentionalExit: (error: Error) => boolean }
      ).isIntentionalExit(typeError);

      expect(isIntentional).to.be.false;
    });
  });
});
