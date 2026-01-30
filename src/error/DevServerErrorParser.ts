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

    // Fallback (should never reach here due to catch-all pattern)
    return this.createGenericError(stderr, exitCode, signal);
  }

  /**
   * Check if an error should trigger automatic restart
   * Some errors are transient, others are permanent
   *
   * @param error - Parsed dev server error
   * @returns True if error might be resolved by restart
   */
  public static shouldRetry(error: DevServerError): boolean {
    // Don't retry these permanent error types
    const permanentErrors: Array<DevServerError['type']> = [
      'syntax-error',
      'missing-module',
      'file-not-found',
      'permission-error',
    ];

    return !permanentErrors.includes(error.type);
  }

  /**
   * Get a concise summary line for logging
   *
   * @param error - Parsed dev server error
   * @returns One-line summary string
   */
  public static getSummary(error: DevServerError): string {
    return `${error.title}: ${error.message}`;
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

  /**
   * Create a generic error when no specific pattern matches
   *
   * @param stderr - Full stderr output
   * @param exitCode - Process exit code
   * @param signal - Process exit signal
   * @returns Generic DevServerError
   */
  private static createGenericError(stderr: string, exitCode?: number | null, signal?: string | null): DevServerError {
    return {
      type: 'unknown',
      title: 'Dev Server Failed to Start',
      message: 'The dev server encountered an error. Check the error output below for details.',
      stderrLines: this.extractRelevantLines(stderr, 15),
      suggestions: [
        'Review the error output above',
        'Try running your dev command manually to debug',
        'Verify your project setup is correct',
      ],
      fullStderr: stderr,
      exitCode,
      signal,
    };
  }
}
