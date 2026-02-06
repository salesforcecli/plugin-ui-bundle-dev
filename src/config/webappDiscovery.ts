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
import { basename, dirname, join, relative } from 'node:path';
import { SfError } from '@salesforce/core';
import type { WebAppManifest } from './manifest.js';

/**
 * Default command to run when no webapplication.json manifest is found
 */
export const DEFAULT_DEV_COMMAND = 'npm run dev';

/**
 * Pattern to match the webapplications folder (case-insensitive)
 */
const WEBAPPLICATIONS_FOLDER_PATTERN = /^webapplications$/i;

/**
 * Discovered webapp with its directory path and optional manifest
 */
export type DiscoveredWebapp = {
  /** Absolute path to the webapp directory */
  path: string;
  /** Relative path from cwd to the webapp directory */
  relativePath: string;
  /** Parsed manifest content (null if no webapplication.json found) */
  manifest: WebAppManifest | null;
  /** Webapp name (from manifest.name or folder name) */
  name: string;
  /** Whether this webapp has a webapplication.json manifest file */
  hasManifest: boolean;
  /** Path to the manifest file (null if no manifest) */
  manifestPath: string | null;
};

/**
 * Directories to exclude when searching for webapplications folder
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
 * Maximum depth to search for webapplications folder
 */
const MAX_SEARCH_DEPTH = 10;

/**
 * Check if a directory should be excluded from search
 */
function shouldExcludeDirectory(dirName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(dirName) || dirName.startsWith('.');
}

/**
 * Check if a folder name matches "webapplications" (case-insensitive)
 */
function isWebapplicationsFolder(folderName: string): boolean {
  return WEBAPPLICATIONS_FOLDER_PATTERN.test(folderName);
}

/**
 * Try to parse a webapplication.json file.
 * Accepts any valid JSON object - missing fields will use defaults.
 */
async function tryParseWebappManifest(filePath: string): Promise<WebAppManifest | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const manifest = JSON.parse(content) as WebAppManifest;

    // Accept any valid JSON object (missing fields will use defaults)
    if (manifest && typeof manifest === 'object') {
      return manifest;
    }
    return null;
  } catch {
    // Invalid JSON or read error - no manifest
    return null;
  }
}

/**
 * Recursively search for the webapplications folder (case-insensitive)
 *
 * @param dir - Directory to search in
 * @param depth - Current search depth
 * @returns Path to webapplications folder or null if not found
 */
async function findWebapplicationsFolderRecursive(dir: string, depth: number = 0): Promise<string | null> {
  if (depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    // Check if any directory at this level is "webapplications" (case-insensitive)
    const webappsFolder = entries.find((e) => e.isDirectory() && isWebapplicationsFolder(e.name));
    if (webappsFolder) {
      return join(dir, webappsFolder.name);
    }

    // Recursively search subdirectories in parallel
    const subdirectories = entries.filter((e) => e.isDirectory() && !shouldExcludeDirectory(e.name));

    const results = await Promise.all(
      subdirectories.map((subdir) => findWebapplicationsFolderRecursive(join(dir, subdir.name), depth + 1))
    );

    // Return the first non-null result
    return results.find((result) => result !== null) ?? null;
  } catch {
    // Permission denied or other read error - skip this directory
    return null;
  }
}

/**
 * Check if we're inside a webapplications folder by traversing upward through parent directories.
 *
 * This handles cases where the user runs the command from inside a webapp folder:
 *
 * Example 1: Running from /project/webapplications/my-app/src/
 * Traverses: src -> my-app -> webapplications (found!)
 * Returns: { webappsFolder: "/project/webapplications", currentWebappName: "my-app" }
 *
 * Example 2: Running from /project/webapplications/my-app/
 * Checks parent: webapplications (found!)
 * Returns: { webappsFolder: "/project/webapplications", currentWebappName: "my-app" }
 *
 * Example 3: Running from /project/webapplications/
 * Current dir is webapplications (found!)
 * Returns: { webappsFolder: "/project/webapplications", currentWebappName: null }
 *
 * Example 4: Running from /project/src/
 * Traverses: src -> project -> / (not found)
 * Returns: null (will fall back to downward search)
 *
 * @param dir - Directory to start from
 * @returns Object with webapplications folder path and current webapp name, or null if not found
 */
