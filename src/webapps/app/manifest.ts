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

import { readFile } from 'node:fs/promises';

// WebApp manifest configuration - defines the structure of webapp.json file
export interface WebAppManifest {
  // Unique name identifier for the webapp
  name: string;
  // Display label for the webapp
  label: string;
  // Optional description of the webapp
  description?: string;
  // Version string (e.g., "1.0.0")
  version: string;
  // Output directory for build artifacts
  outputDir: string;
  // Optional routing configuration
  routing?: RoutingConfig;
}

// Routing configuration for the webapp - defines URL rewriting, redirects, and trailing slash behavior
export interface RoutingConfig {
  // URL rewrite rules
  rewrites?: RewriteRule[];
  // URL redirect rules
  redirects?: RedirectRule[];
  // Trailing slash handling strategy
  trailingSlash?: 'always' | 'never' | 'auto';
  // Fallback route for unmatched paths
  fallback?: string;
}

// URL rewrite rule - rewrites a URL path to a different path without changing the browser URL
export interface RewriteRule {
  // Source route pattern (supports :param and * wildcards)
  route: string;
  // Target path to rewrite to
  target: string;
}

// URL redirect rule - redirects a URL to a different URL with an HTTP status code
export interface RedirectRule {
  // Source route pattern (supports :param and * wildcards)
  route: string;
  // Target URL to redirect to
  target: string;
  // HTTP redirect status code
  statusCode: 301 | 302 | 307 | 308;
}

/**
 * Validate required fields in webapp manifest
 *
 * @param manifest - The manifest object to validate
 * @throws Error if any required field is missing
 */
function validateManifest(manifest: WebAppManifest): void {
  const errors: string[] = [];

  if (!manifest.name) {
    errors.push('name');
  }

  if (!manifest.label) {
    errors.push('label');
  }

  if (!manifest.version) {
    errors.push('version');
  }

  if (!manifest.outputDir) {
    errors.push('outputDir');
  }

  if (errors.length > 0) {
    throw new Error(`Manifest missing required field${errors.length > 1 ? 's' : ''}: ${errors.join(', ')}`);
  }
}

/**
 * Load and parse webapp.json manifest
 *
 * @param manifestPath - Path to the webapp.json file
 * @returns Promise resolving to the parsed manifest
 * @throws Error if manifest file not found or validation fails
 */
export async function loadManifest(manifestPath: string): Promise<WebAppManifest> {
  try {
    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as WebAppManifest;

    validateManifest(manifest);

    return manifest;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Manifest not found at: ${manifestPath}`);
    }
    throw error;
  }
}
