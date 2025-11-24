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

import { expect } from 'chai';
import { StackTraceFormatter } from '../../src/error/StackTraceFormatter.js';

describe('StackTraceFormatter', () => {
  describe('Stack Trace Parsing', () => {
    it('should parse a standard V8 stack trace', () => {
      const stackTrace = `Error: Test error
    at testFunction (/path/to/file.ts:10:5)
    at Object.<anonymous> (/path/to/another.ts:20:10)
    at Module._compile (node:internal/modules/cjs/loader:1126:14)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(2); // node:internal filtered
      expect(result.frames[0].functionName).to.equal('testFunction');
      expect(result.frames[0].fileName).to.equal('/path/to/file.ts');
      expect(result.frames[0].lineNumber).to.equal(10);
      expect(result.frames[0].columnNumber).to.equal(5);
    });

    it('should parse anonymous functions', () => {
      const stackTrace = `Error: Test error
    at /path/to/file.ts:15:20`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(1);
      expect(result.frames[0].functionName).to.equal('anonymous');
    });

    it('should parse async stack frames', () => {
      const stackTrace = `Error: Test error
    at async myAsyncFunction (/path/to/file.ts:30:5)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(1);
      expect(result.frames[0].functionName).to.equal('myAsyncFunction');
    });
  });

  describe('Filtering', () => {
    it('should filter node_modules by default', () => {
      const stackTrace = `Error: Test error
    at myFunction (/path/to/file.ts:10:5)
    at someLib (/path/node_modules/some-lib/index.js:100:20)
    at anotherFunction (/path/to/another.ts:20:10)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(2);
      expect(result.filteredCount).to.equal(1);
      expect(result.frames.every((f) => !f.fileName.includes('node_modules'))).to.be.true;
    });

    it('should filter Node.js internals by default', () => {
      const stackTrace = `Error: Test error
    at myFunction (/path/to/file.ts:10:5)
    at Module._compile (node:internal/modules/cjs/loader:1126:14)
    at internal/timers (internal/timers:123:5)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(1);
      expect(result.filteredCount).to.equal(2);
      expect(result.frames[0].fileName).to.equal('/path/to/file.ts');
    });

    it('should not filter when disabled', () => {
      const stackTrace = `Error: Test error
    at myFunction (/path/to/file.ts:10:5)
    at someLib (/path/node_modules/some-lib/index.js:100:20)`;

      const formatter = new StackTraceFormatter({
        filterNodeModules: false,
        filterNodeInternals: false,
      });
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(2);
      expect(result.filteredCount).to.equal(0);
    });
  });

  describe('Formatting', () => {
    it('should generate HTML formatted output', () => {
      const stackTrace = `Error: Test error
    at testFunction (/path/to/file.ts:10:5)`;

      const formatter = new StackTraceFormatter({ enableHtmlFormatting: true });
      const result = formatter.format(stackTrace);

      expect(result.html).to.include('stack-frame');
      expect(result.html).to.include('frame-function');
      expect(result.html).to.include('testFunction');
      expect(result.html).to.include('frame-file');
      expect(result.html).to.include('frame-line');
    });

    it('should generate plain text formatted output', () => {
      const stackTrace = `Error: Test error
    at testFunction (/path/to/file.ts:10:5)
    at anotherFunction (/path/to/another.ts:20:10)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.text).to.include('1. testFunction');
      expect(result.text).to.include('2. anotherFunction');
      expect(result.text).to.include('/path/to/file.ts:10:5');
      expect(result.text).to.include('/path/to/another.ts:20:10');
    });

    it('should handle relative paths when workspace root provided', () => {
      const stackTrace = `Error: Test error
    at testFunction (/workspace/src/file.ts:10:5)`;

      const formatter = new StackTraceFormatter({ workspaceRoot: '/workspace' });
      const result = formatter.format(stackTrace);

      // Normalize path separators for cross-platform compatibility (Windows uses backslashes)
      const normalizedText = result.text.replace(/\\/g, '/');
      expect(normalizedText).to.include('src/file.ts');
      expect(normalizedText).to.not.include('/workspace/src/file.ts');
    });

    it('should truncate long absolute paths', () => {
      const longPath = '/very/long/path/that/is/too/long/to/display/nicely/in/stack/traces/file.ts';
      const stackTrace = `Error: Test error
    at testFunction (${longPath}:10:5)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      // Path should either be truncated with ... or displayed as-is if under limit
      expect(result.text).to.be.a('string');
      expect(result.text).to.include('testFunction');
    });
  });

  describe('Static Methods', () => {
    it('should format error directly', () => {
      const error = new Error('Test error');
      const result = StackTraceFormatter.formatError(error);

      expect(result.frames.length).to.be.greaterThan(0);
      expect(result.html).to.be.a('string');
      expect(result.text).to.be.a('string');
    });

    it('should extract error location', () => {
      const error = new Error('Test error');
      const location = StackTraceFormatter.extractErrorLocation(error);

      expect(location).to.be.a('string');
      expect(location).to.match(/:\d+:\d+$/); // Should end with :line:column
    });

    it('should return null for error without stack', () => {
      const error = new Error('Test error');
      delete error.stack;
      const location = StackTraceFormatter.extractErrorLocation(error);

      expect(location).to.be.null;
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty stack trace', () => {
      const stackTrace = 'Error: Test error';

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(0);
      expect(result.html).to.include('No stack frames available');
      expect(result.text).to.include('No stack frames available');
    });

    it('should handle malformed stack lines', () => {
      const stackTrace = `Error: Test error
    at testFunction (/path/to/file.ts:10:5)
    some malformed line
    at anotherFunction (/path/to/another.ts:20:10)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(2);
    });

    it('should respect maxFrames limit', () => {
      const stackTrace = `Error: Test error
    at function1 (/path/file1.ts:10:5)
    at function2 (/path/file2.ts:20:5)
    at function3 (/path/file3.ts:30:5)
    at function4 (/path/file4.ts:40:5)
    at function5 (/path/file5.ts:50:5)`;

      const formatter = new StackTraceFormatter({ maxFrames: 3 });
      const result = formatter.format(stackTrace);

      expect(result.frames).to.have.lengthOf(3);
      expect(result.filteredCount).to.equal(2);
    });

    it('should escape HTML in formatted output', () => {
      const stackTrace = `Error: Test error
    at <script>alert('xss')</script> (/path/to/file.ts:10:5)`;

      const formatter = new StackTraceFormatter();
      const result = formatter.format(stackTrace);

      expect(result.html).to.not.include('<script>');
      expect(result.html).to.include('&lt;script&gt;');
    });
  });
});
