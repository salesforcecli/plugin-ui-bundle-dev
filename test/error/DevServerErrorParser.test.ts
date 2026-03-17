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

import { expect } from 'chai';
import { DevServerErrorParser } from '../../src/error/DevServerErrorParser.js';

describe('DevServerErrorParser', () => {
  describe('parseError', () => {
    it('should parse port conflict errors', () => {
      const stderr = `
Error: listen EADDRINUSE: address already in use 127.0.0.1:5173
    at Server.setupListenHandle [as _listen2] (node:net:1740:16)
    at listenInCluster (node:net:1788:12)
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('port-conflict');
      expect(result.title).to.equal('Port Already in Use');
      expect(result.message).to.include('Port 5173');
      expect(result.message).to.include('already in use');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.suggestions[0]).to.include('kill');
      expect(result.stderrLines).to.be.an('array');
    });

    it('should parse missing module errors', () => {
      const stderr = `
Error: Cannot find module 'vite'
Require stack:
- /Users/test/project/vite.config.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('missing-module');
      expect(result.title).to.equal('Missing Dependencies');
      expect(result.message).to.include('vite');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.suggestions.some((s) => s.includes('npm install'))).to.be.true;
    });

    it('should parse syntax errors', () => {
      const stderr = `
/Users/test/project/vite.config.js:12:5
SyntaxError: Unexpected token '}'
    at Module._compile (node:internal/modules/cjs/loader:1358:14)
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('syntax-error');
      expect(result.title).to.equal('Configuration Syntax Error');
      expect(result.message).to.include('syntax error');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.suggestions.some((s) => s.toLowerCase().includes('comma'))).to.be.true;
    });

    it('should parse permission errors', () => {
      const stderr = `
Error: EACCES: permission denied, open '/etc/config.json'
    at Object.openSync (node:fs:590:3)
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('permission-error');
      expect(result.title).to.equal('Permission Error');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.suggestions.some((s) => s.includes('permissions'))).to.be.true;
    });

    it('should parse file not found errors', () => {
      const stderr = `
Error: ENOENT: no such file or directory, open 'package.json'
    at Object.openSync (node:fs:590:3)
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('file-not-found');
      expect(result.title).to.equal('File Not Found');
      expect(result.message).to.include('package.json');
      expect(result.suggestions).to.have.length.greaterThan(0);
    });

    it('should parse command not found errors', () => {
      const stderr = `
> my-app@1.0.0 dev
> vite --mode development

sh: vite: command not found
      `;

      const result = DevServerErrorParser.parseError(stderr, 127, null);

      expect(result.type).to.equal('missing-module');
      expect(result.title).to.equal('Dependencies Not Installed');
      expect(result.message).to.include('vite');
      expect(result.message).to.include('not found');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.suggestions.some((s) => s.includes('npm install'))).to.be.true;
    });

    it('should handle various command not found formats', () => {
      const stderrFormats = [
        'sh: vite: command not found',
        'bash: npm: command not found',
        '/bin/sh: node: command not found',
        'sh: 1: vite: not found',
      ];

      for (const stderr of stderrFormats) {
        const result = DevServerErrorParser.parseError(stderr, 127, null);
        expect(result.type).to.equal('missing-module');
        expect(result.title).to.equal('Dependencies Not Installed');
      }
    });

    it('should parse dash-style command not found (Ubuntu /bin/sh)', () => {
      const stderr = `
> my-app@1.0.0 dev
> vite --mode development

sh: 1: vite: not found
      `;

      const result = DevServerErrorParser.parseError(stderr, 127, null);

      expect(result.type).to.equal('missing-module');
      expect(result.title).to.equal('Dependencies Not Installed');
      expect(result.message).to.include('vite');
      expect(result.message).to.include('not found');
      expect(result.suggestions.some((s) => s.includes('npm install'))).to.be.true;
    });

    it('should handle unknown errors with fallback', () => {
      const stderr = `
Some random error that doesn't match any pattern
This is completely custom
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('unknown');
      expect(result.title).to.equal('Dev Server Failed to Start');
      expect(result.suggestions).to.have.length.greaterThan(0);
      expect(result.stderrLines).to.be.an('array');
    });

    it('should include exit code and signal in result', () => {
      const stderr = 'Error occurred';

      const result = DevServerErrorParser.parseError(stderr, 127, 'SIGTERM');

      expect(result.exitCode).to.equal(127);
      expect(result.signal).to.equal('SIGTERM');
    });

    it('should filter out noise from stderr lines', () => {
      const stderr = `
npm WARN deprecated package@1.0.0
Error: EADDRINUSE: port already in use
npm ERR! code 1
    at Server.listen
      `;

      const result = DevServerErrorParser.parseError(stderr, 1, null);

      expect(result.type).to.equal('port-conflict');
      // Should not include npm WARN/ERR lines
      expect(result.stderrLines.join('\n')).to.not.include('npm WARN');
      expect(result.stderrLines.join('\n')).to.not.include('npm ERR');
    });

    it('should limit stderr lines to maximum', () => {
      const longStderr = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');

      const result = DevServerErrorParser.parseError(longStderr, 1, null);

      expect(result.stderrLines.length).to.be.lessThan(20);
    });

    it('should extract port number from various formats', () => {
      const stderrFormats = [
        'Error: Port 5173 is already in use',
        'EADDRINUSE: address already in use :5173',
        'listen EADDRINUSE 127.0.0.1:5173',
      ];

      for (const stderr of stderrFormats) {
        const result = DevServerErrorParser.parseError(stderr, 1, null);
        expect(result.type).to.equal('port-conflict');
        expect(result.message).to.include('5173');
        expect(result.suggestions[0]).to.include('5173');
      }
    });

    it('should extract module name from error', () => {
      const stderrFormats = [
        "Error: Cannot find module 'vite'",
        "Module not found: 'react'",
        'MODULE_NOT_FOUND: @vitejs/plugin-react',
      ];

      for (const stderr of stderrFormats) {
        const result = DevServerErrorParser.parseError(stderr, 1, null);
        expect(result.type).to.equal('missing-module');
        expect(result.title).to.equal('Missing Dependencies');
      }
    });
  });
});
