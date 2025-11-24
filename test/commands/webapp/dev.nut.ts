/*
 * Copyright 2025, Salesforce, Inc.
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

import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';

describe('webapp dev NUTs', () => {
  let session: TestSession;
  const testWebappJson = {
    name: 'testWebApp',
    label: 'Test Web App',
    version: '1.0.0',
    apiVersion: '60.0',
    outputDir: 'dist',
    dev: {
      url: 'http://localhost:5173',
    },
  };

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
    // Clean up any test webapp.json files
    const webappJsonPath = join(session?.dir ?? process.cwd(), 'webapp.json');
    if (existsSync(webappJsonPath)) {
      unlinkSync(webappJsonPath);
    }
  });

  it('should fail without target-org flag', () => {
    // Create webapp.json for this test
    const webappJsonPath = join(session.dir, 'webapp.json');
    writeFileSync(webappJsonPath, JSON.stringify(testWebappJson, null, 2));

    const result = execCmd('webapp dev --name testWebApp --json', {
      ensureExitCode: 1,
      cwd: session.dir,
    });

    expect(result.jsonOutput?.name).to.equal('NoDefaultEnvError');
    expect(result.jsonOutput?.message).to.include('target-org');

    // Clean up
    unlinkSync(webappJsonPath);
  });

  // Note: Additional error scenario tests (manifest validation, dev server config)
  // require authenticated orgs, which may not be available in all CI/CD environments.
  // These scenarios are covered by unit tests instead.
  //
  // Scenarios covered in unit tests:
  // - Missing webapp.json manifest (ManifestWatcher.test.ts)
  // - Invalid webapp.json schema (ManifestWatcher.test.ts)
  // - Malformed JSON syntax (ManifestWatcher.test.ts)
  // - Missing dev server config (DevServerManager.test.ts)
  //
  // For local testing with authenticated orgs, use manual validation scripts in:
  // docs/manual-tests/test-webapp-dev-command.ts
});
