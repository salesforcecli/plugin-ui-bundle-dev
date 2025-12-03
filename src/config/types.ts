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

/**
 * Development configuration for webapp.json manifest
 * This tells the CLI how to start and connect to your dev server
 */
export type WebAppDevConfig = {
  /** Command to run the dev server (e.g., "npm run dev") */
  command?: string;
  /** Explicit URL for the dev server (overrides auto-detection) */
  url?: string;
};

/**
 * Complete webapp.json manifest schema
 * This is the configuration file users create in their project
 */
export type WebAppManifest = {
  /** Additional custom properties allowed */
  [key: string]: unknown;
  /** Unique name identifier for the web app (e.g., "customerPortal") */
  name: string;
  /** Human-readable label for the web app (e.g., "Customer Portal") */
  label: string;
  /** Description of the web app */
  description?: string;
  /** Version of the web app (semantic versioning: "1.0.0") */
  version: string;
  /** Salesforce API version (e.g., "60.0") */
  apiVersion: string;
  /** Output directory for built assets (e.g., "dist" or "build") */
  outputDir: string;
  /** Development configuration (optional) */
  dev?: WebAppDevConfig;
};

/**
 * Proxy server configuration
 * Internal config used to set up the proxy server
 */
export type ProxyConfig = {
  /** Port for the proxy server (default: 4545) */
  port: number;
  /** URL of the dev server to proxy to (e.g., http://localhost:5173) */
  devServerUrl: string;
  /** Salesforce org instance URL (e.g., https://your-org.salesforce.com) */
  instanceUrl: string;
  /** Enable debug logging */
  debug: boolean;
  /** Target org alias (e.g., "myorg") */
  targetOrg: string;
};

/**
 * Authentication headers for Salesforce requests
 * These are injected into API requests going to Salesforce
 */
export type AuthHeaders = {
  /** Additional headers can be added as needed */
  [key: string]: string;
  /** Authorization header with bearer token */
  authorization: string;
};

/**
 * Routing decision result
 * Tells us where to send a request and if it needs auth
 */
export type RouteTarget = {
  /** Target URL to proxy the request to */
  targetUrl: string;
  /** Whether this is a Salesforce API request requiring authentication */
  requiresAuth: boolean;
  /** Request type identifier */
  type: 'salesforce-api' | 'dev-server';
};

/**
 * Dev server process status
 * Information about the running dev server process
 */
export type DevServerStatus = {
  /** Whether the dev server is running */
  running: boolean;
  /** Detected or configured URL of the dev server */
  url?: string;
  /** Process ID if running */
  pid?: number;
  /** Error message if failed to start */
  error?: string;
};

/**
 * Proxy server status
 * Information about the running proxy server
 */
export type ProxyStatus = {
  /** Whether the proxy is running */
  running: boolean;
  /** Proxy server URL (e.g., http://localhost:4545) */
  url?: string;
  /** Port the proxy is listening on */
  port?: number;
};

/**
 * Command execution result
 * What the sf webapp dev command returns to the user
 */
export type WebAppDevResult = {
  /** Name of the web app */
  name: string;
  /** Proxy server URL (where user should open browser) */
  url: string;
  /** Port the proxy is running on */
  port: number;
  /** Target org being used */
  targetOrg: string;
  /** Dev server URL being proxied */
  devServerUrl: string;
};

/**
 * Manifest validation error
 * Used when webapp.json has invalid data
 */
export type ManifestValidationError = {
  /** Field that has the error (e.g., "name", "version") */
  field: string;
  /** Error message explaining what's wrong */
  message: string;
  /** Suggested fix to help the user */
  suggestion?: string;
};

/**
 * Manifest change event
 * Emitted when webapp.json file changes
 */
export type ManifestChangeEvent = {
  /** Type of change */
  type: 'added' | 'changed' | 'removed';
  /** Path to the manifest file */
  path: string;
  /** New manifest data (if added or changed) */
  manifest?: WebAppManifest;
};

/**
 * Dev server configuration options
 * Options for starting and managing the dev server process
 */
export type DevServerOptions = {
  /** Command to run the dev server (e.g., "npm run dev", "yarn dev") */
  command?: string;
  /** Explicit URL override (skips auto-detection if provided) */
  explicitUrl?: string;
  /** Working directory for the dev server process */
  cwd?: string;
  /** Timeout in milliseconds to wait for dev server to start */
  startupTimeout?: number;
  /** Maximum number of restart attempts on crash */
  maxRestarts?: number;
};

/**
 * Dev server event types
 * Events emitted by DevServerManager for lifecycle tracking
 */
export type DevServerEvents = {
  /** Emitted when dev server is ready and URL is detected */
  ready: (url: string) => void;
  /** Emitted when dev server process exits */
  exit: (code: number | null, signal: string | null) => void;
  /** Emitted when dev server encounters an error */
  error: (error: Error | DevServerError) => void;
  /** Emitted when dev server outputs to stdout (when SF_LOG_LEVEL=debug) */
  stdout: (data: string) => void;
  /** Emitted when dev server outputs to stderr */
  stderr: (data: string) => void;
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
