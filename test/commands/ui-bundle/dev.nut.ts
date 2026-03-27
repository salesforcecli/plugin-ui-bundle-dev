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
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import {
  createProject,
  createProjectWithWebapp,
  createProjectWithMultipleWebapps,
  createEmptyWebappsDir,
  createWebappDirWithoutMeta,
  writeManifest,
  webappPath,
  ensureSfCli,
  authOrgViaUrl,
  REAL_HOME,
} from './helpers/webappProjectUtils.js';

/* ------------------------------------------------------------------ *
 *  Tier 1 — No Auth                                                   *
 *                                                                     *
 *  Validates flag-level parse errors that fire before any org or      *
 *  filesystem interaction. No credentials needed; always runs.        *
 * ------------------------------------------------------------------ */
describe('ui-bundle dev NUTs — Tier 1 (no auth)', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // --target-org is declared as Flags.requiredOrg(). Running without it
  // must fail at parse time with NoDefaultEnvError before any other logic.
  it('should require --target-org', () => {
    const result = execCmd('ui-bundle dev --json', {
      ensureExitCode: 1,
      cwd: session.dir,
    });

    expect(result.jsonOutput?.name).to.equal('NoDefaultEnvError');
    expect(result.jsonOutput?.message).to.include('target-org');
  });
});

/* ------------------------------------------------------------------ *
 *  Tier 2 — CLI Validation (with auth)                                *
 *                                                                     *
 *  Validates webapp discovery errors and URL resolution errors.       *
 *  Auth is only needed so --target-org passes parsing; these tests    *
 *  exercise local filesystem/network checks — no live org calls.      *
 *                                                                     *
 *  Requires TESTKIT_AUTH_URL. Fails when absent (tests are mandatory). *
 * ------------------------------------------------------------------ */
