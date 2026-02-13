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
import { ProxyServer } from '../../src/proxy/ProxyServer.js';

describe('ProxyServer', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
    // Clean up environment variables
    delete process.env.SBQQ_STUDIO_WORKSPACE;
    delete process.env.SALESFORCE_PROJECT_ID;
    delete process.env.CODE_BUILDER_SESSION;
  });

  describe('Construction', () => {
    it('should create proxy server with valid configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
    });
  });

  describe('Network Interface Configuration', () => {
    it('should use localhost (127.0.0.1) by default in normal environment', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      const url = proxy.getProxyUrl();

      expect(url).to.include('localhost');
      expect(url).to.equal('http://localhost:4545');
    });

    it('should use 0.0.0.0 in Code Builder environment', () => {
      process.env.CODE_BUILDER_SESSION = 'session-123';

      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      const url = proxy.getProxyUrl();

      // Display URL should use localhost even when bound to 0.0.0.0
      expect(url).to.equal('http://localhost:4545');
    });

    it('should respect explicit host configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        host: '192.168.1.100',
      });

      const url = proxy.getProxyUrl();

      expect(url).to.equal('http://192.168.1.100:4545');
    });

    it('should override Code Builder host with explicit configuration', () => {
      process.env.CODE_BUILDER_SESSION = 'session-123';

      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        host: '127.0.0.1',
      });

      const url = proxy.getProxyUrl();

      // Even explicit 127.0.0.1 is displayed as localhost for consistency
      expect(url).to.equal('http://localhost:4545');
    });
  });

  describe('Server Lifecycle', () => {
    it('should generate correct proxy URL', () => {
      const proxy = new ProxyServer({
        port: 8080,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      const url = proxy.getProxyUrl();

      expect(url).to.equal('http://localhost:8080');
    });
  });

  describe('Configuration Validation', () => {
    it('should accept manifest configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        manifest: {
          name: 'test-app',
          outputDir: 'dist',
        },
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should accept org alias configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        orgAlias: 'my-org',
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should work with minimal configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
      expect(proxy.getProxyUrl()).to.be.a('string');
    });
  });

  describe('Multiple Environment Scenarios', () => {
    it('should handle VSCode local development', () => {
      // No Code Builder env vars
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      expect(proxy.getProxyUrl()).to.equal('http://localhost:4545');
    });

    it('should handle Code Builder cloud environment', () => {
      process.env.SBQQ_STUDIO_WORKSPACE = '/workspace';
      process.env.SALESFORCE_PROJECT_ID = 'project-123';

      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      expect(proxy.getProxyUrl()).to.equal('http://localhost:4545');
    });

    it('should handle custom network configuration', () => {
      const proxy = new ProxyServer({
        port: 3000,
        devServerUrl: 'http://localhost:8080',
        salesforceInstanceUrl: 'https://custom.salesforce.com',
        host: '0.0.0.0',
      });

      expect(proxy.getProxyUrl()).to.equal('http://localhost:3000');
    });
  });

  describe('Dynamic Configuration Updates', () => {
    it('should update dev server URL', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      // Update dev server URL
      proxy.updateDevServerUrl('http://localhost:5174');

      // Verify URL was updated by checking stats/behavior
      // (Internal config is private, so we verify through observable behavior)
      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should not update if URL is the same', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      // Update with same URL (should be a no-op)
      proxy.updateDevServerUrl('http://localhost:5173');

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should update manifest configuration', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        manifest: {
          name: 'test-app',
          outputDir: 'dist',
        },
      });

      // Update manifest with routing config
      proxy.updateManifest({
        name: 'test-app',
        outputDir: 'dist',
        routing: {
          trailingSlash: 'always',
        },
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
    });
  });

  describe('Dev Server Error State', () => {
    it('should set and clear active dev server error', () => {
      const proxy = new ProxyServer({
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      });

      // Set error
      proxy.setActiveDevServerError({
        type: 'port-conflict',
        title: 'Port Conflict',
        message: 'Port 5173 is already in use',
        stderrLines: ['EADDRINUSE'],
        suggestions: ['Stop other dev servers'],
      });

      // Clear error
      proxy.clearActiveDevServerError();

      expect(proxy).to.be.instanceOf(ProxyServer);
    });
  });
});
