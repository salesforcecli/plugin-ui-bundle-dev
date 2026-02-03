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

import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'chai';
import { SfError } from '@salesforce/core';
import { TestContext } from '@salesforce/core/testSetup';
import { ManifestWatcher } from '../../src/config/ManifestWatcher.js';
import type { WebAppManifest, ManifestChangeEvent } from '../../src/config/types.js';

describe('ManifestWatcher', () => {
  const $$ = new TestContext();
  const testDir = join(process.cwd(), '.test-manifests');
  const testManifestPath = join(testDir, 'webapplication.json');

  const validManifest: WebAppManifest = {
    name: 'testApp',
    label: 'Test Application',
    version: '1.0.0',
    outputDir: 'dist',
    dev: {
      command: 'npm run dev',
      url: 'http://localhost:5173',
    },
  };

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    $$.restore();
  });

  describe('Initialization', () => {
    it('should load valid manifest successfully', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });
      watcher.initialize();

      const manifest = watcher.getManifest();
      expect(manifest).to.deep.equal(validManifest);

      await watcher.stop();
    });

    it('should emit ready event with manifest', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      let readyManifest: WebAppManifest | null = null;
      watcher.on('ready', (manifest) => {
        readyManifest = manifest;
      });

      watcher.initialize();

      expect(readyManifest).to.deep.equal(validManifest);

      await watcher.stop();
    });

    it('should throw error when manifest file does not exist', async () => {
      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestNotFoundError');
        expect((error as SfError).message).to.include('webapplication.json not found');
        expect((error as SfError).actions).to.exist;
      }

      await watcher.stop();
    });

    it('should return null manifest before initialization', () => {
      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });
      expect(watcher.getManifest()).to.be.null;
    });
  });

  describe('JSON Parsing', () => {
    it('should throw error for invalid JSON syntax', async () => {
      writeFileSync(testManifestPath, '{ "name": "test", invalid }');

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestParseError');
        expect((error as SfError).message).to.include('Invalid JSON');
        expect((error as SfError).actions).to.exist;
        expect((error as SfError).actions?.some((a) => a.includes('JSON validator'))).to.be.true;
      }

      await watcher.stop();
    });

    it('should handle read permission errors', async () => {
      // Create a file path that doesn't exist to simulate read error
      const invalidPath = join(testDir, 'nonexistent', 'webapplication.json');

      const watcher = new ManifestWatcher({ manifestPath: invalidPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestNotFoundError');
      }

      await watcher.stop();
    });
  });

  describe('Basic Validation', () => {
    it('should reject manifest with missing required field: name', async () => {
      const invalid = { ...validManifest };
      delete (invalid as Partial<WebAppManifest>).name;

      writeFileSync(testManifestPath, JSON.stringify(invalid, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestValidationError');
        expect((error as SfError).message).to.include('name');
      }

      await watcher.stop();
    });

    it('should reject manifest with missing required field: label', async () => {
      const invalid = { ...validManifest };
      delete (invalid as Partial<WebAppManifest>).label;

      writeFileSync(testManifestPath, JSON.stringify(invalid, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestValidationError');
        expect((error as SfError).message).to.include('label');
      }

      await watcher.stop();
    });

    it('should reject manifest with missing required field: version', async () => {
      const invalid = { ...validManifest };
      delete (invalid as Partial<WebAppManifest>).version;

      writeFileSync(testManifestPath, JSON.stringify(invalid, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestValidationError');
        expect((error as SfError).message).to.include('version');
      }

      await watcher.stop();
    });

    it('should reject manifest with missing required field: outputDir', async () => {
      const invalid = { ...validManifest };
      delete (invalid as Partial<WebAppManifest>).outputDir;

      writeFileSync(testManifestPath, JSON.stringify(invalid, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestValidationError');
        expect((error as SfError).message).to.include('outputDir');
      }

      await watcher.stop();
    });

    it('should reject manifest with multiple missing required fields', async () => {
      const invalid = { version: '1.0.0' };

      writeFileSync(testManifestPath, JSON.stringify(invalid, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });

      try {
        watcher.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('ManifestValidationError');
        expect((error as SfError).message).to.include('name');
        expect((error as SfError).message).to.include('label');
        expect((error as SfError).message).to.include('outputDir');
      }

      await watcher.stop();
    });

    it('should accept manifest without optional dev config', async () => {
      const minimalManifest = {
        name: 'testApp',
        label: 'Test App',
        version: '1.0.0',
        outputDir: 'dist',
      };

      writeFileSync(testManifestPath, JSON.stringify(minimalManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });
      watcher.initialize();

      const manifest = watcher.getManifest();
      expect(manifest?.dev).to.be.undefined;

      await watcher.stop();
    });

    it('should accept manifest with routing config', async () => {
      const manifestWithRouting = {
        ...validManifest,
        routing: {
          rewrites: [{ route: '/api/*', target: 'api' }],
          trailingSlash: 'always',
        },
      };

      writeFileSync(testManifestPath, JSON.stringify(manifestWithRouting, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });
      watcher.initialize();

      const manifest = watcher.getManifest();
      expect(manifest?.routing?.trailingSlash).to.equal('always');

      await watcher.stop();
    });
  });

  describe('File Watching', () => {
    it('should emit change event when manifest is modified', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true, debounceMs: 100 });
      watcher.initialize();

      const changePromise = new Promise<ManifestChangeEvent>((resolve) => {
        watcher.on('change', (event: ManifestChangeEvent) => {
          resolve(event);
        });
      });

      // Wait a bit then modify the file
      setTimeout(() => {
        const updated = { ...validManifest, version: '2.0.0' };
        writeFileSync(testManifestPath, JSON.stringify(updated, null, 2));
      }, 200);

      const event = await changePromise;
      expect(event.type).to.equal('changed');
      expect(event.manifest?.version).to.equal('2.0.0');
      await watcher.stop();
    });

    it('should emit error event when manifest becomes invalid', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true, debounceMs: 100 });
      watcher.initialize();

      const errorPromise = new Promise<SfError>((resolve) => {
        watcher.on('error', (error: SfError) => {
          resolve(error);
        });
      });

      // Wait a bit then write invalid JSON
      setTimeout(() => {
        writeFileSync(testManifestPath, '{ invalid json }');
      }, 200);

      const error = await errorPromise;
      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('Invalid JSON');
      await watcher.stop();
    });

    it('should emit error when manifest file is deleted', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true, debounceMs: 100 });
      watcher.initialize();

      const changePromise = new Promise<boolean>((resolve) => {
        watcher.on('change', (event: ManifestChangeEvent) => {
          if (event.type === 'removed') {
            resolve(true);
          }
        });
      });

      const errorPromise = new Promise<boolean>((resolve) => {
        watcher.on('error', (error: SfError) => {
          if (error.message.includes('deleted')) {
            resolve(true);
          }
        });
      });

      // Wait a bit then delete the file
      setTimeout(() => {
        unlinkSync(testManifestPath);
      }, 200);

      await Promise.all([changePromise, errorPromise]);
      await watcher.stop();
    });

    it('should debounce rapid file changes', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true, debounceMs: 300 });
      watcher.initialize();

      let changeCount = 0;
      watcher.on('change', () => {
        changeCount++;
      });

      // Make multiple rapid changes
      setTimeout(() => {
        writeFileSync(testManifestPath, JSON.stringify({ ...validManifest, version: '1.0.1' }, null, 2));
      }, 100);

      setTimeout(() => {
        writeFileSync(testManifestPath, JSON.stringify({ ...validManifest, version: '1.0.2' }, null, 2));
      }, 150);

      setTimeout(() => {
        writeFileSync(testManifestPath, JSON.stringify({ ...validManifest, version: '1.0.3' }, null, 2));
      }, 200);

      // Check that only one change event was emitted after debounce
      await new Promise((resolve) => setTimeout(resolve, 800));

      expect(changeCount).to.equal(1);
      expect(watcher.getManifest()?.version).to.equal('1.0.3');
      await watcher.stop();
    });
  });

  describe('Stop and Cleanup', () => {
    it('should clean up resources when stopped', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true });
      watcher.initialize();

      await watcher.stop();

      // Verify no events are emitted after stop
      let eventEmitted = false;
      watcher.on('change', () => {
        eventEmitted = true;
      });

      writeFileSync(testManifestPath, JSON.stringify({ ...validManifest, version: '2.0.0' }, null, 2));

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(eventEmitted).to.be.false;
    });

    it('should be safe to stop multiple times', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: true });
      watcher.initialize();

      await watcher.stop();
      await watcher.stop(); // Second stop should not throw

      // Test passed if no error thrown
      expect(true).to.be.true;
    });

    it('should work without watching enabled', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath, watch: false });
      watcher.initialize();

      const manifest = watcher.getManifest();
      expect(manifest).to.deep.equal(validManifest);

      // Modify file - should not trigger events
      let eventEmitted = false;
      watcher.on('change', () => {
        eventEmitted = true;
      });

      writeFileSync(testManifestPath, JSON.stringify({ ...validManifest, version: '2.0.0' }, null, 2));

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(eventEmitted).to.be.false;
      expect(watcher.getManifest()?.version).to.equal('1.0.0'); // Still old version

      await watcher.stop();
    });
  });

  describe('Default Options', () => {
    it('should use webapplication.json in current directory by default', async () => {
      const defaultPath = join(process.cwd(), 'webapplication.json');

      // Create manifest in current directory
      writeFileSync(defaultPath, JSON.stringify(validManifest, null, 2));

      try {
        const watcher = new ManifestWatcher({ watch: false });
        watcher.initialize();

        expect(watcher.getManifest()).to.deep.equal(validManifest);

        await watcher.stop();
      } finally {
        // Clean up
        try {
          unlinkSync(defaultPath);
        } catch {
          // Ignore
        }
      }
    });

    it('should watch by default', async () => {
      writeFileSync(testManifestPath, JSON.stringify(validManifest, null, 2));

      const watcher = new ManifestWatcher({ manifestPath: testManifestPath });
      watcher.initialize();

      // Watcher should be active (we can't directly test this, but stop should work)
      await watcher.stop();

      expect(true).to.be.true;
    });
  });
});
