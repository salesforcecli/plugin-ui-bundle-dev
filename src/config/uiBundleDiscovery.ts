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

import { access, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Logger, SfError, SfProject } from '@salesforce/core';
import type { UiBundleManifest } from './manifest.js';

const logger = Logger.childFromRoot('UiBundleDiscovery');

/**
 * Default command to run when no ui-bundle.json manifest is found
 */
export const DEFAULT_DEV_COMMAND = 'npm run dev';

/**
 * Standard metadata path segment for uiBundles (relative to package directory).
 * Consistent with other metadata types: packagePath/main/default/uiBundles
 */
const UI_BUNDLES_RELATIVE_PATH = 'main/default/uiBundles';

/**
 * Pattern to match uibundle metadata XML files
 */
const UIBUNDLE_META_XML_PATTERN = /^(.+)\.uibundle-meta\.xml$/;

/**
 * Discovered uiBundle with its directory path and optional manifest
 */
export type DiscoveredUiBundle = {
  /** Absolute path to the uiBundle directory */
  path: string;
  /** Relative path from cwd to the uiBundle directory */
  relativePath: string;
  /** Parsed manifest content (null if no ui-bundle.json found) */
  manifest: UiBundleManifest | null;
  /** uiBundle name (from .uibundle-meta.xml or folder name) */
  name: string;
  /** Whether this uiBundle has a ui-bundle.json manifest file */
  hasManifest: boolean;
  /** Path to the manifest file (null if no manifest) */
  manifestPath: string | null;
  /** Whether this uiBundle has a .uibundle-meta.xml file (valid SFDX uiBundle) */
  hasMetaXml: boolean;
};

/**
 * Directories to exclude when processing uiBundles folder.
 * Note: Directories starting with '.' are excluded separately in shouldExcludeDirectory()
 */
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv']);

/**
 * Check if a directory should be excluded from processing
 */
function shouldExcludeDirectory(dirName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(dirName) || dirName.startsWith('.');
}

/** Folder name for uiBundles metadata */
export const UI_BUNDLES_FOLDER = 'uiBundles';

/**
 * Check if a folder name is the standard uiBundles folder
 */
function isUiBundlesFolder(folderName: string): boolean {
  return folderName === UI_BUNDLES_FOLDER;
}

/**
 * Check if a directory contains a {name}.uibundle-meta.xml file
 * Returns the uiBundle name extracted from the filename, or null if not found.
 * Logs a warning if multiple metadata files are found (uses first match).
 */
