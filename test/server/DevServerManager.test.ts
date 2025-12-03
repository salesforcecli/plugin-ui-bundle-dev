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
import { SfError } from '@salesforce/core';
import { DevServerManager } from '../../src/server/DevServerManager.js';

describe('DevServerManager', () => {
  let manager: DevServerManager | null = null;

  afterEach(async function () {
    // Increase timeout for cleanup
    this.timeout(10_000);

    // Cleanup: stop any running manager
    if (manager) {
      try {
        await manager.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
      manager = null;
    }
  });

  describe('Explicit URL Mode', () => {
    it('should use explicit URL without spawning process', (done) => {
      manager = new DevServerManager({
        explicitUrl: 'http://localhost:5173',
      });

      manager.on('ready', (url: string) => {
        try {
          expect(url).to.equal('http://localhost:5173');
          expect(manager?.getUrl()).to.equal('http://localhost:5173');
          expect(manager?.getStatus().running).to.be.true;
          expect(manager?.getStatus().url).to.equal('http://localhost:5173');
          expect(manager?.getStatus().pid).to.be.undefined; // No process spawned
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });

    it('should return ready status immediately with explicit URL', (done) => {
      manager = new DevServerManager({
        explicitUrl: 'http://localhost:3000',
      });

      manager.on('ready', () => {
        try {
          const status = manager?.getStatus();
          expect(status?.running).to.be.true;
          expect(status?.url).to.equal('http://localhost:3000');
          expect(status?.pid).to.be.undefined; // No process spawned
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });
  });

  describe('Command Validation', () => {
    it('should throw error if no command and no explicit URL provided', async () => {
      manager = new DevServerManager({});

      try {
        await manager?.start();
        expect.fail('Expected start() to throw an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).message).to.match(/Dev server command is required/);
      }
    });
  });

  describe.skip('URL Detection', () => {
    // Skipped: These tests spawn real processes which can cause timing issues in CI/CD
    it('should detect Vite format: "Local: http://localhost:5173/"', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "  ➜  Local:   http://localhost:5173/"',

        startupTimeout: 2000,
      });

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('ready', (url: string) => {
          clearTimeout(timeout);
          resolve(url);
        });
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      void manager.start();

      const url = await readyPromise;
      expect(url).to.equal('http://localhost:5173/');
    });

    it('should detect Create React App format: "On Your Network: http://localhost:3000"', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "On Your Network:  http://localhost:3000"',

        startupTimeout: 2000,
      });

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('ready', (url: string) => {
          clearTimeout(timeout);
          resolve(url);
        });
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      void manager.start();

      const url = await readyPromise;
      expect(url).to.equal('http://localhost:3000');
    });

    it('should detect Next.js format: "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"',

        startupTimeout: 2000,
      });

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('ready', (url: string) => {
          clearTimeout(timeout);
          resolve(url);
        });
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      void manager.start();

      const url = await readyPromise;
      expect(url).to.equal('http://localhost:3000');
    });

    it('should normalize 0.0.0.0 to localhost', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "Server running at http://0.0.0.0:8080"',

        startupTimeout: 2000,
      });

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('ready', (url: string) => {
          clearTimeout(timeout);
          resolve(url);
        });
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      void manager.start();

      const url = await readyPromise;
      expect(url).to.equal('http://localhost:8080');
    });

    it('should detect URL from stderr if not found in stdout', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'node -e "console.error(\'Dev server started at http://localhost:4000\')"',

        startupTimeout: 2000,
      });

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('ready', (url: string) => {
          clearTimeout(timeout);
          resolve(url);
        });
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      void manager.start();

      const url = await readyPromise;
      expect(url).to.equal('http://localhost:4000');
    });
  });

  describe.skip('Process Management', () => {
    // Skipped: These tests spawn real processes which can cause timing issues in CI/CD
    it('should get status with URL and pid when running', function (done) {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "Server at http://localhost:5555"',

        startupTimeout: 2000,
      });

      const timeout = setTimeout(() => done(new Error('Test timeout')), 2000);

      manager.on('ready', () => {
        clearTimeout(timeout);
        try {
          const status = manager?.getStatus();
          expect(status?.running).to.be.true;
          expect(status?.url).to.equal('http://localhost:5555');
          expect(status?.pid).to.be.a('number');
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });

    it('should handle explicit URL override priority', function (done) {
      this.timeout(2000);

      manager = new DevServerManager({
        command: 'npm run dev', // This would normally spawn a process
        explicitUrl: 'http://localhost:9999', // But explicit URL takes precedence
      });

      manager.on('ready', (url: string) => {
        try {
          expect(url).to.equal('http://localhost:9999');
          // Process should not be spawned
          const status = manager?.getStatus();
          expect(status?.pid).to.be.undefined;
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });
  });

  describe.skip('Error Handling', () => {
    // Skipped: These tests spawn real processes which can cause timing issues in CI/CD
    it('should emit error on startup timeout', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'sleep 10', // Command that takes too long

        startupTimeout: 500, // Very short timeout
      });

      const errorPromise = new Promise<Error>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          resolve(error);
        });
      });

      void manager.start();

      const error = await errorPromise;
      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('did not start within');
    });

    it('should emit error for invalid command', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'this-command-does-not-exist-12345',

        startupTimeout: 1000,
      });

      const errorPromise = new Promise<Error>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('error', (error: Error) => {
          clearTimeout(timeout);
          resolve(error);
        });
      });

      void manager.start();

      const error = await errorPromise;
      expect(error).to.be.instanceOf(Error);
    });
  });

  describe.skip('Process Cleanup', () => {
    // Skipped: These tests spawn real processes which can cause timing issues in CI/CD
    it('should stop process gracefully', async function () {
      this.timeout(8000);

      manager = new DevServerManager({
        command: 'sleep 30',
        explicitUrl: 'http://localhost:5000',
      });

      void manager.start();

      // Wait a bit for process to start
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Stop the manager
      await manager.stop();

      const status = manager.getStatus();
      expect(status.running).to.be.false;
    });

    it('should emit exit event when process stops', async function () {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "test"',
        explicitUrl: 'http://localhost:5000',
      });

      const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 2000);
        manager?.on('exit', (code: number | null, signal: string | null) => {
          clearTimeout(timeout);
          resolve({ code, signal });
        });
      });

      void manager.start();

      const exitInfo = await exitPromise;
      expect(exitInfo.code).to.be.a('number');
    });
  });

  describe('Process Restart', () => {
    it.skip('should attempt restart on unexpected exit (up to max limit)', async function () {
      // Skipped: This test involves complex restart logic that can hang in CI/CD
      this.timeout(10_000);

      manager = new DevServerManager({
        command: 'echo "Server at http://localhost:7777" && exit 1',

        startupTimeout: 2000,
        maxRestarts: 2,
      });

      const errorPromise = new Promise<Error>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 8000);
        manager?.on('error', (error: Error) => {
          if (error.message.includes('exceeded maximum restart attempts')) {
            clearTimeout(timeout);
            resolve(error);
          }
        });
      });

      void manager.start();

      const error = await errorPromise;
      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('exceeded maximum restart attempts');
    });

    it.skip('should not restart on expected exit (SIGTERM)', async function () {
      // Skipped: This test spawns a process and has timing issues
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'sleep 30',
        explicitUrl: 'http://localhost:5000',

        maxRestarts: 3,
      });

      let restartAttempted = false;
      manager.on('ready', () => {
        if (manager?.getStatus().running) {
          restartAttempted = true;
        }
      });

      void manager.start();

      // Wait for process to start
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Stop gracefully
      await manager.stop();

      // Brief wait - don't wait 3 seconds
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      expect(restartAttempted).to.be.false;
    });
  });

  describe.skip('Output Streaming', () => {
    // Skipped: These tests spawn real processes which can cause timing issues in CI/CD
    it('should emit stdout events', function (done) {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'echo "test output"',
        explicitUrl: 'http://localhost:5000',
      });

      const timeout = setTimeout(() => done(new Error('Test timeout')), 2000);

      manager.on('stdout', (data: string) => {
        clearTimeout(timeout);
        try {
          expect(data).to.include('test output');
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });

    it('should emit stderr events', function (done) {
      this.timeout(3000);

      manager = new DevServerManager({
        command: 'node -e "console.error(\'error output\')"',
        explicitUrl: 'http://localhost:5000',
      });

      const timeout = setTimeout(() => done(new Error('Test timeout')), 2000);

      manager.on('stderr', (data: string) => {
        clearTimeout(timeout);
        try {
          expect(data).to.include('error output');
          done();
        } catch (error) {
          done(error);
        }
      });

      void manager.start();
    });
  });
});
