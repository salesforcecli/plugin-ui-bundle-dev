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

import type { Server } from 'node:net';
import { TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { createProjectWithDevServer, ensureSfCli, authOrgViaUrl } from './helpers/webappProjectUtils.js';
import {
  occupyPort,
  spawnWebappDev,
  closeServer,
  SUITE_TIMEOUT,
  SPAWN_TIMEOUT,
  SPAWN_FAIL_TIMEOUT,
  type WebappDevHandle,
} from './helpers/devServerUtils.js';

/* ------------------------------------------------------------------ *
 *  Tier 2 — Port Handling                                             *
 *                                                                     *
 *  Validates proxy port resolution logic:                             *
 *    - Explicit --port or dev.port occupied → PortInUseError          *
 *    - Default port occupied → auto-increment to next available       *
 *    - Explicit --port or dev.port available → proxy binds to it      *
 *                                                                     *
 *  Requires TESTKIT_AUTH_URL. Fails when absent (tests are mandatory). *
 * ------------------------------------------------------------------ */

const DEV_PORT = 18_910;
const PROXY_PORT = 18_920;

describe('multi dev NUTs — Tier 2 port handling', function () {
  this.timeout(SUITE_TIMEOUT);

  let session: TestSession;
  let targetOrg: string;
  let blocker: Server | null = null;
  let handle: WebappDevHandle | null = null;

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
    await closeServer(blocker);
    blocker = null;
  });

  after(async () => {
    await session?.clean();
  });

  // When --port is explicitly provided and that port is already occupied,
  // the command must fail with PortInUseError (no auto-increment).
  it('should throw PortInUseError when explicit --port is occupied', async () => {
    blocker = await occupyPort(PROXY_PORT);

    const { projectDir } = createProjectWithDevServer(session, 'portConflict', 'myApp', DEV_PORT);

    try {
      handle = await spawnWebappDev(['--name', 'myApp', '--port', String(PROXY_PORT), '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_FAIL_TIMEOUT,
      });
      expect.fail('Expected command to fail with PortInUseError');
    } catch (err) {
      expect((err as Error).message).to.include('PortInUseError');
    }
  });

  // When dev.port is set in the manifest and that port is occupied,
  // it is treated as an explicit configuration → PortInUseError (no auto-increment).
  it('should throw PortInUseError when dev.port in manifest is occupied', async () => {
    const { projectDir } = createProjectWithDevServer(session, 'manifestPort', 'myApp', DEV_PORT + 1, PROXY_PORT + 1);

    blocker = await occupyPort(PROXY_PORT + 1);

    try {
      handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
        cwd: projectDir,
        timeout: SPAWN_FAIL_TIMEOUT,
      });
      expect.fail('Expected command to fail with PortInUseError');
    } catch (err) {
      expect((err as Error).message).to.include('PortInUseError');
    }
  });

  // When no --port or dev.port is configured, the default (4545) is used.
  // If 4545 is occupied, the command silently tries the next port.
  it('should auto-increment port when default port (4545) is occupied', async () => {
    blocker = await occupyPort(4545);

    const { projectDir } = createProjectWithDevServer(session, 'portAutoInc', 'myApp', DEV_PORT + 2);

    handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
      cwd: projectDir,
      timeout: SPAWN_TIMEOUT,
    });

    const proxyPort = new URL(handle.proxyUrl).port;
    expect(Number(proxyPort)).to.be.greaterThan(4545);
  });

  // --port flag with an available port → proxy binds exactly to that port.
  it('should use custom --port when specified and available', async () => {
    const customPort = PROXY_PORT + 5;

    const { projectDir } = createProjectWithDevServer(session, 'customPort', 'myApp', DEV_PORT + 3);

    handle = await spawnWebappDev(['--name', 'myApp', '--port', String(customPort), '--target-org', targetOrg], {
      cwd: projectDir,
      timeout: SPAWN_TIMEOUT,
    });

    expect(handle.proxyUrl).to.equal(`http://localhost:${customPort}`);
  });

  // dev.port in manifest with an available port (no --port flag) →
  // proxy binds to the manifest-configured port.
  it('should use dev.port from manifest when available', async () => {
    const manifestPort = PROXY_PORT + 6;

    const { projectDir } = createProjectWithDevServer(session, 'manifestPortOk', 'myApp', DEV_PORT + 4, manifestPort);

    handle = await spawnWebappDev(['--name', 'myApp', '--target-org', targetOrg], {
      cwd: projectDir,
      timeout: SPAWN_TIMEOUT,
    });

    expect(handle.proxyUrl).to.equal(`http://localhost:${manifestPort}`);
  });
});
