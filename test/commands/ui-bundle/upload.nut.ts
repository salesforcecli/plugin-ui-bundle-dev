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
import { createZipFixture, authOrgViaUrl } from './helpers/uiBundleProjectUtils.js';

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
  // mirroring dev.nut.ts:52-60.
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

  // Real-org call: POST /connect/uibundle/deploys with a placeholder zip.
  // Requires the endpoint to be deployed on the target org; runs only when
  // TESTKIT_AUTH_URL opts into a real connection.
  it('should upload a UI Bundle and return a Queued job id', () => {
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
});
