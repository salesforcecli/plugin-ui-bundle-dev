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

import { readFile } from 'node:fs/promises';
import { SfError } from '@salesforce/core';

// Re-export base types from @salesforce/webapp-experimental package
export type {
  WebAppManifest as BaseWebAppManifest,
  RoutingConfig,
  RewriteRule,
  RedirectRule,
} from '@salesforce/webapp-experimental/app';

// Import for local use
import type { WebAppManifest as BaseWebAppManifest } from '@salesforce/webapp-experimental/app';

/**
 * Development configuration (plugin-specific extension)
 * NOT in @salesforce/webapp-experimental package
 */
export type DevConfig = {
  /** Command to run the dev server (e.g., "npm run dev") */
  command?: string;
  /** Explicit URL for the dev server */
  url?: string;
};

/**
 * WebApp manifest configuration - defines the structure of webapplication.json file
 * Extended from @salesforce/webapp-experimental with plugin-specific fields
 */
export type WebAppManifest = BaseWebAppManifest & {
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
      `webapplication.json missing required field${errors.length > 1 ? 's' : ''}: ${errors.join(', ')}`,
      'ManifestValidationError'
    );
  }
}

/**
 * Load and parse webapplication.json manifest
 *
 * @param manifestPath - Path to the webapplication.json file
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
        `webapplication.json not found at: ${manifestPath}. Create a webapplication.json file in your project root.`,
        'ManifestNotFoundError'
      );
    }
    if (error instanceof SyntaxError) {
      throw new SfError(`webapplication.json contains invalid JSON: ${error.message}`, 'ManifestParseError');
    }
    throw new SfError(
      `Failed to load webapplication.json: ${error instanceof Error ? error.message : String(error)}`,
      'ManifestLoadError'
    );
  }
}
