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
import { DEFAULT_DEV_COMMAND, discoverUiBundle, UI_BUNDLES_FOLDER } from '../../src/config/webappDiscovery.js';

describe('webappDiscovery', () => {
  const testDir = join(process.cwd(), '.test-uiBundle-discovery');

  // Standard SFDX uiBundles path
  const sfdxUiBundlesPath = join(testDir, 'force-app', 'main', 'default', UI_BUNDLES_FOLDER);

  // Store original resolveProjectPath
  let originalResolveProjectPath: typeof SfProject.resolveProjectPath;

  /**
   * Helper to create a valid uiBundle directory with required .uibundle-meta.xml
   */
  function createUiBundle(uiBundlesPath: string, name: string, manifest?: object): string {
    const appPath = join(uiBundlesPath, name);
    mkdirSync(appPath, { recursive: true });
    // Create required .uibundle-meta.xml file
    writeFileSync(join(appPath, `${name}.uibundle-meta.xml`), '<UiBundle/>');
    if (manifest) {
      writeFileSync(join(appPath, 'ui-bundle.json'), JSON.stringify(manifest));
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
    mkdirSync(sfdxUiBundlesPath, { recursive: true });
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

  describe('discoverUiBundle', () => {
    it('should throw error if no uiBundle found (not in SFDX project)', async () => {
      mockNotInSfdxProject();

      try {
        await discoverUiBundle(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('UiBundleNotFoundError');
        expect((error as SfError).message).to.include('No uiBundle found');
      }
    });

    it('should throw error if SFDX project has no uiBundles folder', async () => {
      // Create SFDX project but NOT the uiBundles folder
      writeFileSync(
        join(testDir, 'sfdx-project.json'),
        JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] })
      );
      SfProject.resolveProjectPath = async () => testDir;

      try {
        await discoverUiBundle(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('UiBundleNotFoundError');
        expect((error as SfError).message).to.include('No uiBundles folder found in the SFDX project');
      }
    });

    it('should throw error if uiBundles folder exists but has no valid uiBundles', async () => {
      setupSfdxProject();
      // Create directory without .uibundle-meta.xml
      mkdirSync(join(sfdxUiBundlesPath, 'invalid-app'), { recursive: true });

      try {
        await discoverUiBundle(undefined, testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('UiBundleNotFoundError');
        expect((error as SfError).message).to.include('no valid uiBundles');
      }
    });

    it('should find uiBundle by name when provided', async () => {
      setupSfdxProject();
      createUiBundle(sfdxUiBundlesPath, 'app-a');
      createUiBundle(sfdxUiBundlesPath, 'app-b');

      const result = await discoverUiBundle('app-b', testDir);

      expect(result.uiBundle?.name).to.equal('app-b');
      expect(result.autoSelected).to.be.false;
      expect(result.allUiBundles).to.have.length(2);
    });

    it('should throw error if named uiBundle not found', async () => {
      setupSfdxProject();
      createUiBundle(sfdxUiBundlesPath, 'my-app');

      try {
        await discoverUiBundle('non-existent', testDir);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('UiBundleNameNotFoundError');
        expect((error as SfError).message).to.include('No uiBundle found with name');
        expect((error as SfError).message).to.include('my-app');
      }
    });

    it('should auto-select uiBundle when inside its folder', async () => {
      const uiBundlesPath = join(testDir, UI_BUNDLES_FOLDER);
      mkdirSync(uiBundlesPath, { recursive: true });
      const myAppPath = createUiBundle(uiBundlesPath, 'my-app');
      createUiBundle(uiBundlesPath, 'other-app');

      const result = await discoverUiBundle(undefined, myAppPath);

      expect(result.uiBundle?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should auto-select uiBundle when inside subfolder', async () => {
      const uiBundlesPath = join(testDir, UI_BUNDLES_FOLDER);
      mkdirSync(uiBundlesPath, { recursive: true });
      const myAppPath = createUiBundle(uiBundlesPath, 'my-app');
      const srcPath = join(myAppPath, 'src');
      mkdirSync(srcPath, { recursive: true });
      createUiBundle(uiBundlesPath, 'other-app');

      const result = await discoverUiBundle(undefined, srcPath);

      expect(result.uiBundle?.name).to.equal('my-app');
      expect(result.autoSelected).to.be.true;
    });

    it('should use meta.xml name (manifest.name is not used)', async () => {
      const uiBundlesPath = join(testDir, UI_BUNDLES_FOLDER);
      mkdirSync(uiBundlesPath, { recursive: true });
      const myAppPath = createUiBundle(uiBundlesPath, 'folder-name', { name: 'ManifestName' });
      createUiBundle(uiBundlesPath, 'other-app');

      const result = await discoverUiBundle(undefined, myAppPath);

      // Name comes from .uibundle-meta.xml (folder-name), not manifest.name
      expect(result.uiBundle?.name).to.equal('folder-name');
      expect(result.autoSelected).to.be.true;
    });

    it('should return null uiBundle for single uiBundle at project root (always prompt)', async () => {
      setupSfdxProject();
      createUiBundle(sfdxUiBundlesPath, 'only-app');

      const result = await discoverUiBundle(undefined, testDir);

      // Now returns null to prompt even for single uiBundle (reviewer feedback)
      expect(result.uiBundle).to.be.null;
      expect(result.autoSelected).to.be.false;
      expect(result.allUiBundles).to.have.length(1);
    });

    it('should return null uiBundle for multiple uiBundles (selection needed)', async () => {
      setupSfdxProject();
      createUiBundle(sfdxUiBundlesPath, 'app-a');
      createUiBundle(sfdxUiBundlesPath, 'app-b');

      const result = await discoverUiBundle(undefined, testDir);

      expect(result.uiBundle).to.be.null;
      expect(result.autoSelected).to.be.false;
      expect(result.allUiBundles).to.have.length(2);
    });

    it('should throw error when --name conflicts with current uiBundle directory', async () => {
      const uiBundlesPath = join(testDir, UI_BUNDLES_FOLDER);
      mkdirSync(uiBundlesPath, { recursive: true });
      const currentAppPath = createUiBundle(uiBundlesPath, 'current-app');
      createUiBundle(uiBundlesPath, 'other-app');

      try {
        // Inside current-app but specifying --name other-app
        await discoverUiBundle('other-app', currentAppPath);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('UiBundleNameConflictError');
        expect((error as SfError).message).to.include('current-app');
        expect((error as SfError).message).to.include('other-app');
      }
    });

    it('should allow --name matching current uiBundle directory', async () => {
      const uiBundlesPath = join(testDir, UI_BUNDLES_FOLDER);
      mkdirSync(uiBundlesPath, { recursive: true });
      const currentAppPath = createUiBundle(uiBundlesPath, 'current-app');
      createUiBundle(uiBundlesPath, 'other-app');

      // Inside current-app and specifying --name current-app (should work)
      const result = await discoverUiBundle('current-app', currentAppPath);

      expect(result.uiBundle?.name).to.equal('current-app');
      expect(result.autoSelected).to.be.false;
    });

    it('should recognize uiBundle by .uibundle-meta.xml file', async () => {
      setupSfdxProject();

      // Create directory with .uibundle-meta.xml
      const validAppPath = join(sfdxUiBundlesPath, 'valid-app');
      mkdirSync(validAppPath, { recursive: true });
      writeFileSync(join(validAppPath, 'valid-app.uibundle-meta.xml'), '<UiBundle/>');

      // Create directory without .uibundle-meta.xml (should be ignored)
      const invalidAppPath = join(sfdxUiBundlesPath, 'invalid-app');
      mkdirSync(invalidAppPath, { recursive: true });

      const result = await discoverUiBundle(undefined, testDir);

      // Only valid-app should be discovered
      expect(result.allUiBundles).to.have.length(1);
      expect(result.allUiBundles[0].name).to.equal('valid-app');
      expect(result.allUiBundles[0].hasMetaXml).to.be.true;
    });

    it('should use standalone uiBundle when current dir has .uibundle-meta.xml', async () => {
      mockNotInSfdxProject();

      // Create a standalone uiBundle directory (not in uiBundles folder)
      const standaloneDir = join(testDir, 'standalone-app');
      mkdirSync(standaloneDir, { recursive: true });
      writeFileSync(join(standaloneDir, 'standalone-app.uibundle-meta.xml'), '<UiBundle/>');

      const result = await discoverUiBundle(undefined, standaloneDir);

      expect(result.uiBundle?.name).to.equal('standalone-app');
      expect(result.allUiBundles).to.have.length(1);
    });

    it('should discover uiBundles from multiple package directories', async () => {
      // Create project with two packages: force-app and packages/einstein
      const einsteinWebappsPath = join(testDir, 'packages', 'einstein', 'main', 'default', UI_BUNDLES_FOLDER);
      mkdirSync(einsteinWebappsPath, { recursive: true });
      setupSfdxProject([
        { path: 'force-app', default: true },
        { path: 'packages/einstein', default: false },
      ]);
      createUiBundle(sfdxUiBundlesPath, 'force-app-uiBundle');
      createUiBundle(einsteinWebappsPath, 'einstein-uiBundle');

      const result = await discoverUiBundle(undefined, testDir);

      expect(result.allUiBundles).to.have.length(2);
      const names = result.allUiBundles.map((w) => w.name).sort();
      expect(names).to.deep.equal(['einstein-uiBundle', 'force-app-uiBundle']);
    });

    it('should warn and use first match when directory has multiple .uibundle-meta.xml files', async () => {
      setupSfdxProject();

      // Create uiBundle directory with multiple metadata files (misconfiguration)
      const multiMetaPath = join(sfdxUiBundlesPath, 'multi-meta-app');
      mkdirSync(multiMetaPath, { recursive: true });
      writeFileSync(join(multiMetaPath, 'alpha.uibundle-meta.xml'), '<UiBundle/>');
      writeFileSync(join(multiMetaPath, 'beta.uibundle-meta.xml'), '<UiBundle/>');

      const result = await discoverUiBundle(undefined, testDir);

      // Discovery should succeed - uses first match (order depends on readdir)
      expect(result.allUiBundles).to.have.length(1);
      expect(['alpha', 'beta']).to.include(result.allUiBundles[0].name);
    });
  });
});
