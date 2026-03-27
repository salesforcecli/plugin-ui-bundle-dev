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

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Root-level cleanup: remove any test_session_* directories left behind.
 *
 * TestSession.clean() normally deletes these, but they can persist when:
 * - rm fails (e.g. Windows file locks from spawned processes)
 * - Process is killed before after() runs (timeout, SIGKILL)
 * - TESTKIT_SAVE_ARTIFACTS is set
 *
 * This hook runs after all NUTs complete as a fallback.
 */
after(() => {
  const cwd = process.cwd();
  try {
    for (const name of readdirSync(cwd)) {
      if (name.startsWith('test_session_')) {
        try {
          rmSync(join(cwd, name), { recursive: true, force: true });
        } catch {
          /* ignore per-dir failures */
        }
      }
    }
  } catch {
    /* ignore */
  }
});
