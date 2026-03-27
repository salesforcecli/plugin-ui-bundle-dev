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

import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestSession } from '@salesforce/cli-plugins-testkit';
import { UI_BUNDLES_FOLDER } from '../../../../src/config/webappDiscovery.js';

/**
 * Real home directory captured at module load, before TestSession overrides process.env.HOME.
 * Used when running `sf ui-bundle generate` so the CLI finds linked plugin-templates
 * (TestSession sets HOME to a temp dir, which hides linked plugins).
 */
export const REAL_HOME = homedir();

/**
 * Relative path from project root to the uiBundles folder.
 */
const WEBAPPS_PATH = join('force-app', 'main', 'default', UI_BUNDLES_FOLDER);

/**
 * Resolve the absolute path to a UI bundle directory within a project.
 * If `webAppName` is omitted, returns the uiBundles folder itself.
 */
export function webappPath(projectDir: string, webAppName?: string): string {
  return webAppName ? join(projectDir, WEBAPPS_PATH, webAppName) : join(projectDir, WEBAPPS_PATH);
}

/**
 * Verify the global `sf` CLI is available and has the required commands.
 * Must be called after TestSession.create() since the session sets a valid HOME.
 */
export function ensureSfCli(): void {
  try {
    execSync('sf project generate --help', { stdio: 'pipe', timeout: 30_000 });
  } catch {
    throw new Error(
      'Global sf CLI with plugin-templates not found.\n' +
        'Install: npm install @salesforce/cli -g\n' +
        'CI installs @salesforce/cli@nightly via nut.yml.'
    );
  }
}

/**
 * Authenticate an org via TESTKIT_AUTH_URL without requiring DevHub.
 * Returns the authenticated username.
 *
 * Must be called once per TestSession since each session has its own
 * mock home directory where auth files are stored.
 */
export function authOrgViaUrl(): string {
  const authUrl = process.env.TESTKIT_AUTH_URL;
  if (!authUrl) {
    throw new Error('TESTKIT_AUTH_URL environment variable is not set.');
  }

  // Use --sfdx-url-file for cross-platform reliability
  const tmpFile = join(tmpdir(), `testkit-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  try {
    writeFileSync(tmpFile, authUrl, 'utf8');
    const output = execSync(`sf org login sfdx-url --sfdx-url-file "${tmpFile}" --json`, {
      stdio: 'pipe',
      timeout: 60_000,
    }).toString();
    const result = JSON.parse(output) as { result: { username: string } };
    return result.result.username;
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

/**
 * Run `sf project generate --name <name>` inside the session directory.
 * Returns the absolute path to the generated project root.
 */
export function createProject(session: TestSession, name: string): string {
  execSync(`sf project generate --name ${name}`, {
    cwd: session.dir,
    stdio: 'pipe',
  });
  return join(session.dir, name);
}

/**
 * Run `sf project generate` then `sf ui-bundle generate --name <webAppName>` inside
 * the project. Returns the absolute path to the generated project root.
 */
export function createProjectWithWebapp(session: TestSession, projectName: string, webAppName: string): string {
  const projectDir = createProject(session, projectName);
  execSync(`sf ui-bundle generate --name ${webAppName}`, {
    cwd: projectDir,
    stdio: 'pipe',
    env: { ...process.env, HOME: REAL_HOME, USERPROFILE: REAL_HOME },
  });
  return projectDir;
}

/**
 * Create a project with multiple UI bundles. Used to test selection flows when
 * more than one UI bundle exists in a single SFDX project.
 */
export function createProjectWithMultipleWebapps(
  session: TestSession,
  projectName: string,
  webAppNames: string[]
): string {
  const projectDir = createProject(session, projectName);
  for (const name of webAppNames) {
    execSync(`sf ui-bundle generate --name ${name}`, {
      cwd: projectDir,
      stdio: 'pipe',
      env: { ...process.env, HOME: REAL_HOME, USERPROFILE: REAL_HOME },
    });
  }
  return projectDir;
}

/**
 * Create the `uiBundles/` directory (empty — no UI bundles inside).
 * Used to test "empty uiBundles folder" scenario.
 */
export function createEmptyWebappsDir(projectDir: string): void {
  mkdirSync(webappPath(projectDir), { recursive: true });
}

/**
 * Create a UI bundle directory without the required `.webapplication-meta.xml`.
 * Used to test "no metadata file" scenario.
 */
export function createWebappDirWithoutMeta(projectDir: string, name: string): void {
  mkdirSync(webappPath(projectDir, name), { recursive: true });
}

/**
 * Overwrite the `webapplication.json` manifest for a given UI bundle.
 */
export function writeManifest(projectDir: string, webAppName: string, manifest: Record<string, unknown>): void {
  writeFileSync(join(webappPath(projectDir, webAppName), 'webapplication.json'), JSON.stringify(manifest, null, 2));
}

/**
 * Write a tiny Node.js HTTP server script into the UI bundle directory.
 * Returns the command string suitable for `dev.command` in the manifest.
 *
 * The script is CommonJS (.cjs) to avoid ESM/shell quoting issues.
 */
export function createDevServerScript(webappDir: string, port: number): string {
  const script = [
    "const http = require('http');",
    'const server = http.createServer((_, res) => {',
    "  res.writeHead(200, { 'Content-Type': 'text/html' });",
    "  res.end('<h1>Test Dev Server</h1>');",
    '});',
    `server.listen(${port}, () => {`,
    `  console.log('listening on port ${port}');`,
    '});',
  ].join('\n');
  writeFileSync(join(webappDir, 'dev-server.cjs'), script);
  return 'node dev-server.cjs';
}

/**
 * Convenience: create a project with a UI bundle whose manifest includes a
 * `dev.command` that starts a tiny HTTP server on `devPort`, and
 * `dev.url` pointing to that port. Optionally sets `dev.port` (proxy port).
 *
 * Returns `{ projectDir, webappDir }`.
 */
export function createProjectWithDevServer(
  session: TestSession,
  projectName: string,
  webAppName: string,
  devPort: number,
  proxyPort?: number
): { projectDir: string; webappDir: string } {
  const projectDir = createProjectWithWebapp(session, projectName, webAppName);
  const webappDir = webappPath(projectDir, webAppName);

  const devCommand = createDevServerScript(webappDir, devPort);
  const dev: Record<string, unknown> = {
    url: `http://localhost:${devPort}`,
    command: devCommand,
  };
  if (proxyPort !== undefined) {
    dev.port = proxyPort;
  }
  writeManifest(projectDir, webAppName, { dev });

  return { projectDir, webappDir };
}
