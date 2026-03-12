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

import type { Server as HttpServer } from 'node:http';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import {
  createProjectWithDevServer,
  createProjectWithWebapp,
  writeManifest,
  ensureSfCli,
  authOrgViaUrl,
} from './helpers/webappProjectUtils.js';
import {
  spawnWebappDev,
  startTestHttpServer,
  startViteProxyServer,
  closeServer,
  SUITE_TIMEOUT,
  SPAWN_TIMEOUT,
  type WebappDevHandle,
} from './helpers/devServerUtils.js';

/* ------------------------------------------------------------------ *
 *  Tier 2 — URL / proxy integration tests                            *
 *                                                                     *
 *  All suites share a single TestSession (one auth call) and test     *
 *  the three modes of dev server + proxy interaction:                 *
 *    1. Full flow — dev.command starts server, standalone proxy boots *
 *    2. Proxy-only — external server already running, proxy boots     *
 *    3. Vite proxy — Vite plugin handles proxy, standalone skipped    *
 *                                                                     *
 *  Requires TESTKIT_AUTH_URL. Fails when absent (tests are mandatory). *
 * ------------------------------------------------------------------ */

const FULL_FLOW_PORT = 18_900;
const PROXY_ONLY_PORT = 18_930;
const VITE_PORT = 18_940;

