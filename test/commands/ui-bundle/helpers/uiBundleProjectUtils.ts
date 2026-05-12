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
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestSession } from '@salesforce/cli-plugins-testkit';
import { UI_BUNDLES_FOLDER } from '../../../../src/config/uiBundleDiscovery.js';

const DEFAULT_SFDX_PROJECT = {
  packageDirectories: [{ path: 'force-app', default: true }],
};

/**
 * Relative path from project root to the uiBundles folder.
 */
const UI_BUNDLES_PATH = join('force-app', 'main', 'default', UI_BUNDLES_FOLDER);

/**
 * Resolve the absolute path to a UI bundle directory within a project.
 * If `uiBundleName` is omitted, returns the uiBundles folder itself.
 */
export function uiBundlePath(projectDir: string, uiBundleName?: string): string {
  return uiBundleName ? join(projectDir, UI_BUNDLES_PATH, uiBundleName) : join(projectDir, UI_BUNDLES_PATH);
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
 * Create a minimal SFDX project directory with sfdx-project.json.
 * Returns the absolute path to the project root.
 */
export function createProject(session: TestSession, name: string): string {
  const projectDir = join(session.dir, name);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, 'sfdx-project.json'), JSON.stringify(DEFAULT_SFDX_PROJECT, null, 2));
  return projectDir;
}

/**
 * Create a uiBundle directory with the required .uibundle-meta.xml file.
 */
export function createUiBundle(projectDir: string, name: string): void {
  const dir = uiBundlePath(projectDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.uibundle-meta.xml`), '<UiBundle/>');
}

/**
 * Create a uiBundle directory with the required .uibundle-meta.xml file inside
 * a project. Returns the absolute path to the project root.
 */
export function createProjectWithUiBundle(session: TestSession, projectName: string, uiBundleName: string): string {
  const projectDir = createProject(session, projectName);
  createUiBundle(projectDir, uiBundleName);
  return projectDir;
}

/**
 * Create a project with multiple UI bundles. Used to test selection flows when
 * more than one UI bundle exists in a single SFDX project.
 */
export function createProjectWithMultipleUiBundles(
  session: TestSession,
  projectName: string,
  uiBundleNames: string[]
): string {
  const projectDir = createProject(session, projectName);
  for (const name of uiBundleNames) {
    createUiBundle(projectDir, name);
  }
  return projectDir;
}

/**
 * Create the `uiBundles/` directory (empty — no UI bundles inside).
 * Used to test "empty uiBundles folder" scenario.
 */
export function createEmptyUiBundlesDir(projectDir: string): void {
  mkdirSync(uiBundlePath(projectDir), { recursive: true });
}

/**
 * Create a UI bundle directory without the required `.uibundle-meta.xml`.
 * Used to test "no metadata file" scenario.
 */
export function createUiBundleDirWithoutMeta(projectDir: string, name: string): void {
  mkdirSync(uiBundlePath(projectDir, name), { recursive: true });
}

/**
 * Overwrite the `ui-bundle.json` manifest for a given UI bundle.
 */
export function writeManifest(projectDir: string, uiBundleName: string, manifest: Record<string, unknown>): void {
  writeFileSync(join(uiBundlePath(projectDir, uiBundleName), 'ui-bundle.json'), JSON.stringify(manifest, null, 2));
}

/**
 * Write a tiny Node.js HTTP server script into the UI bundle directory.
 * Returns the command string suitable for `dev.command` in the manifest.
 *
 * The script is CommonJS (.cjs) to avoid ESM/shell quoting issues.
 */
function createDevServerScript(uiBundleDir: string, port: number): string {
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
  writeFileSync(join(uiBundleDir, 'dev-server.cjs'), script);
  return 'node dev-server.cjs';
}

/**
 * Convenience: create a project with a UI bundle whose manifest includes a
 * `dev.command` that starts a tiny HTTP server on `devPort`, and
 * `dev.url` pointing to that port. Optionally sets `dev.port` (proxy port).
 *
 * Returns `{ projectDir, uiBundleDir }`.
 */
export function createProjectWithDevServer(
  session: TestSession,
  projectName: string,
  uiBundleName: string,
  devPort: number,
  proxyPort?: number
): { projectDir: string; uiBundleDir: string } {
  const projectDir = createProjectWithUiBundle(session, projectName, uiBundleName);
  const uiBundleDir = uiBundlePath(projectDir, uiBundleName);

  const devCommand = createDevServerScript(uiBundleDir, devPort);
  const dev: Record<string, unknown> = {
    url: `http://localhost:${devPort}`,
    command: devCommand,
  };
  if (proxyPort !== undefined) {
    dev.port = proxyPort;
  }
  writeManifest(projectDir, uiBundleName, { dev });

  return { projectDir, uiBundleDir };
}
