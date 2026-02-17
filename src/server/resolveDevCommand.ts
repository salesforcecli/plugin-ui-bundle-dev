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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Split a command string into executable and args, respecting quoted strings.
 * Used for both "npm run dev" and parsed dev script (e.g. "vite", "vite --port 3000").
 */
export function parseCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [command];
  return parts.map((part) => part.replace(/^["']|["']$/g, ''));
}

/**
 * When command is "npm run dev" (or "yarn dev"), resolve to the webapp's dev script
 * binary under node_modules/.bin to avoid npm workspace resolution issues when the
 * project lives inside a monorepo (e.g. "multiple workspaces with the same name").
 * Returns null to fall back to the original command.
 */
export function resolveDirectDevCommand(
  cwd: string,
  command: string
): { cmd: string; args: string[] } | null {
  const trimmed = command.trim();
  if (trimmed !== 'npm run dev' && trimmed !== 'yarn dev') {
    return null;
  }
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return null;
  }
  let pkg: { scripts?: { dev?: string } };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: { dev?: string } };
  } catch {
    return null;
  }
  const script = pkg.scripts?.dev;
  if (!script || typeof script !== 'string') {
    return null;
  }
  const parts = parseCommand(script);
  const binName = parts[0];
  if (!binName) {
    return null;
  }
  const binPath = join(cwd, 'node_modules', '.bin', binName);
  if (!existsSync(binPath)) {
    return null;
  }
  return { cmd: binPath, args: parts.slice(1) };
}