function findWebapplicationsFolderUpward(
  dir: string
): { webappsFolder: string; currentWebappName: string | null } | null {
  let currentDir = dir;
  let childDir: string | null = null; // Tracks the previous dir as we move up
  const maxUpwardDepth = 10;
  let depth = 0;

  // Walk up the directory tree looking for "webapplications" folder
  while (depth < maxUpwardDepth) {
    const dirName = basename(currentDir);
    const parentDir = dirname(currentDir);

    // Case: Current directory IS the webapplications folder
    // e.g., cwd = /project/webapplications
    if (isWebapplicationsFolder(dirName)) {
      return {
        webappsFolder: currentDir,
        currentWebappName: childDir ? basename(childDir) : null,
      };
    }

    // Case: Parent directory is the webapplications folder
    // e.g., cwd = /project/webapplications/my-app (parent is webapplications)
    if (isWebapplicationsFolder(basename(parentDir))) {
      return {
        webappsFolder: parentDir,
        currentWebappName: dirName, // Current dir is the webapp folder name
      };
    }

    // Reached filesystem root - stop searching
    if (parentDir === currentDir) {
      break;
    }

    // Move up one level
    childDir = currentDir;
    currentDir = parentDir;
    depth++;
  }

  // Not inside a webapplications folder
  return null;
}

/**
 * Discover all webapps inside the webapplications folder
 * Each subdirectory is treated as a webapp. If a webapplication.json exists, use it.
 * Otherwise, use the folder name as the webapp name with defaults.
 *
 * @param webappsFolderPath - Absolute path to the webapplications folder
 * @param cwd - Original working directory for relative path calculation
 * @returns Array of discovered webapps
 */
async function discoverWebappsInFolder(webappsFolderPath: string, cwd: string): Promise<DiscoveredWebapp[]> {
  try {
    const entries = await readdir(webappsFolderPath, { withFileTypes: true });

    // Get all subdirectories (each is a potential webapp)
    const webappDirs = entries.filter((e) => e.isDirectory() && !shouldExcludeDirectory(e.name));

    // Process each webapp directory in parallel
    const webappPromises = webappDirs.map(async (entry): Promise<DiscoveredWebapp> => {
      const webappPath = join(webappsFolderPath, entry.name);
      const manifestFilePath = join(webappPath, 'webapplication.json');

      // Try to load manifest
      const manifest = await tryParseWebappManifest(manifestFilePath);

      if (manifest) {
        // Webapp has manifest file - use manifest data with folder name as fallback
        // Name: use manifest.name if present, otherwise folder name
        const webappName =
          manifest.name && typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name : entry.name;

        return {
          path: webappPath,
          relativePath: relative(cwd, webappPath) || entry.name,
          manifest,
          name: webappName,
          hasManifest: true,
          manifestPath: manifestFilePath,
        };
      } else {
        // No manifest file - use folder name and defaults
        return {
          path: webappPath,
          relativePath: relative(cwd, webappPath) || entry.name,
          manifest: null,
          name: entry.name,
          hasManifest: false,
          manifestPath: null,
        };
      }
    });

    return await Promise.all(webappPromises);
  } catch {
    // Permission denied or other read error
    return [];
  }
}

/**
 * Result of finding all webapps, includes hint for auto-selection
 */
type FindAllWebappsResult = {
  /** All discovered webapps */
  webapps: DiscoveredWebapp[];
  /** Name of webapp user is currently inside (for auto-selection), null if not inside any */
  currentWebappName: string | null;
  /** Whether the webapplications folder was found (even if empty) */
  webappsFolderFound: boolean;
};

/**
 * Find all webapps in the webapplications folder.
 * Also returns a hint if the user is currently inside a specific webapp folder.
 *
 * @param cwd - Directory to search from (defaults to process.cwd())
 * @returns Object with discovered webapps and currentWebappName hint for auto-selection
 */
