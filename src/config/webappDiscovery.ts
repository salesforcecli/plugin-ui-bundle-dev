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

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { SfError } from '@salesforce/core';
import type { WebAppManifest } from './manifest.js';

/**
 * Discovered webapp manifest with its file path
 */
export type DiscoveredWebapp = {
  /** Absolute path to the webapplication.json file */
  path: string;
  /** Relative path from cwd to the webapplication.json file */
  relativePath: string;
  /** Parsed manifest content */
  manifest: WebAppManifest;
};

/**
 * Directories to exclude when searching for webapplication.json files
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.venv',
  'venv',
]);

/**
 * Maximum depth to search for webapplication.json files
 */
const MAX_SEARCH_DEPTH = 10;

/**
 * Check if a directory should be excluded from search
 */
function shouldExcludeDirectory(dirName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(dirName) || dirName.startsWith('.');
}

/**
 * Try to parse a webapplication.json file and validate basic structure
 */
async function tryParseWebappManifest(filePath: string): Promise<WebAppManifest | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const manifest = JSON.parse(content) as WebAppManifest;

    // Basic validation - must have at least a name field
    if (manifest && typeof manifest.name === 'string' && manifest.name.trim()) {
      return manifest;
    }
    return null;
  } catch {
    // Invalid JSON or read error - skip this file
    return null;
  }
}

/**
 * Recursively search for webapplication.json files in a directory
 *
 * @param dir - Directory to search in
 * @param cwd - Original working directory for relative path calculation
 * @param depth - Current search depth
 * @returns Array of discovered webapps
 */
async function searchDirectory(dir: string, cwd: string, depth: number = 0): Promise<DiscoveredWebapp[]> {
  if (depth > MAX_SEARCH_DEPTH) {
    return [];
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    // Separate files and directories for parallel processing
    const webappJsonFiles = entries.filter((e) => e.isFile() && e.name === 'webapplication.json');
    const subdirectories = entries.filter((e) => e.isDirectory() && !shouldExcludeDirectory(e.name));

    // Process webapplication.json files in parallel
    const manifestPromises = webappJsonFiles.map(async (entry) => {
      const fullPath = join(dir, entry.name);
      const manifest = await tryParseWebappManifest(fullPath);
      if (manifest) {
        return {
          path: fullPath,
          relativePath: relative(cwd, fullPath) || 'webapplication.json',
          manifest,
        };
      }
      return null;
    });

    // Process subdirectories in parallel
    const subdirPromises = subdirectories.map((entry) => searchDirectory(join(dir, entry.name), cwd, depth + 1));

    // Wait for all parallel operations
    const [manifestResults, subdirResults] = await Promise.all([
      Promise.all(manifestPromises),
      Promise.all(subdirPromises),
    ]);

    // Combine results, filtering out nulls from manifest parsing
    const results: DiscoveredWebapp[] = manifestResults.filter((result): result is DiscoveredWebapp => result !== null);
    for (const subResults of subdirResults) {
      results.push(...subResults);
    }

    return results;
  } catch {
    // Permission denied or other read error - skip this directory
    return [];
  }
}

/**
 * Find all webapplication.json files in a directory and its subdirectories
 *
 * @param cwd - Directory to search from (defaults to process.cwd())
 * @returns Array of discovered webapps sorted by path
 */
export async function findWebappManifests(cwd: string = process.cwd()): Promise<DiscoveredWebapp[]> {
  const results = await searchDirectory(cwd, cwd);

  // Sort by relative path for consistent ordering
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Find a specific webapp by its manifest name field
 *
 * @param name - The webapp name to search for (matches manifest.name field)
 * @param cwd - Directory to search from (defaults to process.cwd())
 * @returns The discovered webapp or null if not found
 */
export async function findWebappByName(name: string, cwd: string = process.cwd()): Promise<DiscoveredWebapp | null> {
  const allWebapps = await findWebappManifests(cwd);
  return allWebapps.find((webapp) => webapp.manifest.name === name) ?? null;
}

/**
 * Get a single webapp manifest, handling the various discovery scenarios
 *
 * @param name - Optional webapp name to search for
 * @param cwd - Directory to search from
 * @returns Object containing the discovered webapp and all found webapps (for selection UI)
 * @throws SfError if no webapps found or named webapp not found
 */
export async function discoverWebapp(
  name: string | undefined,
  cwd: string = process.cwd()
): Promise<{ webapp: DiscoveredWebapp | null; allWebapps: DiscoveredWebapp[] }> {
  const allWebapps = await findWebappManifests(cwd);

  // No webapps found
  if (allWebapps.length === 0) {
    throw new SfError(
      'No webapplication.json found in the current directory or subdirectories.\n' +
        'Create a webapplication.json file in your project root to get started.',
      'WebappNotFoundError'
    );
  }

  // If name is provided, find the specific webapp
  if (name) {
    const webapp = allWebapps.find((w) => w.manifest.name === name);
    if (!webapp) {
      const availableNames = allWebapps.map((w) => `  - ${w.manifest.name} (${w.relativePath})`).join('\n');
      throw new SfError(
        `No webapp found with name "${name}".\n\nAvailable webapps:\n${availableNames}`,
        'WebappNameNotFoundError'
      );
    }
    return { webapp, allWebapps };
  }

  // No name provided - check if there's only one webapp
  if (allWebapps.length === 1) {
    return { webapp: allWebapps[0], allWebapps };
  }

  // Multiple webapps found - return null to indicate selection is needed
  return { webapp: null, allWebapps };
}

/**
 * Format webapp choices for display in selection prompt
 *
 * @param webapps - Array of discovered webapps
 * @returns Formatted choices with name and path info
 */
export function formatWebappChoices(webapps: DiscoveredWebapp[]): Array<{ name: string; value: DiscoveredWebapp }> {
  return webapps.map((webapp) => ({
    name: `${webapp.manifest.name} - ${webapp.manifest.label} (${webapp.relativePath})`,
    value: webapp,
  }));
}
