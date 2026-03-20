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

// Re-export manifest types from manifest.ts
export type { WebAppManifest, DevConfig, RoutingConfig, RewriteRule, RedirectRule } from './manifest.js';

// Re-export from ManifestWatcher
export type { ManifestChangeEvent } from './ManifestWatcher.js';

/**
 * Command execution result
 * What the sf multi-framework dev command returns to the user
 */
export type WebAppDevResult = {
  /** Proxy server URL (where user should open browser) */
  url: string;
  /** Dev server URL being proxied */
  devServerUrl: string;
};

/**
 * Dev server configuration options
 * Options for starting and managing the dev server process
 */
export type DevServerOptions = {
  /** Command to run the dev server (e.g., "npm run dev", "yarn dev") */
  command?: string;
  /**
   * URL from config/default. Behavior depends on command:
   * - url without command: skip spawning, use URL as-is, emit ready immediately
   * - url with command: spawn process, no stdout parsing; caller verifies via polling
   */
  url?: string;
  /** Working directory for the dev server process */
  cwd?: string;
  /** Timeout in milliseconds to wait for dev server to start (ignored when url+command; caller polls) */
  startupTimeout?: number;
};

/**
 * Parsed dev server error with context and suggestions
 * Used to provide user-friendly error messages in the browser
 */
export type DevServerError = {
  /** Type of error for categorization */
  type: 'port-conflict' | 'missing-module' | 'syntax-error' | 'permission-error' | 'file-not-found' | 'unknown';
  /** Human-readable error title */
  title: string;
  /** Detailed error message */
  message: string;
  /** Relevant lines from stderr (last 10-15 lines) */
  stderrLines: string[];
  /** Actionable suggestions to fix the error */
  suggestions: string[];
  /** Original full stderr output (for debugging) */
  fullStderr?: string;
  /** Exit code from the process (if available) */
  exitCode?: number | null;
  /** Signal that terminated the process (if available) */
  signal?: string | null;
};

/**
 * Error pattern for matching and parsing dev server errors
 * Used by DevServerErrorParser to categorize errors
 */
export type ErrorPattern = {
  /** Regex pattern to match against stderr */
  pattern: RegExp;
  /** Error type identifier */
  type: DevServerError['type'];
  /** Human-readable error title */
  title: string;
  /** Error message template or function */
  getMessage: (stderr: string) => string;
  /** Function to generate context-aware suggestions */
  getSuggestions: (stderr: string) => string[];
};
