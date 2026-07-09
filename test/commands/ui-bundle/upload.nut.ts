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

import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { createZipFixture, createBundleDirFixture, authOrgViaUrl } from './helpers/uiBundleProjectUtils.js';

/* ------------------------------------------------------------------ *
 *  Tier 1 — No Auth                                                   *
 *                                                                     *
 *  Validates flag-level parse errors that fire before any org or      *
 *  network interaction. No credentials needed; always runs.          *
 * ------------------------------------------------------------------ */
describe('ui-bundle upload NUTs — Tier 1 (no auth)', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // --target-org is declared as Flags.requiredOrg(). Running without it
  // must fail at parse time with NoDefaultEnvError before any other logic,
  // mirroring dev.nut.ts:52-60. Without a resolvable org, requiredOrg's default
  // resolution throws before the exactly-one / required-flag validations run —
  // so those parse checks are exercised in Tier 2 (below), where an org resolves.
  it('should require --target-org', () => {
    const zipPath = createZipFixture(session);

    const result = execCmd(`ui-bundle upload --zip-file ${zipPath} --as-salesforce-pages --json`, {
      ensureExitCode: 1,
      cwd: session.dir,
    });

    expect(result.jsonOutput?.name).to.equal('NoDefaultEnvError');
    expect(result.jsonOutput?.message).to.include('target-org');
  });
});

/* ------------------------------------------------------------------ *
 *  Tier 2 — Real Org                                                  *
 *                                                                     *
 *  Exercises the real POST /connect/uibundle/deploys call against a  *
 *  live org. Requires TESTKIT_AUTH_URL. Fails when absent (mandatory, *
 *  not silently skipped), matching dev.nut.ts:76-85's contract.       *
 * ------------------------------------------------------------------ */
describe('ui-bundle upload NUTs — Tier 2 (real org)', () => {
  let session: TestSession;
  let targetOrg: string;

  before(async () => {
    if (!process.env.TESTKIT_AUTH_URL) {
      throw new Error(
        'TESTKIT_AUTH_URL is required for Tier 2 tests. Set it in .env (local) or CI secrets (GitHub Actions).'
      );
    }

    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
    targetOrg = authOrgViaUrl();
  });

  after(async () => {
    await session?.clean();
  });

  // Flag-parse checks that need a resolvable org: requiredOrg's default
  // resolution runs during parse, so the exactly-one / required-flag
  // validations are only reachable once --target-org resolves.

  // Neither bundle-source flag → exactly-one relationship fails at parse time.
  it('should require exactly one of --zip-file / --bundle-dir (neither given)', () => {
    const result = execCmd(`ui-bundle upload --as-salesforce-pages --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: session.dir,
    });

    expect(result.jsonOutput?.message).to.include('Exactly one of the following must be provided');
  });

  // Both bundle-source flags → exactly-one relationship fails at parse time.
  it('should reject both --zip-file and --bundle-dir together', () => {
    const zipPath = createZipFixture(session);
    const bundleDir = createBundleDirFixture(session);

    const result = execCmd(
      `ui-bundle upload --zip-file ${zipPath} --bundle-dir ${bundleDir} --as-salesforce-pages --target-org ${targetOrg} --json`,
      {
        ensureExitCode: 1,
        cwd: session.dir,
      }
    );

    expect(result.jsonOutput?.message).to.include('cannot also be provided when using');
  });

  // --as-salesforce-pages is required; omitting it fails at parse time.
  it('should require --as-salesforce-pages', () => {
    const zipPath = createZipFixture(session);

    const result = execCmd(`ui-bundle upload --zip-file ${zipPath} --target-org ${targetOrg} --json`, {
      ensureExitCode: 1,
      cwd: session.dir,
    });

    expect(result.jsonOutput?.message).to.include('Missing required flag');
    expect(result.jsonOutput?.message).to.include('as-salesforce-pages');
  });

  // Real-org call: POST /connect/uibundle/deploys with a placeholder zip.
  // Requires the endpoint to be deployed on the target org; runs only when
  // TESTKIT_AUTH_URL opts into a real connection.
  it('should upload a UI Bundle and return a Queued job id (--zip-file)', () => {
    const zipPath = createZipFixture(session);

    const result = execCmd(
      `ui-bundle upload --zip-file ${zipPath} --as-salesforce-pages --target-org ${targetOrg} --json`,
      {
        ensureExitCode: 0,
        cwd: session.dir,
      }
    );

    expect(result.jsonOutput?.result).to.have.property('status', 'Queued');
    expect(result.jsonOutput?.result).to.have.property('jobId');
  });

  // Real-org call with an uncompressed source directory the CLI compresses.
  it('should upload a UI Bundle and return a Queued job id (--bundle-dir, auto-compressed)', () => {
    const bundleDir = createBundleDirFixture(session);

    const result = execCmd(
      `ui-bundle upload --bundle-dir ${bundleDir} --as-salesforce-pages --target-org ${targetOrg} --json`,
      {
        ensureExitCode: 0,
        cwd: session.dir,
      }
    );

    expect(result.jsonOutput?.result).to.have.property('status', 'Queued');
    expect(result.jsonOutput?.result).to.have.property('jobId');
  });
});
