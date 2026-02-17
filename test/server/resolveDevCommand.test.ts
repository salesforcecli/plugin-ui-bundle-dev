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

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { parseCommand, resolveDirectDevCommand } from '../../src/server/resolveDevCommand.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_RESOLVE = join(__dirname, '../fixtures/dev-server-resolve');

describe('resolveDevCommand (W-20243732)', () => {
  describe('parseCommand', () => {
    it('should split simple command into cmd and args', () => {
      expect(parseCommand('vite')).to.deep.equal(['vite']);
      expect(parseCommand('vite --port 3000')).to.deep.equal(['vite', '--port', '3000']);
    });

    it('should handle quoted parts', () => {
      expect(parseCommand('node "path with spaces"')).to.deep.equal(['node', 'path with spaces']);
    });
  });

  describe('resolveDirectDevCommand', () => {
    it('should return null when command is not npm run dev or yarn dev', () => {
      expect(resolveDirectDevCommand('/any/cwd', 'npm start')).to.be.null;
      expect(resolveDirectDevCommand('/any/cwd', 'yarn build')).to.be.null;
      expect(resolveDirectDevCommand('/any/cwd', 'node server.js')).to.be.null;
    });

    it('should return null when package.json is missing', () => {
      expect(resolveDirectDevCommand('/nonexistent/path', 'npm run dev')).to.be.null;
    });

    it('should return null when package.json has no dev script', () => {
      expect(resolveDirectDevCommand('/nonexistent', 'npm run dev')).to.be.null;
    });

    it('should resolve npm run dev to node_modules/.bin binary when fixture exists', function () {
      if (!existsSync(join(FIXTURE_RESOLVE, 'package.json'))) {
        this.skip();
      }
      const result = resolveDirectDevCommand(FIXTURE_RESOLVE, 'npm run dev');
      expect(result).to.not.be.null;
      expect(result!.cmd).to.include('node_modules');
      expect(result!.cmd).to.include('.bin');
      expect(result!.cmd).to.include('vite');
      expect(result!.args).to.deep.equal([]);
    });

    it('should resolve yarn dev to node_modules/.bin binary when fixture exists', function () {
      if (!existsSync(join(FIXTURE_RESOLVE, 'package.json'))) {
        this.skip();
      }
      const result = resolveDirectDevCommand(FIXTURE_RESOLVE, 'yarn dev');
      expect(result).to.not.be.null;
      expect(result!.cmd).to.include('vite');
    });
  });
});
