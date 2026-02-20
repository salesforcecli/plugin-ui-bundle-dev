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

import type { DevServerError, ErrorPattern } from '../config/types.js';

/**
 * Common error patterns for dev server failures
 * Ordered by specificity - most specific patterns first, fallback last
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Port conflict - very common, very stable pattern
  {
    pattern: /EADDRINUSE|port.*already in use|address already in use/i,
    type: 'port-conflict',
    title: 'Port Already in Use',
    getMessage: (stderr): string => {
      const portMatch = stderr.match(/port (\d+)|:(\d+)/i);
      const port = portMatch?.[1] ?? portMatch?.[2] ?? 'specified';
      return `Port ${port} is already in use by another process. The dev server cannot bind to this port.`;
    },
    getSuggestions: (stderr): string[] => {
      const portMatch = stderr.match(/port (\d+)|:(\d+)/i);
      const port = portMatch?.[1] ?? portMatch?.[2];
      const suggestions = ['Change the port in your framework config file (vite.config.js, etc.)'];

      if (port) {
        suggestions.unshift(`Kill the process using port ${port}: lsof -ti:${port} | xargs kill -9`);
      }

      return suggestions;
    },
  },

  // Missing dependencies - very common
  {
    pattern: /cannot find module|module not found|MODULE_NOT_FOUND/i,
    type: 'missing-module',
    title: 'Missing Dependencies',
    getMessage: (stderr): string => {
      const moduleMatch = stderr.match(/module ['"](.+?)['"]/i);
      const moduleName = moduleMatch?.[1] ?? 'required dependencies';
      return `Cannot find module '${moduleName}'. Dependencies may not be installed.`;
    },
    getSuggestions: (stderr): string[] => {
      const moduleMatch = stderr.match(/module ['"](.+?)['"]/i);
      const moduleName = moduleMatch?.[1];

      const suggestions = ['Run: npm install', 'Or: yarn install'];

      if (moduleName) {
        suggestions.push(`Check if '${moduleName}' is listed in package.json dependencies`);
      }

      return suggestions;
    },
  },

  // Syntax errors in config files
  {
    pattern: /syntax\s?error|unexpected token|unexpected identifier/i,
    type: 'syntax-error',
    title: 'Configuration Syntax Error',
    getMessage: (stderr): string => {
      const fileMatch = stderr.match(/at\s+(.+?\.(?:js|ts|json|mjs|cjs)):(\d+)/i);
      if (fileMatch) {
        return `Syntax error found in ${fileMatch[1]} at line ${fileMatch[2]}.`;
      }
      return 'A syntax error was found in your configuration or code files.';
    },
    getSuggestions: (stderr): string[] => {
      const fileMatch = stderr.match(/at\s+(.+?\.(?:js|ts|json|mjs|cjs)):(\d+)/i);
      const suggestions = [
        'Look for missing commas, brackets, or quotes',
        'Verify all code blocks are properly closed',
      ];

      if (fileMatch) {
        suggestions.unshift(`Check ${fileMatch[1]} at line ${fileMatch[2]}`);
      }

      return suggestions;
    },
  },

  // Permission errors
  {
    pattern: /EACCES|EPERM|permission denied/i,
    type: 'permission-error',
    title: 'Permission Error',
    getMessage: (): string =>
      'Insufficient permissions to access files or ports. This is often a file system permission issue.',
    getSuggestions: (): string[] => [
      'Check file and directory permissions',
      'Ensure you have write access to the project directory',
      'On Linux/Mac, verify ownership: ls -la',
    ],
  },

  // File not found
  {
    pattern: /ENOENT.*no such file or directory/i,
    type: 'file-not-found',
    title: 'File Not Found',
    getMessage: (stderr): string => {
      const fileMatch = stderr.match(/ENOENT.*['"](.+?)['"]/i);
      const file = fileMatch?.[1] ?? 'required file';
      return `Cannot find ${file}. This file is required but doesn't exist.`;
    },
    getSuggestions: (stderr): string[] => {
      const suggestions = ['Verify you are in the correct project directory', 'Check if all required files exist'];

      if (stderr.includes('package.json')) {
        suggestions.push('Make sure package.json exists in your project root');
      }

      return suggestions;
    },
  },

  // Command not found - dependencies not installed
  {
    pattern: /command not found|not recognized as.*command/i,
    type: 'missing-module',
    title: 'Dependencies Not Installed',
    getMessage: (stderr): string => {
      const cmdMatch = stderr.match(/(?:sh:|bash:)\s*(\S+):\s*command not found/i);
      const command = cmdMatch?.[1] ?? 'required command';
      return `Command '${command}' not found. Project dependencies may not be installed.`;
    },
    getSuggestions: (): string[] => ['Run: npm install', 'Or: yarn install', 'Then try running the dev command again'],
  },

  // Generic fallback - matches everything
  {
    pattern: /.*/,
    type: 'unknown',
    title: 'Dev Server Failed to Start',
    getMessage: (): string =>
      'The dev server encountered an error while starting. Check the error output below for details.',
    getSuggestions: (): string[] => [
      'Review the error output above for specific details',
      'Try running your dev command manually: npm run dev',
      'Verify your project setup is correct',
      'Check your framework documentation for this error',
    ],
  },
];

/**
 * DevServerErrorParser parses dev server stderr output and
 * categorizes errors to provide user-friendly messages
 */
export class DevServerErrorParser {
  /**
   * Parse stderr output and create a structured error object
   *
   * @param stderr - Raw stderr output from dev server process
   * @param exitCode - Process exit code (optional)
   * @param signal - Process exit signal (optional)
   * @returns Structured DevServerError with suggestions
   */
  public static parseError(stderr: string, exitCode?: number | null, signal?: string | null): DevServerError {
    // Find the first matching pattern
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(stderr)) {
        return {
          type: pattern.type,
          title: pattern.title,
          message: pattern.getMessage(stderr),
          stderrLines: this.extractRelevantLines(stderr, 15),
          suggestions: pattern.getSuggestions(stderr),
          fullStderr: stderr,
          exitCode,
          signal,
        };
      }
    }

    // This point is unreachable because the last pattern (.*) matches everything
    // TypeScript requires a return statement, so we throw an error for safety
    throw new Error('Unreachable: ERROR_PATTERNS catch-all should always match');
  }

  /**
   * Extract the most relevant lines from stderr
   * Returns the last N lines, filtered for noise
   *
   * @param stderr - Full stderr output
   * @param maxLines - Maximum number of lines to return
   * @returns Array of relevant stderr lines
   */
  private static extractRelevantLines(stderr: string, maxLines: number): string[] {
    const lines = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        // Filter out empty lines and common noise
        if (!line) return false;
        if (line.match(/^npm (WARN|ERR)/)) return false; // npm warnings
        if (line.match(/^at\s+(?:Module|Object)\._compile/)) return false; // Internal Node frames
        return true;
      });

    // Return last N lines (most recent errors)
    return lines.slice(-maxLines);
  }
}