async function findAllWebapps(cwd: string = process.cwd()): Promise<FindAllWebappsResult> {
  // Step 1: Check upward first - this gives us currentWebappName if inside a webapp
  const upwardResult = findWebapplicationsFolderUpward(cwd);

  let webappsFolder: string | null = null;
  let currentWebappName: string | null = null;

  if (upwardResult) {
    webappsFolder = upwardResult.webappsFolder;
    currentWebappName = upwardResult.currentWebappName;
  } else {
    // Step 2: Search downward if not found upward
    webappsFolder = await findWebapplicationsFolderRecursive(cwd);
  }

  if (!webappsFolder) {
    return { webapps: [], currentWebappName: null, webappsFolderFound: false };
  }

  // Discover all webapps in the folder
  const webapps = await discoverWebappsInFolder(webappsFolder, cwd);

  // Sort by name for consistent ordering
  return {
    webapps: webapps.sort((a, b) => a.name.localeCompare(b.name)),
    currentWebappName,
    webappsFolderFound: true,
  };
}

/**
 * Result of webapp discovery
 */
type DiscoverWebappResult = {
  /** The selected/discovered webapp (null if user needs to select) */
  webapp: DiscoveredWebapp | null;
  /** All discovered webapps */
  allWebapps: DiscoveredWebapp[];
  /** Whether the webapp was auto-selected because user is inside its folder */
  autoSelected: boolean;
};

/**
 * Get a single webapp, handling the various discovery scenarios.
 *
 * Selection priority:
 * 1. If --name flag provided, find that specific webapp
 * 2. If user is inside a webapp folder, auto-select that webapp
 * 3. If only one webapp exists, auto-select it
 * 4. If multiple webapps, return null (user must select)
 *
 * @param name - Optional webapp name to search for
 * @param cwd - Directory to search from
 * @returns Object containing the discovered webapp, all webapps, and autoSelected flag
 * @throws SfError if no webapps found or named webapp not found
 */
export async function discoverWebapp(
  name: string | undefined,
  cwd: string = process.cwd()
): Promise<DiscoverWebappResult> {
  const { webapps: allWebapps, currentWebappName, webappsFolderFound } = await findAllWebapps(cwd);

  // No webapps found
  if (allWebapps.length === 0) {
    if (webappsFolderFound) {
      // Folder exists but is empty
      throw new SfError(
        'Found "webapplications" folder but no webapps inside it.\n' +
          'Create webapp subdirectories inside the "webapplications" folder to get started.\n\n' +
          'Expected structure:\n' +
          '  webapplications/\n' +
          '    ├── my-app-1/\n' +
          '    │   └── webapplication.json (optional)\n' +
          '    └── my-app-2/',
        'WebappNotFoundError'
      );
    } else {
      // Folder doesn't exist
      throw new SfError(
        'No webapplications folder found in the current directory or subdirectories.\n' +
          'Create a "webapplications" folder with webapp subdirectories to get started.\n\n' +
          'Expected structure:\n' +
          '  webapplications/\n' +
          '    ├── my-app-1/\n' +
          '    │   └── webapplication.json (optional)\n' +
          '    └── my-app-2/',
        'WebappNotFoundError'
      );
    }
  }

  // Priority 1: If name is provided via --name flag, find that specific webapp
  if (name) {
    const webapp = allWebapps.find((w) => w.name === name);
    if (!webapp) {
      const WARNING = '\u26A0\uFE0F'; // ⚠️

      const availableNames = allWebapps
        .map((w) => `  - ${w.name} - (Path:${w.relativePath})${w.hasManifest ? '' : ` - ${WARNING} No Manifest`}`)
        .join('\n');
      throw new SfError(
        `No webapp found with name "${name}".\n\nAvailable webapps:\n${availableNames}`,
        'WebappNameNotFoundError'
      );
    }
    return { webapp, allWebapps, autoSelected: false };
  }

  // Priority 2: If user is inside a webapp folder, auto-select that webapp
  // Match by webapp.name OR by folder name (extracted from path)
  if (currentWebappName) {
    const webapp = allWebapps.find((w) => w.name === currentWebappName || basename(w.path) === currentWebappName);
    if (webapp) {
      return { webapp, allWebapps, autoSelected: true };
    }
  }

  // Priority 3: If only one webapp exists, auto-select it
  if (allWebapps.length === 1) {
    return { webapp: allWebapps[0], allWebapps, autoSelected: false };
  }

  // Multiple webapps found - return null to indicate selection is needed
  return { webapp: null, allWebapps, autoSelected: false };
}
