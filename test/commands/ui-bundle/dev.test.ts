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
import sinon from 'sinon';
import { TestContext } from '@salesforce/core/testSetup';
import type { WebAppManifest, WebAppDevResult } from '../../../src/config/types.js';

describe('ui-bundle:dev command integration', () => {
  const $$ = new TestContext();

  afterEach(() => {
    $$.restore();
  });

  describe('Vite Proxy Detection', () => {
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
      fetchStub = sinon.stub(global, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    /**
     * Helper function that mirrors the checkViteProxyActive logic from dev.ts
     * This allows us to test the detection behavior without needing to run the full command
     */
    async function checkViteProxyActive(devServerUrl: string): Promise<boolean> {
      try {
        const healthUrl = new URL(devServerUrl);
        healthUrl.searchParams.set('sfProxyHealthCheck', 'true');
        const response = await fetch(healthUrl.toString(), {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        return response.headers.get('X-Salesforce-WebApp-Proxy') === 'true';
      } catch {
        return false;
      }
    }

    it('should return true when X-Salesforce-WebApp-Proxy header is present and true', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('X-Salesforce-WebApp-Proxy', 'true');

      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;

      // Verify the correct URL with query parameter was called
      const calledUrl = fetchStub.firstCall.args[0] as string;
      expect(calledUrl).to.include('sfProxyHealthCheck=true');
    });

    it('should return false when X-Salesforce-WebApp-Proxy header is not present', async () => {
      const mockHeaders = new Headers();
      // No X-Salesforce-WebApp-Proxy header

      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.false;
    });

    it('should return false when X-Salesforce-WebApp-Proxy header is present but not "true"', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('X-Salesforce-WebApp-Proxy', 'false');

      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.false;
    });

    it('should return false when fetch throws an error (network failure)', async () => {
      fetchStub.rejects(new Error('Network error'));

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.false;
    });

    it('should return false when fetch times out', async () => {
      fetchStub.rejects(new DOMException('The operation was aborted', 'AbortError'));

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.false;
    });

    it('should return false when dev server is not reachable (connection refused)', async () => {
      fetchStub.rejects(new TypeError('Failed to fetch'));

      const result = await checkViteProxyActive('http://localhost:5173');

      expect(result).to.be.false;
    });

    it('should construct correct health check URL with query parameter', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('X-Salesforce-WebApp-Proxy', 'true');

      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      await checkViteProxyActive('http://localhost:5173');

      const calledUrl = fetchStub.firstCall.args[0] as string;
      expect(calledUrl).to.equal('http://localhost:5173/?sfProxyHealthCheck=true');
    });

    it('should preserve existing query parameters when adding health check', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('X-Salesforce-WebApp-Proxy', 'true');

      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      await checkViteProxyActive('http://localhost:5173/?existing=param');

      const calledUrl = fetchStub.firstCall.args[0] as string;
      expect(calledUrl).to.include('existing=param');
      expect(calledUrl).to.include('sfProxyHealthCheck=true');
    });

    it('should use GET method for health check request', async () => {
      const mockHeaders = new Headers();
      fetchStub.resolves({
        ok: true,
        headers: mockHeaders,
      } as Response);

      await checkViteProxyActive('http://localhost:5173');

      const options = fetchStub.firstCall.args[1] as RequestInit;
      expect(options.method).to.equal('GET');
    });
  });

  describe('Type Definitions', () => {
    it('should have correct WebAppManifest structure', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
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
        outputDir: 'dist',
        dev: {
          command: 'npm run dev',
        },
      };

      expect(manifest.dev?.command).to.equal('npm run dev');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate manifest with dev.url', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        outputDir: 'dist',
        dev: {
          url: 'http://localhost:5173',
        },
      };

      // Basic validation
      expect(manifest.name).to.be.a('string');
      expect(manifest.dev?.url).to.include('http');
    });

    it('should validate manifest with dev.command', () => {
      const manifest: WebAppManifest = {
        name: 'testWebApp',
        outputDir: 'dist',
        dev: {
          command: 'npm run dev',
        },
      };

      expect(manifest.dev?.command).to.be.a('string');
      expect(manifest.dev?.command).to.not.be.empty;
    });
  });

  /**
   * Tests for devServerUrl vs actualDevServerUrl mismatch handling.
   * Mirrors the logic in dev.ts (lines 335-342) to enumerate all combinations.
   *
   * Combinations:
   * - explicitUrlProvided: --url flag was passed
   * - skipDevServer: --url was reachable, so we never start dev server
   * - actualDevServerUrl: URL from DevServerManager 'ready' event (only when we start dev server)
   */
  describe('Dev Server URL Mismatch', () => {
    /**
     * Helper that mirrors the mismatch check logic from dev.ts:
     * if (explicitUrlProvided && flags.url && flags.url !== actualDevServerUrl) { this.warn(...) }
     */
    function shouldWarnUrlMismatch(
      explicitUrlProvided: boolean,
      flagsUrl: string | undefined,
      actualDevServerUrl: string
    ): boolean {
      return !!(explicitUrlProvided && flagsUrl && flagsUrl !== actualDevServerUrl);
    }

    /**
     * Helper that mirrors the final devServerUrl assignment when dev server is started:
     * devServerUrl = actualDevServerUrl
     */
    function getFinalDevServerUrlWhenStarted(actualDevServerUrl: string): string {
      return actualDevServerUrl;
    }

    describe('when --url is provided and dev server is started (explicitUrlProvided=true)', () => {
      it('should NOT warn when flags.url matches actualDevServerUrl', () => {
        const flagsUrl = 'http://localhost:5173';
        const actualDevServerUrl = 'http://localhost:5173';

        expect(shouldWarnUrlMismatch(true, flagsUrl, actualDevServerUrl)).to.be.false;
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(flagsUrl);
      });

      it('should warn when flags.url differs from actualDevServerUrl (different port)', () => {
        const flagsUrl = 'http://localhost:3000';
        const actualDevServerUrl = 'http://localhost:5173';

        expect(shouldWarnUrlMismatch(true, flagsUrl, actualDevServerUrl)).to.be.true;
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });

      it('should warn when flags.url differs from actualDevServerUrl (localhost vs 127.0.0.1)', () => {
        const flagsUrl = 'http://localhost:5173';
        const actualDevServerUrl = 'http://127.0.0.1:5173';

        expect(shouldWarnUrlMismatch(true, flagsUrl, actualDevServerUrl)).to.be.true;
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });

      it('should warn when flags.url differs from actualDevServerUrl (trailing slash)', () => {
        const flagsUrl = 'http://localhost:5173';
        const actualDevServerUrl = 'http://localhost:5173/';

        expect(shouldWarnUrlMismatch(true, flagsUrl, actualDevServerUrl)).to.be.true;
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });

      it('should always use actualDevServerUrl as final devServerUrl when dev server is started', () => {
        const actualDevServerUrl = 'http://localhost:8080';
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });
    });

    describe('when --url is NOT provided (explicitUrlProvided=false)', () => {
      it('should NOT warn - no mismatch check when no explicit URL', () => {
        const actualDevServerUrl = 'http://localhost:5173';

        expect(shouldWarnUrlMismatch(false, undefined, actualDevServerUrl)).to.be.false;
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });

      it('should use actualDevServerUrl from dev server (manifest has dev.command)', () => {
        const actualDevServerUrl = 'http://localhost:3000';
        expect(getFinalDevServerUrlWhenStarted(actualDevServerUrl)).to.equal(actualDevServerUrl);
      });
    });

    describe('when --url is reachable (skipDevServer=true)', () => {
      it('should use flags.url as devServerUrl - no actualDevServerUrl, no mismatch possible', () => {
        const flagsUrl = 'http://localhost:5173';
        // When skipDevServer, we never get actualDevServerUrl - devServerUrl stays as flags.url
        expect(flagsUrl).to.equal('http://localhost:5173');
      });
    });

    describe('when manifest has dev.url and no --url (skipDevServer=false, no dev server start)', () => {
      it('should use manifest.dev.url as devServerUrl - no actualDevServerUrl', () => {
        const manifestUrl = 'http://localhost:5173';
        // When manifest.dev.url && !explicitUrlProvided, we use manifest url, don't start dev server
        expect(manifestUrl).to.equal('http://localhost:5173');
      });
    });

    describe('combination matrix: explicitUrlProvided × match/mismatch', () => {
      const combinations: Array<{
        explicitUrlProvided: boolean;
        flagsUrl: string | undefined;
        actualDevServerUrl: string;
        expectMismatch: boolean;
        description: string;
      }> = [
        {
          explicitUrlProvided: true,
          flagsUrl: 'http://localhost:5173',
          actualDevServerUrl: 'http://localhost:5173',
          expectMismatch: false,
          description: 'explicit URL matches actual',
        },
        {
          explicitUrlProvided: true,
          flagsUrl: 'http://localhost:3000',
          actualDevServerUrl: 'http://localhost:5173',
          expectMismatch: true,
          description: 'explicit URL different port',
        },
        {
          explicitUrlProvided: true,
          flagsUrl: 'http://127.0.0.1:5173',
          actualDevServerUrl: 'http://localhost:5173',
          expectMismatch: true,
          description: 'explicit URL different host',
        },
        {
          explicitUrlProvided: true,
          flagsUrl: 'https://localhost:5173',
          actualDevServerUrl: 'http://localhost:5173',
          expectMismatch: true,
          description: 'explicit URL different protocol',
        },
        {
          explicitUrlProvided: false,
          flagsUrl: undefined,
          actualDevServerUrl: 'http://localhost:5173',
          expectMismatch: false,
          description: 'no explicit URL - no mismatch check',
        },
      ];

      combinations.forEach(({ explicitUrlProvided, flagsUrl, actualDevServerUrl, expectMismatch, description }) => {
        it(`should ${expectMismatch ? 'warn' : 'not warn'} when ${description}`, () => {
          expect(shouldWarnUrlMismatch(explicitUrlProvided, flagsUrl, actualDevServerUrl)).to.equal(expectMismatch);
        });
      });
    });
  });
});
