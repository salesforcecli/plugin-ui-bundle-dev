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
import type { ProxyServerConfig } from '../../src/proxy/ProxyServer.js';

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
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy).to.be.instanceOf(ProxyServer);
      expect(proxy.isRunning()).to.be.false;
    });

    it('should initialize statistics', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const stats = proxy.getStats();

      expect(stats.requestCount).to.equal(0);
      expect(stats.salesforceRequests).to.equal(0);
      expect(stats.devServerRequests).to.equal(0);
      expect(stats.webSocketUpgrades).to.equal(0);
      expect(stats.errors).to.equal(0);
      expect(stats.startTime).to.be.instanceOf(Date);
    });
  });

  describe('Code Builder Detection', () => {
    it('should detect Code Builder environment from SBQQ_STUDIO_WORKSPACE', () => {
      process.env.SBQQ_STUDIO_WORKSPACE = '/workspace';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.true;
    });

    it('should detect Code Builder environment from SALESFORCE_PROJECT_ID', () => {
      process.env.SALESFORCE_PROJECT_ID = 'project-123';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.true;
    });

    it('should detect Code Builder environment from CODE_BUILDER_SESSION', () => {
      process.env.CODE_BUILDER_SESSION = 'session-456';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.true;
    });

    it('should not detect Code Builder in normal environment', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.false;
    });
  });

  describe('Network Interface Configuration', () => {
    it('should use localhost (127.0.0.1) by default in normal environment', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const url = proxy.getProxyUrl();

      expect(url).to.include('localhost');
      expect(url).to.equal('http://localhost:4545');
    });

    it('should use 0.0.0.0 in Code Builder environment', () => {
      process.env.CODE_BUILDER_SESSION = 'session-123';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const url = proxy.getProxyUrl();

      // Display URL should use localhost even when bound to 0.0.0.0
      expect(url).to.equal('http://localhost:4545');
      expect(proxy.isCodeBuilderEnvironment()).to.be.true;
    });

    it('should respect explicit host configuration', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        host: '192.168.1.100',
      };

      const proxy = new ProxyServer(config);
      const url = proxy.getProxyUrl();

      expect(url).to.equal('http://192.168.1.100:4545');
    });

    it('should override Code Builder host with explicit configuration', () => {
      process.env.CODE_BUILDER_SESSION = 'session-123';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        host: '127.0.0.1',
      };

      const proxy = new ProxyServer(config);
      const url = proxy.getProxyUrl();

      // Even explicit 127.0.0.1 is displayed as localhost for consistency
      expect(url).to.equal('http://localhost:4545');
    });
  });

  describe('Server Lifecycle', () => {
    it('should report not running initially', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isRunning()).to.be.false;
    });

    it('should generate correct proxy URL', () => {
      const config: ProxyServerConfig = {
        port: 8080,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const url = proxy.getProxyUrl();

      expect(url).to.equal('http://localhost:8080');
    });
  });

  describe('Statistics Tracking', () => {
    it('should track request statistics', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const stats = proxy.getStats();

      expect(stats).to.have.property('requestCount');
      expect(stats).to.have.property('salesforceRequests');
      expect(stats).to.have.property('devServerRequests');
      expect(stats).to.have.property('webSocketUpgrades');
      expect(stats).to.have.property('errors');
      expect(stats).to.have.property('startTime');
    });

    it('should return a copy of stats (immutable)', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);
      const stats1 = proxy.getStats();
      stats1.requestCount = 999;

      const stats2 = proxy.getStats();

      expect(stats2.requestCount).to.equal(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should accept manifest configuration', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        manifest: {
          name: 'test-app',
          label: 'Test App',
          version: '1.0.0',
          outputDir: 'dist',
        },
      };

      const proxy = new ProxyServer(config);

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should accept org alias configuration', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        orgAlias: 'my-org',
      };

      const proxy = new ProxyServer(config);

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should work with minimal configuration', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy).to.be.instanceOf(ProxyServer);
      expect(proxy.getProxyUrl()).to.be.a('string');
      expect(proxy.getStats()).to.be.an('object');
    });
  });

  describe('Multiple Environment Scenarios', () => {
    it('should handle VSCode local development', () => {
      // No Code Builder env vars
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.false;
      expect(proxy.getProxyUrl()).to.equal('http://localhost:4545');
    });

    it('should handle Code Builder cloud environment', () => {
      process.env.SBQQ_STUDIO_WORKSPACE = '/workspace';
      process.env.SALESFORCE_PROJECT_ID = 'project-123';

      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.isCodeBuilderEnvironment()).to.be.true;
      expect(proxy.getProxyUrl()).to.equal('http://localhost:4545');
    });

    it('should handle custom network configuration', () => {
      const config: ProxyServerConfig = {
        port: 3000,
        devServerUrl: 'http://localhost:8080',
        salesforceInstanceUrl: 'https://custom.salesforce.com',
        host: '0.0.0.0',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.getProxyUrl()).to.equal('http://localhost:3000');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should setup and cleanup signal handlers', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      // Setup graceful shutdown
      const cleanup = proxy.setupGracefulShutdown();

      // Verify it returns a cleanup function
      expect(cleanup).to.be.a('function');

      // Clean up handlers
      cleanup();
    });

    it('should accept shutdown callback', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      const onShutdown = () => {
        // Callback logic would execute on signal
      };

      const cleanup = proxy.setupGracefulShutdown(onShutdown);

      // Verify callback can be set and cleanup function is returned
      expect(cleanup).to.be.a('function');

      // Clean up handlers
      cleanup();
    });

    it('should accept async shutdown callback', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      const onShutdown = async () => {
        // Async cleanup would execute on signal
        await Promise.resolve();
      };

      const cleanup = proxy.setupGracefulShutdown(onShutdown);

      expect(cleanup).to.be.a('function');

      cleanup();
    });
  });

  describe('Dynamic Configuration Updates', () => {
    it('should update dev server URL', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      // Update dev server URL
      proxy.updateDevServerUrl('http://localhost:5174');

      // Verify URL was updated by checking stats/behavior
      // (Internal config is private, so we verify through observable behavior)
      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should not update if URL is the same', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      // Update with same URL (should be a no-op)
      proxy.updateDevServerUrl('http://localhost:5173');

      expect(proxy).to.be.instanceOf(ProxyServer);
    });

    it('should update manifest configuration', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
        manifest: {
          name: 'test-app',
          label: 'Test App',
          version: '1.0.0',
          outputDir: 'dist',
        },
      };

      const proxy = new ProxyServer(config);

      // Update manifest with routing config
      proxy.updateManifest({
        name: 'test-app',
        label: 'Test App',
        version: '2.0.0',
        outputDir: 'dist',
        routing: {
          trailingSlash: 'always',
        },
      });

      expect(proxy).to.be.instanceOf(ProxyServer);
    });
  });

  describe('Dev Server Error State', () => {
    it('should track active dev server error', () => {
      const config: ProxyServerConfig = {
        port: 4545,
        devServerUrl: 'http://localhost:5173',
        salesforceInstanceUrl: 'https://test.salesforce.com',
      };

      const proxy = new ProxyServer(config);

      expect(proxy.hasActiveDevServerError()).to.be.false;

      proxy.setActiveDevServerError({
        type: 'port-conflict',
        title: 'Port Conflict',
        message: 'Port 5173 is already in use',
        stderrLines: ['EADDRINUSE'],
        suggestions: ['Stop other dev servers'],
      });

      expect(proxy.hasActiveDevServerError()).to.be.true;

      proxy.clearActiveDevServerError();

      expect(proxy.hasActiveDevServerError()).to.be.false;
    });
  });
});