describe('webapp dev NUTs — Tier 2 URL/proxy integration', function () {
  this.timeout(SUITE_TIMEOUT);

  let session: TestSession;
  let targetOrg: string;
  let handle: WebappDevHandle | null = null;
  let externalServer: HttpServer | null = null;

  before(async () => {
    if (!process.env.TESTKIT_AUTH_URL) {
      throw new Error(
        'TESTKIT_AUTH_URL is required for Tier 2 tests. Set it in .env (local) or CI secrets (GitHub Actions).'
      );
    }

    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
    ensureSfCli();
    targetOrg = authOrgViaUrl();
  });

  afterEach(async () => {
    if (handle) {
      await handle.kill();
      handle = null;
    }
    await closeServer(externalServer);
    externalServer = null;
  });

  after(async () => {
    await session?.clean();
  });

  // ── Full flow (dev.command starts dev server) ────────────────────
  // Manifest has dev.command + dev.url. The command spawns the dev server,
  // waits for it to become reachable, then starts the standalone proxy.

  describe('full flow', () => {
    // Verifies the proxy starts and emits a localhost URL when dev.command
    // successfully starts the dev server.
    it('should start proxy when dev.command starts a dev server', async () => {
      const { projectDir } = createProjectWithDevServer(session, 'fullFlow', 'myApp', FULL_FLOW_PORT);

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.be.a('string');
      expect(handle.proxyUrl).to.match(/^http:\/\/localhost:\d+$/);
    });

    // Verifies the proxy forwards requests to the dev server and returns
    // the dev server's HTML content to the caller.
    it('should serve proxied content from the dev server', async () => {
      const { projectDir } = createProjectWithDevServer(session, 'proxyContent', 'myApp', FULL_FLOW_PORT + 1);

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      const response = await fetch(handle.proxyUrl);
      expect(response.status).to.equal(200);

      const body = await response.text();
      expect(body).to.include('Test Dev Server');
    });

    // The command emits `{"url":"http://localhost:<port>"}` on stderr
    // as a machine-readable contract for IDE extensions to discover the proxy.
    it('should emit JSON with proxy URL on stderr', async () => {
      const { projectDir } = createProjectWithDevServer(session, 'jsonOutput', 'myApp', FULL_FLOW_PORT + 2);

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.match(/^http:\/\/localhost:\d+$/);

      const jsonLine = handle.stderr.split('\n').find((line) => {
        try {
          const parsed = JSON.parse(line.trim()) as Record<string, unknown>;
          return typeof parsed.url === 'string';
        } catch {
          return false;
        }
      });
      expect(jsonLine).to.be.a('string');
    });

    // When the manifest has no dev section (empty dev config), the command
    // falls back to defaults: dev.command = "npm run dev", dev.url = localhost:5173.
    // With a dev server already listening on 5173, the proxy should start.
    it('should use defaults when manifest has empty dev config', async () => {
      const defaultDevPort = 5173;
      externalServer = await startTestHttpServer(defaultDevPort);

      const projectDir = createProjectWithWebapp(session, 'emptyManifest', 'myApp');
      writeManifest(projectDir, 'myApp', {});

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.be.a('string');
      expect(handle.proxyUrl).to.match(/^http:\/\/localhost:\d+$/);
    });
  });

  // ── Proxy-only mode (external server already running) ────────────
  // The dev server is started externally (not by the command). The command
  // only starts its standalone proxy pointing at the already-reachable URL.

  describe('proxy-only mode', () => {
    // --url points to a running server → proxy boots on a different port,
    // no dev server spawned by the command.
    it('should start proxy when --url points to an already-running server', async () => {
      externalServer = await startTestHttpServer(PROXY_ONLY_PORT);

      const projectDir = createProjectWithWebapp(session, 'proxyOnly', 'myApp');

      handle = await spawnWebappDev(
        ['--name', 'myApp', '--url', `http://localhost:${PROXY_ONLY_PORT}`, '--target-org', targetOrg],
        { cwd: projectDir, timeout: SPAWN_TIMEOUT }
      );

      expect(handle.proxyUrl).to.be.a('string');
      expect(handle.proxyUrl).to.match(/^http:\/\/localhost:\d+$/);
      const proxyPort = Number(new URL(handle.proxyUrl).port);
      expect(proxyPort).to.not.equal(PROXY_ONLY_PORT);
    });

    // Verifies the proxy correctly forwards content from the external server.
    it('should serve proxied content from the external server via --url', async () => {
      externalServer = await startTestHttpServer(PROXY_ONLY_PORT + 1);

      const projectDir = createProjectWithWebapp(session, 'proxyOnlyContent', 'myApp');

      handle = await spawnWebappDev(
        ['--name', 'myApp', '--url', `http://localhost:${PROXY_ONLY_PORT + 1}`, '--target-org', targetOrg],
        { cwd: projectDir, timeout: SPAWN_TIMEOUT }
      );

      const response = await fetch(handle.proxyUrl);
      expect(response.status).to.equal(200);

      const body = await response.text();
      expect(body).to.include('Manual Dev Server');
    });

    // dev.url in manifest is already reachable, no dev.command →
    // command skips spawning a dev server and just starts the proxy.
    it('should start proxy when dev.url in manifest is already reachable (no dev.command needed)', async () => {
      externalServer = await startTestHttpServer(PROXY_ONLY_PORT + 2);

      const projectDir = createProjectWithWebapp(session, 'proxyOnlyManifest', 'myApp');
      writeManifest(projectDir, 'myApp', {
        dev: { url: `http://localhost:${PROXY_ONLY_PORT + 2}` },
      });

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.be.a('string');

      const response = await fetch(handle.proxyUrl);
      expect(response.status).to.equal(200);

      const body = await response.text();
      expect(body).to.include('Manual Dev Server');
    });

    // Combines --url (external server) with --port (explicit proxy port).
    // Verifies the proxy binds to the requested port in proxy-only mode.
    it('should use custom --port with --url in proxy-only mode', async () => {
      const customProxyPort = PROXY_ONLY_PORT + 10;
      externalServer = await startTestHttpServer(PROXY_ONLY_PORT + 3);

      const projectDir = createProjectWithWebapp(session, 'proxyOnlyPort', 'myApp');

      handle = await spawnWebappDev(
        [
          '--name', 'myApp',
          '--url', `http://localhost:${PROXY_ONLY_PORT + 3}`,
          '--port', String(customProxyPort),
          '--target-org', targetOrg,
        ],
        { cwd: projectDir, timeout: SPAWN_TIMEOUT }
      );

      expect(handle.proxyUrl).to.equal(`http://localhost:${customProxyPort}`);

      const response = await fetch(handle.proxyUrl);
      expect(response.status).to.equal(200);
    });
  });

  // ── Vite proxy mode (dev server has built-in proxy) ──────────────
  // When the dev server responds to ?sfProxyHealthCheck=true with the
  // X-Salesforce-WebApp-Proxy header, the command skips the standalone
  // proxy and uses the dev server URL directly.

  describe('Vite proxy mode', () => {
    // Vite proxy header detected → emitted URL equals the dev server URL
    // (standalone proxy is not started).
    it('should skip standalone proxy when Vite proxy is detected', async () => {
      externalServer = await startViteProxyServer(VITE_PORT);

      const projectDir = createProjectWithWebapp(session, 'viteProxy', 'myApp');
      writeManifest(projectDir, 'myApp', {
        dev: { url: `http://localhost:${VITE_PORT}` },
      });

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.equal(`http://localhost:${VITE_PORT}`);
    });

    // Verifies content is served from the Vite server without a proxy layer.
    it('should serve content directly from Vite server (no standalone proxy)', async () => {
      externalServer = await startViteProxyServer(VITE_PORT + 1);

      const projectDir = createProjectWithWebapp(session, 'viteContent', 'myApp');
      writeManifest(projectDir, 'myApp', {
        dev: { url: `http://localhost:${VITE_PORT + 1}` },
      });

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      const response = await fetch(handle.proxyUrl);
      expect(response.status).to.equal(200);

      const body = await response.text();
      expect(body).to.include('Vite Dev Server');
    });

    // Server responds to health check but WITHOUT the X-Salesforce-WebApp-Proxy
    // header → standalone proxy starts as usual (fallback path).
    it('should start standalone proxy when server lacks Vite proxy header', async () => {
      externalServer = await startTestHttpServer(VITE_PORT + 2);

      const projectDir = createProjectWithWebapp(session, 'noViteProxy', 'myApp');
      writeManifest(projectDir, 'myApp', {
        dev: { url: `http://localhost:${VITE_PORT + 2}` },
      });

      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_TIMEOUT,
      });

      expect(handle.proxyUrl).to.not.equal(`http://localhost:${VITE_PORT + 2}`);
      expect(handle.proxyUrl).to.match(/^http:\/\/localhost:\d+$/);
    });
  });
});
