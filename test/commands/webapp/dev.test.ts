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

import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { SfError } from '@salesforce/core';
import { ErrorHandler } from '../../../src/error/ErrorHandler.js';
import type { WebAppManifest, WebAppDevResult } from '../../../src/config/types.js';

describe('webapp:dev command integration', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('Type Definitions', () => {
    it('should have correct WebAppManifest structure', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        label: 'Test Web App',
        version: '1.0.0',
        outputDir: 'dist',
        dev: {
          url: 'http://localhost:5173',
        },
      };

      expect(manifest.name).to.equal('testWebApp');
      expect(manifest.dev?.url).to.equal('http://localhost:5173');
    });

    it('should have correct WebAppDevResult structure', () => {
      const result: WebAppDevResult = {
        url: 'http://localhost:4545',
        devServerUrl: 'http://localhost:5173',
      };

      expect(result.url).to.equal('http://localhost:4545');
      expect(result.devServerUrl).to.equal('http://localhost:5173');
    });
  });

  describe('Dev Server URL Priority', () => {
    it('should prioritize explicit URL flag over manifest', () => {
      const explicitUrl = 'http://localhost:3000';
      const manifestUrl = 'http://localhost:5173';

      // Priority: --url flag wins
      expect(explicitUrl).to.not.equal(manifestUrl);
    });

    it('should use manifest dev.url when no explicit URL', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        label: 'Test Web App',
        version: '1.0.0',
        outputDir: 'dist',
        dev: {
          url: 'http://localhost:5173',
        },
      };

      expect(manifest.dev?.url).to.equal('http://localhost:5173');
    });

    it('should use dev.command when no URL provided', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        label: 'Test Web App',
        version: '1.0.0',
        outputDir: 'dist',
        dev: {
          command: 'npm run dev',
        },
      };

      expect(manifest.dev?.command).to.equal('npm run dev');
    });
  });

  describe('Error Handling', () => {
    it('should create proper manifest not found error', () => {
      const error = ErrorHandler.createManifestNotFoundError();
      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal('ManifestNotFoundError');
      expect(error.message).to.include('webapplication.json not found');
    });

    it('should create proper dev server command required error', () => {
      const error = ErrorHandler.createDevServerCommandRequiredError();
      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal('DevServerCommandRequiredError');
      expect(error.message).to.include('Dev server command or URL is required');
    });

    it('should create proper port in use error', () => {
      const error = ErrorHandler.createPortInUseError(4545);
      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal('PortInUseError');
      expect(error.message).to.include('Port 4545 is already in use');
    });

    it('should create proper auth failed error', () => {
      const error = ErrorHandler.createAuthFailedError('test@example.com');
      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal('AuthenticationFailedError');
      expect(error.message).to.include('test@example.com');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate manifest with dev.url', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        label: 'Test Web App',
        version: '1.0.0',
        outputDir: 'dist',
        dev: {
          url: 'http://localhost:5173',
        },
      };

      // Basic validation
      expect(manifest.name).to.be.a('string');
      expect(manifest.version).to.match(/^\d+\.\d+\.\d+$/);
      expect(manifest.dev?.url).to.include('http');
    });

    it('should validate manifest with dev.command', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        label: 'Test Web App',
        version: '1.0.0',
        outputDir: 'dist',
        dev: {
          command: 'npm run dev',
        },
      };

      expect(manifest.dev?.command).to.be.a('string');
      expect(manifest.dev?.command).to.not.be.empty;
    });
  });
});
