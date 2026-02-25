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
import { SfError, SfProject } from '@salesforce/core';
import { DEFAULT_DEV_COMMAND, discoverWebapp } from '../../src/config/webappDiscovery.js';

describe('webappDiscovery', () => {
  const testDir = join(process.cwd(), '.test-webapp-discovery');

  // Standard SFDX webapplications path
  const sfdxWebappsPath = join(testDir, 'force-app', 'main', 'default', 'webapplications');

  // Store original resolveProjectPath
  let originalResolveProjectPath: typeof SfProject.resolveProjectPath;

  /**
   * Helper to create a valid webapp directory with required .webapplication-meta.xml
   */
  function createWebapp(webappsPath: string, name: string, manifest?: object): string {
    const appPath = join(webappsPath, name);
    mkdirSync(appPath, { recursive: true });
    // Create required .webapplication-meta.xml file
    writeFileSync(join(appPath, `${name}.webapplication-meta.xml`), '<WebApplication/>');
    if (manifest) {
      writeFileSync(join(appPath, 'webapplication.json'), JSON.stringify(manifest));
    }
    return appPath;
  }

  /**
   * Helper to setup SFDX project structure and mock SfProject.resolveProjectPath.
   * Creates sfdx-project.json with packageDirectories so getUniquePackageDirectories works.
   */
  function setupSfdxProject(
    packageDirs: Array<{ path: string; default?: boolean }> = [{ path: 'force-app', default: true }]
  ): void {
    // Create SFDX project structure
    mkdirSync(sfdxWebappsPath, { recursive: true });
    writeFileSync(join(testDir, 'sfdx-project.json'), JSON.stringify({ packageDirectories: packageDirs }));
    // Mock SfProject.resolveProjectPath to return testDir
    SfProject.resolveProjectPath = async () => testDir;
  }

  /**
   * Helper to mock SfProject.resolveProjectPath to throw (not in SFDX project)
   */
  function mockNotInSfdxProject(): void {
    SfProject.resolveProjectPath = async () => {
      throw new Error('Not in SFDX project');
    };
  }

  beforeEach(() => {
    // Store original - eslint-disable needed because we're intentionally storing the method for mocking
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalResolveProjectPath = SfProject.resolveProjectPath;
    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Restore original and clear cached project instances
    SfProject.resolveProjectPath = originalResolveProjectPath;
    SfProject.clearInstances();
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('DEFAULT_DEV_COMMAND', () => {
    it('should be npm run dev', () => {
      expect(DEFAULT_DEV_COMMAND).to.equal('npm run dev');
    });
  });

  describe('discoverWebapp', () => {
    it('should throw error if no webapp found (not in SFDX project)', async () => {
      mockNotInSfdxProject();

      try {
        await discoverWebapp(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNotFoundError');
        expect((error as SfError).message).to.include('No webapp found');
      }
    });

    it('should throw error if SFDX project has no webapplications folder', async () => {
      // Create SFDX project but NOT the webapplications folder
      writeFileSync(
        join(testDir, 'sfdx-project.json'),
        JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] })
      );
      SfProject.resolveProjectPath = async () => testDir;

      try {
        await discoverWebapp(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNotFoundError');
        expect((error as SfError).message).to.include('No webapplications folder found in the SFDX project');
      }
    });

    it('should throw error if webapplications folder exists but has no valid webapps', async () => {
      setupSfdxProject();
      // Create directory without .webapplication-meta.xml
      mkdirSync(join(sfdxWebappsPath, 'invalid-app'), { recursive: true });

      try {
        await discoverWebapp(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNotFoundError');
        expect((error as SfError).message).to.include('no valid webapps');
      }
    });

    it('should find webapp by name when provided', async () => {
      setupSfdxProject();
      createWebapp(sfdxWebappsPath, 'app-a');
      createWebapp(sfdxWebappsPath, 'app-b');

      const result = await discoverWebapp('app-b', testDir);

      expect(result.webapp?.name).to.equal('app-b');
      expect(result.autoSelected).to.be.false;
      expect(result.allWebapps).to.have.length(2);
    });

    it('should throw error if named webapp not found', async () => {
      setupSfdxProject();
      createWebapp(sfdxWebappsPath, 'my-app');

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
      mkdirSync(webappsPath, { recursive: true });
      const myAppPath = createWebapp(webappsPath, 'my-app');
      createWebapp(webappsPath, 'other-app');

      const result = await discoverWebapp(undefined, myAppPath);

      expect(result.webapp?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should auto-select webapp when inside subfolder', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(webappsPath, { recursive: true });
      const myAppPath = createWebapp(webappsPath, 'my-app');
      const srcPath = join(myAppPath, 'src');
      mkdirSync(srcPath, { recursive: true });
      createWebapp(webappsPath, 'other-app');

      const result = await discoverWebapp(undefined, srcPath);

      expect(result.webapp?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should use meta.xml name (manifest.name is not used)', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(webappsPath, { recursive: true });
      const myAppPath = createWebapp(webappsPath, 'folder-name', { name: 'ManifestName' });
      createWebapp(webappsPath, 'other-app');

      const result = await discoverWebapp(undefined, myAppPath);

      // Name comes from .webapplication-meta.xml (folder-name), not manifest.name
      expect(result.webapp?.name).to.equal('folder-name');
      expect(result.autoSelected).to.be.true;
    });

    it('should return null webapp for single webapp at project root (always prompt)', async () => {
      setupSfdxProject();
      createWebapp(sfdxWebappsPath, 'only-app');

      const result = await discoverWebapp(undefined, testDir);

      // Now returns null to prompt even for single webapp (reviewer feedback)
      expect(result.webapp).to.be.null;
      expect(result.autoSelected).to.be.false;
      expect(result.allWebapps).to.have.length(1);
    });

    it('should return null webapp for multiple webapps (selection needed)', async () => {
      setupSfdxProject();
      createWebapp(sfdxWebappsPath, 'app-a');
      createWebapp(sfdxWebappsPath, 'app-b');

      const result = await discoverWebapp(undefined, testDir);

      expect(result.webapp).to.be.null;
      expect(result.autoSelected).to.be.false;
      expect(result.allWebapps).to.have.length(2);
    });

    it('should throw error when --name conflicts with current webapp directory', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(webappsPath, { recursive: true });
      const currentAppPath = createWebapp(webappsPath, 'current-app');
      createWebapp(webappsPath, 'other-app');

      try {
        // Inside current-app but specifying --name other-app
        await discoverWebapp('other-app', currentAppPath);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('WebappNameConflictError');
        expect((error as SfError).message).to.include('current-app');
        expect((error as SfError).message).to.include('other-app');
      }
    });

    it('should allow --name matching current webapp directory', async () => {
      const webappsPath = join(testDir, 'webapplications');
      mkdirSync(webappsPath, { recursive: true });
      const currentAppPath = createWebapp(webappsPath, 'current-app');
      createWebapp(webappsPath, 'other-app');

      // Inside current-app and specifying --name current-app (should work)
      const result = await discoverWebapp('current-app', currentAppPath);

      expect(result.webapp?.name).to.equal('current-app');
      expect(result.autoSelected).to.be.false;
    });

    it('should recognize webapp by .webapplication-meta.xml file', async () => {
      setupSfdxProject();

      // Create directory with .webapplication-meta.xml
      const validAppPath = join(sfdxWebappsPath, 'valid-app');
      mkdirSync(validAppPath, { recursive: true });
      writeFileSync(join(validAppPath, 'valid-app.webapplication-meta.xml'), '<WebApplication/>');

      // Create directory without .webapplication-meta.xml (should be ignored)
      const invalidAppPath = join(sfdxWebappsPath, 'invalid-app');
      mkdirSync(invalidAppPath, { recursive: true });

      const result = await discoverWebapp(undefined, testDir);

      // Only valid-app should be discovered
      expect(result.allWebapps).to.have.length(1);
      expect(result.allWebapps[0].name).to.equal('valid-app');
      expect(result.allWebapps[0].hasMetaXml).to.be.true;
    });

    it('should use standalone webapp when current dir has .webapplication-meta.xml', async () => {
      mockNotInSfdxProject();

      // Create a standalone webapp directory (not in webapplications folder)
      const standaloneDir = join(testDir, 'standalone-app');
      mkdirSync(standaloneDir, { recursive: true });
      writeFileSync(join(standaloneDir, 'standalone-app.webapplication-meta.xml'), '<WebApplication/>');

      const result = await discoverWebapp(undefined, standaloneDir);

      expect(result.webapp?.name).to.equal('standalone-app');
      expect(result.allWebapps).to.have.length(1);
    });

    it('should discover webapps from multiple package directories', async () => {
      // Create project with two packages: force-app and packages/einstein
      const einsteinWebappsPath = join(testDir, 'packages', 'einstein', 'main', 'default', 'webapplications');
      mkdirSync(einsteinWebappsPath, { recursive: true });
      setupSfdxProject([
        { path: 'force-app', default: true },
        { path: 'packages/einstein', default: false },
      ]);
      createWebapp(sfdxWebappsPath, 'force-app-webapp');
      createWebapp(einsteinWebappsPath, 'einstein-webapp');

      const result = await discoverWebapp(undefined, testDir);

      expect(result.allWebapps).to.have.length(2);
      const names = result.allWebapps.map((w) => w.name).sort();
      expect(names).to.deep.equal(['einstein-webapp', 'force-app-webapp']);
    });

    it('should warn and use first match when directory has multiple .webapplication-meta.xml files', async () => {
      setupSfdxProject();

      // Create webapp directory with multiple metadata files (misconfiguration)
      const multiMetaPath = join(sfdxWebappsPath, 'multi-meta-app');
      mkdirSync(multiMetaPath, { recursive: true });
      writeFileSync(join(multiMetaPath, 'alpha.webapplication-meta.xml'), '<WebApplication/>');
      writeFileSync(join(multiMetaPath, 'beta.webapplication-meta.xml'), '<WebApplication/>');

      const result = await discoverWebapp(undefined, testDir);

      // Discovery should succeed - uses first match (order depends on readdir)
      expect(result.allWebapps).to.have.length(1);
      expect(['alpha', 'beta']).to.include(result.allWebapps[0].name);
    });
  });
});
