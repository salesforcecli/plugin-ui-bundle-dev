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

// This file is adapted from @salesforce/webapps package
// When the package is published to npm, replace with: import { loadManifest, WebAppManifest } from '@salesforce/webapps';

import { readFile } from 'node:fs/promises';
import { SfError } from '@salesforce/core';

/**
 * URL rewrite rule - rewrites a URL path without changing the browser URL
 */
export type RewriteRule = {
  /** Source route pattern (supports :param and * wildcards) */
  route: string;
  /** Target path to rewrite to */
  target: string;
};

/**
 * URL redirect rule - redirects to a different URL with an HTTP status code
 */
export type RedirectRule = {
  /** Source route pattern (supports :param and * wildcards) */
  route: string;
  /** Target URL to redirect to */
  target: string;
  /** HTTP redirect status code */
  statusCode: 301 | 302 | 307 | 308;
};

/**
 * Routing configuration for the webapp
 */
export type RoutingConfig = {
  /** URL rewrite rules */
  rewrites?: RewriteRule[];
  /** URL redirect rules */
  redirects?: RedirectRule[];
  /** Trailing slash handling strategy */
  trailingSlash?: 'always' | 'never' | 'auto';
  /** Fallback route for unmatched paths */
  fallback?: string;
};

/**
 * Development configuration (plugin-specific extension)
 */
export type DevConfig = {
  /** Command to run the dev server (e.g., "npm run dev") */
  command?: string;
  /** Explicit URL for the dev server */
  url?: string;
};

/**
 * WebApp manifest configuration - defines the structure of webapp.json file
 * Extended from @salesforce/webapps with plugin-specific fields
 */
export type WebAppManifest = {
  /** Unique name identifier for the webapp */
  name: string;
  /** Display label for the webapp */
  label: string;
  /** Optional description of the webapp */
  description?: string;
  /** Version string (e.g., "1.0.0") */
  version: string;
  /** Output directory for build artifacts */
  outputDir: string;
  /** Optional routing configuration (from webapps) */
  routing?: RoutingConfig;
  /** Development configuration (plugin-specific) */
  dev?: DevConfig;
};

/**
 * Validate required fields in webapp manifest
 * Basic validation - schema validation may be added later
 *
 * @param manifest - The manifest object to validate
 * @throws SfError if any required field is missing
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
    throw new SfError(
      `webapp.json missing required field${errors.length > 1 ? 's' : ''}: ${errors.join(', ')}`,
      'ManifestValidationError'
    );
  }
}

/**
 * Load and parse webapp.json manifest
 *
 * @param manifestPath - Path to the webapp.json file
 * @returns Promise resolving to the parsed manifest
 * @throws SfError if manifest file not found or validation fails
 */
export async function loadManifest(manifestPath: string): Promise<WebAppManifest> {
  try {
    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as WebAppManifest;

    validateManifest(manifest);

    return manifest;
  } catch (error) {
    if (error instanceof SfError) {
      throw error;
    }
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new SfError(
        `webapp.json not found at: ${manifestPath}. Create a webapp.json file in your project root.`,
        'ManifestNotFoundError'
      );
    }
    if (error instanceof SyntaxError) {
      throw new SfError(`webapp.json contains invalid JSON: ${error.message}`, 'ManifestParseError');
    }
    throw new SfError(
      `Failed to load webapp.json: ${error instanceof Error ? error.message : String(error)}`,
      'ManifestLoadError'
    );
  }
}