describe('ui-bundle dev NUTs — Tier 2 CLI validation', () => {
  let session: TestSession;
  let targetOrg: string;

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

  after(async () => {
    await session?.clean();
  });

  // ── Discovery errors ──────────────────────────────────────────

  // Project has no uiBundles folder at all → WebappNotFoundError.
  it('should error when no webapp found (project only, no webapps)', () => {
    const projectDir = createProject(session, 'noWebappProject');

    const result = execCmd(`ui-bundle dev --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('WebappNotFoundError');
  });

  // Project has webapp "realApp" but --name asks for "NonExistent" → WebappNameNotFoundError.
  it('should error when --name does not match any webapp', () => {
    const projectDir = createProjectWithWebapp(session, 'nameNotFound', 'realApp');

    const result = execCmd(`ui-bundle dev --name NonExistent --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('WebappNameNotFoundError');
  });

  // cwd is inside webapp "appA" but --name asks for "appB" → WebappNameConflictError.
  // Discovery treats this as ambiguous intent and rejects it.
  it('should error on --name conflict when inside a different webapp', () => {
    const projectDir = createProjectWithWebapp(session, 'nameConflict', 'appA');
    execSync('sf ui-bundle generate --name appB', {
      cwd: projectDir,
      stdio: 'pipe',
      env: { ...process.env, HOME: REAL_HOME, USERPROFILE: REAL_HOME },
    });

    const cwdInsideAppA = webappPath(projectDir, 'appA');

    const result = execCmd(`ui-bundle dev --name appB --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: cwdInsideAppA,
    });

    expect(result.jsonOutput?.name).to.equal('WebappNameConflictError');
  });

  // uiBundles/ folder exists but is empty → WebappNotFoundError.
  it('should error when uiBundles folder is empty', () => {
    const projectDir = createProject(session, 'emptyWebapps');
    createEmptyWebappsDir(projectDir);

    const result = execCmd(`ui-bundle dev --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('WebappNotFoundError');
  });

  // uiBundles/orphanApp/ exists but has no .webapplication-meta.xml → not a valid webapp.
  it('should error when webapp dir has no .webapplication-meta.xml', () => {
    const projectDir = createProject(session, 'noMeta');
    createWebappDirWithoutMeta(projectDir, 'orphanApp');

    const result = execCmd(`ui-bundle dev --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('WebappNotFoundError');
  });

  // ── Multiple webapps selection ────────────────────────────────

  // Project has appA and appB. Using --name appA from project root selects
  // that webapp and proceeds past discovery. Fails at DevServerUrlError
  // (no dev server) — confirming named selection works with multiple webapps.
  it('should use --name to select one webapp when multiple exist', () => {
    const projectDir = createProjectWithMultipleWebapps(session, 'multiSelect', ['appA', 'appB']);

    writeManifest(projectDir, 'appA', {
      dev: { url: 'http://localhost:5180' },
    });
    writeManifest(projectDir, 'appB', {
      dev: { url: 'http://localhost:5181' },
    });

    const result = execCmd(`ui-bundle dev --name appA --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // Project has appA and appB. Using --name appB selects the second webapp.
  it('should use --name to select second webapp when multiple exist', () => {
    const projectDir = createProjectWithMultipleWebapps(session, 'multiSelectB', ['appA', 'appB']);

    writeManifest(projectDir, 'appA', {
      dev: { url: 'http://localhost:5182' },
    });
    writeManifest(projectDir, 'appB', {
      dev: { url: 'http://localhost:5183' },
    });

    const result = execCmd(`ui-bundle dev --name appB --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // ── Auto-selection ────────────────────────────────────────────

  // When cwd is inside uiBundles/myApp/, discovery auto-selects that
  // webapp without --name. The command proceeds past discovery and fails at
  // URL resolution (no dev server running) — confirming auto-select worked.
  it('should auto-select webapp when run from inside its directory', () => {
    const projectDir = createProjectWithWebapp(session, 'autoSelect', 'myApp');

    writeManifest(projectDir, 'myApp', {
      dev: { url: 'http://localhost:5179' },
    });

    const cwdInsideApp = webappPath(projectDir, 'myApp');

    // No --name flag; cwd is inside the webapp directory.
    // Discovery auto-selects myApp, then the command fails at URL check
    // (nothing running on 5179). DevServerUrlError proves discovery succeeded.
    const result = execCmd(`ui-bundle dev --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: cwdInsideApp,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // When multiple webapps exist and cwd is inside uiBundles/appA/,
  // discovery auto-selects appA without prompting. Proceeds past discovery
  // and fails at URL resolution — confirming auto-select works with multiple.
  it('should auto-select webapp when run from inside its directory (multiple webapps)', () => {
    const projectDir = createProjectWithMultipleWebapps(session, 'autoSelectMulti', ['appA', 'appB']);

    writeManifest(projectDir, 'appA', {
      dev: { url: 'http://localhost:5184' },
    });
    writeManifest(projectDir, 'appB', {
      dev: { url: 'http://localhost:5185' },
    });

    const cwdInsideAppA = webappPath(projectDir, 'appA');

    const result = execCmd(`ui-bundle dev --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: cwdInsideAppA,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // ── URL / dev server errors ───────────────────────────────────

  // --url explicitly provided but nothing is listening → DevServerUrlError.
  // The command refuses to start a dev server when --url is given.
  it('should error when --url is unreachable', () => {
    const projectDir = createProjectWithWebapp(session, 'urlUnreachable', 'myApp');

    const result = execCmd(`ui-bundle dev --name myApp --url http://localhost:5179 --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // Manifest has dev.url but no dev.command → command can't start the server
  // itself and the URL is unreachable → DevServerUrlError.
  it('should error when dev.url is unreachable and no dev.command', () => {
    const projectDir = createProjectWithWebapp(session, 'urlNoCmd', 'myApp');

    writeManifest(projectDir, 'myApp', {
      dev: { url: 'http://localhost:5179' },
    });

    const result = execCmd(`ui-bundle dev --name myApp --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerUrlError');
  });

  // ── Dev server startup errors ─────────────────────────────────

  // Webapp created but npm install never run → dev server fails because
  // dependencies (e.g. vite) are not installed. The command should exit
  // with a meaningful error that suggests installing dependencies.
  // This mirrors the real user flow: generate → dev (without install).
  it('should include a reason when dev server fails to start', () => {
    const projectDir = createProjectWithWebapp(session, 'noInstall', 'myApp');
    const appDir = webappPath(projectDir, 'myApp');

    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'test-webapp', scripts: { dev: 'vite' } }));
    writeManifest(projectDir, 'myApp', {
      dev: { command: 'npm run dev' },
    });

    const result = execCmd(`ui-bundle dev --name myApp --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: projectDir,
    });

    expect(result.jsonOutput?.name).to.equal('DevServerError');
    const output = JSON.stringify(result.jsonOutput ?? {});
    expect(output).to.match(/Reason:\s*\S/);
  });
});