async function findUiBundleMetaXml(dirPath: string): Promise<string | null> {
  try {
    const entries = await readdir(dirPath);
    const matches: string[] = [];

    for (const entry of entries) {
      const match = UIBUNDLE_META_XML_PATTERN.exec(entry);
      if (match) {
        matches.push(match[1]);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      logger.warn(
        `Multiple .uibundle-meta.xml files found in ${dirPath}: ${matches.join(', ')}. Using "${matches[0]}".`
      );
    }

    return matches[0];
  } catch {
    return null;
  }
}

/**
 * Check if a path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to parse a ui-bundle.json file.
 * Accepts any valid JSON object - missing fields will use defaults.
 */
async function tryParseUiBundleManifest(filePath: string): Promise<UiBundleManifest | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const manifest = JSON.parse(content) as UiBundleManifest;

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
 * Resolve uiBundle name using priority: metaXmlName > folderName.
 * Manifest does not have a name property - do not depend on it.
 *
 * @param folderName - The folder name (fallback)
 * @param metaXmlName - Name extracted from .uibundle-meta.xml (or null)
 * @returns The resolved uiBundle name
 */
function resolveUiBundleName(folderName: string, metaXmlName: string | null): string {
  return metaXmlName ?? folderName;
}

/**
 * Try to resolve SFDX project root from a given directory.
 * Uses SfProject from @salesforce/core which walks up directories to find sfdx-project.json.
 *
 * @param cwd - Directory to start from
 * @returns Project root path or null if not in an SFDX project
 */
async function tryResolveSfdxProjectRoot(cwd: string): Promise<string | null> {
  try {
    return await SfProject.resolveProjectPath(cwd);
  } catch {
    // Not in an SFDX project
    return null;
  }
}

/**
 * Get all uiBundles folder paths from the project's package directories.
 * Consistent with other metadata types: each package can have main/default/uiBundles.
 *
 * @param projectRoot - Absolute path to project root (where sfdx-project.json lives)
 * @returns Array of absolute paths to uiBundles folders that exist
 */
async function getUiBundlesPathsFromProject(projectRoot: string): Promise<string[]> {
  try {
    const project = await SfProject.resolve(projectRoot);
    const packageDirs = project.getUniquePackageDirectories();

    const existenceChecks = await Promise.all(
      packageDirs.map(async (pkg) => {
        const uiBundlesPath = join(projectRoot, pkg.path, UI_BUNDLES_RELATIVE_PATH);
        return (await pathExists(uiBundlesPath)) ? uiBundlesPath : null;
      })
    );

    return existenceChecks.filter((p): p is string => p !== null);
  } catch {
    return [];
  }
}

/**
 * Check if we're inside a uiBundles folder by traversing upward through parent directories.
 *
 * This handles cases where the user runs the command from inside a uiBundle folder:
 *
 * Example 1: Running from /project/force-app/main/default/uiBundles/my-app/src/
 * Traverses: src -> my-app -> uiBundles (found!)
 * Returns: { uiBundlesFolder: "/project/.../uiBundles", currentUiBundleName: "my-app" }
 *
 * Example 2: Running from /project/force-app/main/default/uiBundles/my-app/
 * Checks parent: uiBundles (found!)
 * Returns: { uiBundlesFolder: "/project/.../uiBundles", currentUiBundleName: "my-app" }
 *
 * Example 3: Running from /project/force-app/main/default/uiBundles/
 * Current dir is uiBundles (found!)
 * Returns: { uiBundlesFolder: "/project/.../uiBundles", currentUiBundleName: null }
 *
 * @param dir - Directory to start from
 * @returns Object with uiBundles folder path and current uiBundle name, or null if not found
 */
function findUiBundlesFolderUpward(
  dir: string
): { uiBundlesFolder: string; currentUiBundleName: string | null } | null {
  let currentDir = dir;
  let childDir: string | null = null; // Tracks the previous dir as we move up
  const maxUpwardDepth = 10;
  let depth = 0;

  // Walk up the directory tree looking for "uiBundles" folder
  while (depth < maxUpwardDepth) {
    const dirName = basename(currentDir);
    const parentDir = dirname(currentDir);

    // Case: Current directory IS the uiBundles folder
    // e.g., cwd = /project/uiBundles
    if (isUiBundlesFolder(dirName)) {
      return {
        uiBundlesFolder: currentDir,
        currentUiBundleName: childDir ? basename(childDir) : null,
      };
    }

    // Case: Parent directory is the uiBundles folder
    // e.g., cwd = /project/uiBundles/my-app (parent is webui)
    if (isUiBundlesFolder(basename(parentDir))) {
      return {
        uiBundlesFolder: parentDir,
        currentUiBundleName: dirName, // Current dir is the uiBundle folder name
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

  // Not inside a uiBundles folder
  return null;
}

/**
 * Discover all uiBundles inside the uiBundles folder.
 * Only directories containing a {name}.uibundle-meta.xml file are considered valid uiBundles.
 * If a ui-bundle.json exists, use it for dev configuration.
 *
 * @param uiBundlesFolderPath - Absolute path to the uiBundles folder
 * @param cwd - Original working directory for relative path calculation
 * @returns Array of discovered uiBundles (only those with .uibundle-meta.xml)
 */
async function discoverUiBundlesInFolder(uiBundlesFolderPath: string, cwd: string): Promise<DiscoveredUiBundle[]> {
  try {
    const entries = await readdir(uiBundlesFolderPath, { withFileTypes: true });

    // Get all subdirectories (each is a potential uiBundle)
    const uiBundleDirs = entries.filter((e) => e.isDirectory() && !shouldExcludeDirectory(e.name));

    // Process each uiBundle directory in parallel
    const uiBundlePromises = uiBundleDirs.map(async (entry): Promise<DiscoveredUiBundle | null> => {
      const uiBundlePath = join(uiBundlesFolderPath, entry.name);

      // Check for .uibundle-meta.xml file - this identifies valid uiBundles
      const metaXmlName = await findUiBundleMetaXml(uiBundlePath);

      // Only include directories that have a .uibundle-meta.xml file
      if (!metaXmlName) {
        return null;
      }

      const manifestFilePath = join(uiBundlePath, 'ui-bundle.json');

      // Try to load manifest for dev configuration
      const manifest = await tryParseUiBundleManifest(manifestFilePath);

      return {
        path: uiBundlePath,
        relativePath: relative(cwd, uiBundlePath) || entry.name,
        manifest,
        name: resolveUiBundleName(entry.name, metaXmlName),
        hasManifest: manifest !== null,
        manifestPath: manifest ? manifestFilePath : null,
        hasMetaXml: true,
      };
    });

    const results = await Promise.all(uiBundlePromises);

    // Filter out null results (directories without .uibundle-meta.xml)
    return results.filter((uiBundle): uiBundle is DiscoveredUiBundle => uiBundle !== null);
  } catch {
    // Permission denied or other read error
    return [];
  }
}

/**
 * Result of finding all uiBundles, includes context about current location
 */
type FindAllUiBundlesResult = {
  /** All discovered uiBundles */
  uiBundles: DiscoveredUiBundle[];
  /** Name of uiBundle user is currently inside (folder name), null if not inside any */
  currentUiBundleName: string | null;
  /** Whether the uiBundles folder was found (even if empty or no valid uiBundles) */
  uiBundlesFolderFound: boolean;
  /** Whether we're in an SFDX project context */
  inSfdxProject: boolean;
};

/**
 * Find all uiBundles using simplified discovery algorithm.
 *
 * Discovery strategy (in order):
 * 1. Check if inside a uiBundles/<uiBundle> directory (upward search)
 * 2. Check for SFDX project and search uiBundles in all package directories
 * 3. If neither, check if current directory is a uiBundle (has .uibundle-meta.xml)
 *
 * @param cwd - Directory to search from (defaults to process.cwd())
 * @returns Object with discovered uiBundles and context information
 */
async function findAllUiBundles(cwd: string = process.cwd()): Promise<FindAllUiBundlesResult> {
  let uiBundlesFolder: string | null = null;
  let currentUiBundleName: string | null = null;
  let inSfdxProject = false;

  // Step 1: Check if we're inside a uiBundles folder (upward search)
  // This handles: running from uiBundles/<uiBundle> or uiBundles/<uiBundle>/src/
  const upwardResult = findUiBundlesFolderUpward(cwd);

  if (upwardResult) {
    uiBundlesFolder = upwardResult.uiBundlesFolder;
    currentUiBundleName = upwardResult.currentUiBundleName;
  } else {
    // Step 2: Check for SFDX project and search uiBundles in all package directories
    const projectRoot = await tryResolveSfdxProjectRoot(cwd);

    if (projectRoot) {
      inSfdxProject = true;
      const uiBundlesPaths = await getUiBundlesPathsFromProject(projectRoot);

      if (uiBundlesPaths.length > 0) {
        // Discover uiBundles from all package directories and combine
        const uiBundleArrays = await Promise.all(uiBundlesPaths.map((path) => discoverUiBundlesInFolder(path, cwd)));
        const allUiBundles = uiBundleArrays.flat();

        return {
          uiBundles: allUiBundles.sort((a, b) => a.name.localeCompare(b.name)),
          currentUiBundleName: null,
          uiBundlesFolderFound: true,
          inSfdxProject,
        };
      }
    }
  }

  // Step 3: If no uiBundles folder found, check if current directory IS a uiBundle
  // (has a .uibundle-meta.xml file) - for running outside SFDX project context
  if (!uiBundlesFolder) {
    const metaXmlName = await findUiBundleMetaXml(cwd);
    if (metaXmlName) {
      // Current directory is a standalone uiBundle
      const manifestFilePath = join(cwd, 'ui-bundle.json');
      const manifest = await tryParseUiBundleManifest(manifestFilePath);
      const uiBundleName = resolveUiBundleName(basename(cwd), metaXmlName);

      const standaloneUiBundle: DiscoveredUiBundle = {
        path: cwd,
        relativePath: '.',
        manifest,
        name: uiBundleName,
        hasManifest: manifest !== null,
        manifestPath: manifest ? manifestFilePath : null,
        hasMetaXml: true,
      };

      return {
        uiBundles: [standaloneUiBundle],
        currentUiBundleName: uiBundleName,
        uiBundlesFolderFound: false,
        inSfdxProject: false,
      };
    }

    // No uiBundle found anywhere
    return {
      uiBundles: [],
      currentUiBundleName: null,
      uiBundlesFolderFound: false,
      inSfdxProject,
    };
  }

  // Discover all uiBundles in the folder
  const uiBundles = await discoverUiBundlesInFolder(uiBundlesFolder, cwd);

  // Sort by name for consistent ordering
  return {
    uiBundles: uiBundles.sort((a, b) => a.name.localeCompare(b.name)),
    currentUiBundleName,
    uiBundlesFolderFound: true,
    inSfdxProject,
  };
}

/**
 * Result of uiBundle discovery
 */
export type DiscoverUiBundleResult = {
  /** The selected/discovered uiBundle (null if user needs to select via prompt) */
  uiBundle: DiscoveredUiBundle | null;
  /** All discovered uiBundles */
  allUiBundles: DiscoveredUiBundle[];
  /** Whether the uiBundle was auto-selected because user is inside its folder */
  autoSelected: boolean;
};

/**
 * Get a single uiBundle, handling the various discovery scenarios.
 *
 * Discovery use cases:
 * 1. SFDX Project Root: Search uiBundles in all package directories
 * - uiBundles identified by {name}.uibundle-meta.xml
 * - Always prompt for selection (even if only 1 uiBundle)
 *
 * 2. Inside uiBundles/<uiBundle> directory:
 * - Auto-select current uiBundle
 * - Error if --name conflicts with current directory
 *
 * 3. Outside SFDX project with .uibundle-meta.xml in current dir:
 * - Use current directory as standalone uiBundle
 *
 * @param name - Optional uiBundle name to search for (--name flag)
 * @param cwd - Directory to search from
 * @returns Object containing the discovered uiBundle, all uiBundles, and autoSelected flag
 * @throws SfError if no uiBundles found, named uiBundle not found, or --name conflicts with current dir
 */
export async function discoverUiBundle(
  name: string | undefined,
  cwd: string = process.cwd()
): Promise<DiscoverUiBundleResult> {
  const {
    uiBundles: allUiBundles,
    currentUiBundleName,
    uiBundlesFolderFound,
    inSfdxProject,
  } = await findAllUiBundles(cwd);

  // No uiBundles found
  if (allUiBundles.length === 0) {
    if (uiBundlesFolderFound) {
      // Folder exists but no valid uiBundles (no .uibundle-meta.xml files)
      throw new SfError(
        'Found "uiBundles" folder but no valid uiBundles inside it.\n' +
          'Each uiBundle must have a {name}.uibundle-meta.xml file.\n\n' +
          'Expected structure:\n' +
          '  uiBundles/\n' +
          '    └── myDashboard/\n' +
          '        ├── myDashboard.uibundle-meta.xml  (required)\n' +
          '        └── ui-bundle.json             (optional, for dev config)',
        'UiBundleNotFoundError'
      );
    } else if (inSfdxProject) {
      // In SFDX project but uiBundles folder doesn't exist
      throw new SfError(
        'No uiBundles folder found in the SFDX project.\n\n' +
          'Create the folder structure in any package directory (e.g. force-app, packages/my-pkg):\n' +
          '  <package-path>/main/default/uiBundles/\n' +
          '    └── myDashboard/\n' +
          '        ├── myDashboard.uibundle-meta.xml  (required)\n' +
          '        └── ui-bundle.json             (optional, for dev config)',
        'UiBundleNotFoundError'
      );
    } else {
      // Not in SFDX project and no uiBundle found
      throw new SfError(
        'No uiBundle found.\n\n' +
          'To use this command, either:\n' +
          '1. Run from an SFDX project with uiBundles in <package>/main/default/uiBundles/\n' +
          '2. Run from inside a uiBundles/<uiBundle>/ directory\n' +
          '3. Run from a directory containing a {name}.uibundle-meta.xml file',
        'UiBundleNotFoundError'
      );
    }
  }

  // Check for --name conflict with current directory
  // If user is inside uiBundle A but specifies --name B, that's an error
  if (name && currentUiBundleName) {
    const currentUiBundle = allUiBundles.find(
      (w) => w.name === currentUiBundleName || basename(w.path) === currentUiBundleName
    );
    if (currentUiBundle && currentUiBundle.name !== name && basename(currentUiBundle.path) !== name) {
      throw new SfError(
        `You are inside the "${currentUiBundleName}" uiBundle directory but specified --name "${name}".\n\n` +
          'Either:\n' +
          `  - Remove the --name flag to use the current uiBundle ("${currentUiBundleName}")\n` +
          `  - Navigate to the "${name}" uiBundle directory and run the command from there\n` +
          '  - Run the command from the project root to use --name',
        'UiBundleNameConflictError'
      );
    }
  }

  // Priority 1: If --name flag provided, find that specific uiBundle
  if (name) {
    const uiBundle = allUiBundles.find((w) => w.name === name || basename(w.path) === name);
    if (!uiBundle) {
      const WARNING = '\u26A0\uFE0F'; // ⚠️

      const availableNames = allUiBundles
        .map((w) => `  - ${w.name} (${w.relativePath})${w.hasManifest ? '' : ` ${WARNING} No dev manifest`}`)
        .join('\n');
      throw new SfError(
        `No uiBundle found with name "${name}".\n\nAvailable uiBundles:\n${availableNames}`,
        'UiBundleNameNotFoundError'
      );
    }
    return { uiBundle, allUiBundles, autoSelected: false };
  }

  // Priority 2: If user is inside a uiBundle folder, auto-select that uiBundle
  if (currentUiBundleName) {
    const uiBundle = allUiBundles.find(
      (w) => w.name === currentUiBundleName || basename(w.path) === currentUiBundleName
    );
    if (uiBundle) {
      return { uiBundle, allUiBundles, autoSelected: true };
    }
  }

  // No auto-selection - always prompt user to select
  // (Removed: auto-selection of single uiBundle - reviewer wants prompt even for 1 uiBundle)
  return { uiBundle: null, allUiBundles, autoSelected: false };
}
