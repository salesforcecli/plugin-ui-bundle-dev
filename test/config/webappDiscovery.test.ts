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

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'chai';
import { SfError } from '@salesforce/core';
import { TestContext } from '@salesforce/core/testSetup';
import { DEFAULT_DEV_COMMAND, discoverWebapp } from '../../src/config/webappDiscovery.js';

describe('webappDiscovery', () => {
  const $$ = new TestContext();
  const testDir = join(process.cwd(), '.test-webapp-discovery');

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    $$.restore();
  });

  describe('DEFAULT_DEV_COMMAND', () => {
    it('should be npm run dev', () => {
      expect(DEFAULT_DEV_COMMAND).to.equal('npm run dev');
    });
  });

  describe('discoverWebapp', () => {
    it('should throw error if no webapplications folder found', async () => {
      try {
        await discoverWebapp(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNotFoundError');
        expect((error as SfError).message).to.include('No webapplications folder found');
      }
    });

    it('should throw error if webapplications folder exists but is empty', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(webappsPath, { recursive: true });

      try {
        await discoverWebapp(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNotFoundError');
        expect((error as SfError).message).to.include('Found "webapplications" folder but no webapps inside it');
        expect((error as SfError).message).to.not.include('No webapplications folder found');
      }
    });

    it('should find webapp by name when provided', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(join(webappsPath, 'app-a'), { recursive: true });
      mkdirSync(join(webappsPath, 'app-b'), { recursive: true });

      const result = await discoverWebapp('app-b', testDir);

      expect(result.webapp?.name).to.equal('app-b');
      expect(result.autoSelected).to.be.false;
      expect(result.allWebapps).to.have.length(2);
    });

    it('should throw error if named webapp not found', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(join(webappsPath, 'my-app'), { recursive: true });

      try {
        await discoverWebapp('non-existent', testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNameNotFoundError');
        expect((error as SfError).message).to.include('No webapp found with name');
        expect((error as SfError).message).to.include('my-app');
      }
    });

    it('should auto-select webapp when inside its folder', async () => {
      const webappsPath = join(testDir, 'webapplications');
      const myAppPath = join(webappsPath, 'my-app');
      mkdirSync(myAppPath, { recursive: true });
      mkdirSync(join(webappsPath, 'other-app'), { recursive: true });

      const result = await discoverWebapp(undefined, myAppPath);

      expect(result.webapp?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should auto-select webapp when inside subfolder', async () => {
      const webappsPath = join(testDir, 'webapplications');
      const myAppPath = join(webappsPath, 'my-app');
      const srcPath = join(myAppPath, 'src');
      mkdirSync(srcPath, { recursive: true });
      mkdirSync(join(webappsPath, 'other-app'), { recursive: true });

      const result = await discoverWebapp(undefined, srcPath);

      expect(result.webapp?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should auto-select by folder name when manifest name differs', async () => {
      const webappsPath = join(testDir, 'webapplications');
      const myAppPath = join(webappsPath, 'folder-name');
      mkdirSync(myAppPath, { recursive: true });
      mkdirSync(join(webappsPath, 'other-app'), { recursive: true });

      writeFileSync(join(myAppPath, 'webapplication.json'), JSON.stringify({ name: 'ManifestName' }));

      const result = await discoverWebapp(undefined, myAppPath);

      expect(result.webapp?.name).to.equal('ManifestName');
      expect(result.autoSelected).to.be.true;
    });

    it('should auto-select single webapp', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(join(webappsPath, 'only-app'), { recursive: true });

      const result = await discoverWebapp(undefined, testDir);

      expect(result.webapp?.name).to.equal('only-app');
      expect(result.autoSelected).to.be.false;
    });

    it('should return null webapp for multiple webapps (selection needed)', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(join(webappsPath, 'app-a'), { recursive: true });
      mkdirSync(join(webappsPath, 'app-b'), { recursive: true });

      const result = await discoverWebapp(undefined, testDir);

      expect(result.webapp).to.be.null;
      expect(result.autoSelected).to.be.false;
      expect(result.allWebapps).to.have.length(2);
    });

    it('should prioritize --name flag over auto-selection', async () => {
      const webappsPath = join(testDir, 'webapplications');
      const currentApp = join(webappsPath, 'current-app');
      mkdirSync(currentApp, { recursive: true });
      mkdirSync(join(webappsPath, 'other-app'), { recursive: true });

      const result = await discoverWebapp('other-app', currentApp);

      expect(result.webapp?.name).to.equal('other-app');
      expect(result.autoSelected).to.be.false;
    });
  });
});
