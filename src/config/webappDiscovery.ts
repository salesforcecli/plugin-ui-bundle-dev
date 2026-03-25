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
import type { WebAppManifest } from './manifest.js';

const logger = Logger.childFromRoot('WebappDiscovery');

/**
 * Default command to run when no webapplication.json manifest is found
 */
export const DEFAULT_DEV_COMMAND = 'npm run dev';

/**
 * Standard metadata path segment for webui (relative to package directory).
 * Consistent with other metadata types: packagePath/main/default/webui
 */
const WEBAPPLICATIONS_RELATIVE_PATH = 'main/default/webui';

/**
 * Pattern to match webapplication metadata XML files
 */
const WEBAPP_META_XML_PATTERN = /^(.+)\.webapplication-meta\.xml$/;

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
  /** Webapp name (from .webapplication-meta.xml or folder name) */
  name: string;
  /** Whether this webapp has a webapplication.json manifest file */
  hasManifest: boolean;
  /** Path to the manifest file (null if no manifest) */
  manifestPath: string | null;
  /** Whether this webapp has a .webapplication-meta.xml file (valid SFDX webapp) */
  hasMetaXml: boolean;
};

/**
 * Directories to exclude when processing webui folder.
 * Note: Directories starting with '.' are excluded separately in shouldExcludeDirectory()
 */
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__pycache__', 'venv']);

/**
 * Check if a directory should be excluded from processing
 */
function shouldExcludeDirectory(dirName: string): boolean {
  return EXCLUDED_DIRECTORIES.has(dirName) || dirName.startsWith('.');
}

/** Folder name for webui metadata */
const WEBAPPLICATIONS_FOLDER = 'webui';

/**
 * Check if a folder name is the standard webui folder
 */
function isWebapplicationsFolder(folderName: string): boolean {
  return folderName === WEBAPPLICATIONS_FOLDER;
}

/**
 * Check if a directory contains a {name}.webapplication-meta.xml file
 * Returns the webapp name extracted from the filename, or null if not found.
 * Logs a warning if multiple metadata files are found (uses first match).
 */
async function findWebappMetaXml(dirPath: string): Promise<string | null> {
  try {
    const entries = await readdir(dirPath);
    const matches: string[] = [];

    for (const entry of entries) {
      const match = WEBAPP_META_XML_PATTERN.exec(entry);
      if (match) {
        matches.push(match[1]);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      logger.warn(
        `Multiple .webapplication-meta.xml files found in ${dirPath}: ${matches.join(', ')}. Using "${matches[0]}".`
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
 * Resolve webapp name using priority: metaXmlName > folderName.
 * Manifest does not have a name property - do not depend on it.
 *
 * @param folderName - The folder name (fallback)
 * @param metaXmlName - Name extracted from .webapplication-meta.xml (or null)
 * @returns The resolved webapp name
 */
function resolveWebappName(folderName: string, metaXmlName: string | null): string {
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
 * Get all webui folder paths from the project's package directories.
 * Consistent with other metadata types: each package can have main/default/webui.
 *
 * @param projectRoot - Absolute path to project root (where sfdx-project.json lives)
 * @returns Array of absolute paths to webui folders that exist
 */
async function getWebapplicationsPathsFromProject(projectRoot: string): Promise<string[]> {
  try {
    const project = await SfProject.resolve(projectRoot);
    const packageDirs = project.getUniquePackageDirectories();

    const existenceChecks = await Promise.all(
      packageDirs.map(async (pkg) => {
        const webappsPath = join(projectRoot, pkg.path, WEBAPPLICATIONS_RELATIVE_PATH);
        return (await pathExists(webappsPath)) ? webappsPath : null;
      })
    );

    return existenceChecks.filter((p): p is string => p !== null);
  } catch {
    return [];
  }
}

/**
 * Check if we're inside a webui folder by traversing upward through parent directories.
 *
 * This handles cases where the user runs the command from inside a webapp folder:
 *
 * Example 1: Running from /project/force-app/main/default/webui/my-app/src/
 * Traverses: src -> my-app -> webui (found!)
 * Returns: { webappsFolder: "/project/.../webui", currentWebappName: "my-app" }
 *
 * Example 2: Running from /project/force-app/main/default/webui/my-app/
 * Checks parent: webui (found!)
 * Returns: { webappsFolder: "/project/.../webui", currentWebappName: "my-app" }
 *
 * Example 3: Running from /project/force-app/main/default/webui/
 * Current dir is webui (found!)
 * Returns: { webappsFolder: "/project/.../webui", currentWebappName: null }
 *
 * @param dir - Directory to start from
 * @returns Object with webui folder path and current webapp name, or null if not found
 */
function findWebapplicationsFolderUpward(
  dir: string
): { webappsFolder: string; currentWebappName: string | null } | null {
  let currentDir = dir;
  let childDir: string | null = null; // Tracks the previous dir as we move up
  const maxUpwardDepth = 10;
  let depth = 0;

  // Walk up the directory tree looking for "webui" folder
  while (depth < maxUpwardDepth) {
    const dirName = basename(currentDir);
    const parentDir = dirname(currentDir);

    // Case: Current directory IS the webui folder
    // e.g., cwd = /project/webui
    if (isWebapplicationsFolder(dirName)) {
      return {
        webappsFolder: currentDir,
        currentWebappName: childDir ? basename(childDir) : null,
      };
    }

    // Case: Parent directory is the webui folder
    // e.g., cwd = /project/webui/my-app (parent is webui)
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

  // Not inside a webui folder
  return null;
}

/**
 * Discover all webapps inside the webui folder.
 * Only directories containing a {name}.webapplication-meta.xml file are considered valid webapps.
 * If a webapplication.json exists, use it for dev configuration.
 *
 * @param webappsFolderPath - Absolute path to the webui folder
 * @param cwd - Original working directory for relative path calculation
 * @returns Array of discovered webapps (only those with .webapplication-meta.xml)
 */
async function discoverWebappsInFolder(webappsFolderPath: string, cwd: string): Promise<DiscoveredWebapp[]> {
  try {
    const entries = await readdir(webappsFolderPath, { withFileTypes: true });

    // Get all subdirectories (each is a potential webapp)
    const webappDirs = entries.filter((e) => e.isDirectory() && !shouldExcludeDirectory(e.name));

    // Process each webapp directory in parallel
    const webappPromises = webappDirs.map(async (entry): Promise<DiscoveredWebapp | null> => {
      const webappPath = join(webappsFolderPath, entry.name);

      // Check for .webapplication-meta.xml file - this identifies valid webapps
      const metaXmlName = await findWebappMetaXml(webappPath);

      // Only include directories that have a .webapplication-meta.xml file
      if (!metaXmlName) {
        return null;
      }

      const manifestFilePath = join(webappPath, 'webapplication.json');

      // Try to load manifest for dev configuration
      const manifest = await tryParseWebappManifest(manifestFilePath);

      return {
        path: webappPath,
        relativePath: relative(cwd, webappPath) || entry.name,
        manifest,
        name: resolveWebappName(entry.name, metaXmlName),
        hasManifest: manifest !== null,
        manifestPath: manifest ? manifestFilePath : null,
        hasMetaXml: true,
      };
    });

    const results = await Promise.all(webappPromises);

    // Filter out null results (directories without .webapplication-meta.xml)
    return results.filter((webapp): webapp is DiscoveredWebapp => webapp !== null);
  } catch {
    // Permission denied or other read error
    return [];
  }
}

/**
 * Result of finding all webapps, includes context about current location
 */
type FindAllWebappsResult = {
  /** All discovered webapps */
  webapps: DiscoveredWebapp[];
  /** Name of webapp user is currently inside (folder name), null if not inside any */
  currentWebappName: string | null;
  /** Whether the webui folder was found (even if empty or no valid webapps) */
  webappsFolderFound: boolean;
  /** Whether we're in an SFDX project context */
  inSfdxProject: boolean;
};

/**
 * Find all webapps using simplified discovery algorithm.
 *
 * Discovery strategy (in order):
 * 1. Check if inside a webui/<webapp> directory (upward search)
 * 2. Check for SFDX project and search webui in all package directories
 * 3. If neither, check if current directory is a webapp (has .webapplication-meta.xml)
 *
 * @param cwd - Directory to search from (defaults to process.cwd())
 * @returns Object with discovered webapps and context information
 */
async function findAllWebapps(cwd: string = process.cwd()): Promise<FindAllWebappsResult> {
  let webappsFolder: string | null = null;
  let currentWebappName: string | null = null;
  let inSfdxProject = false;

  // Step 1: Check if we're inside a webui folder (upward search)
  // This handles: running from webui/<webapp> or webui/<webapp>/src/
  const upwardResult = findWebapplicationsFolderUpward(cwd);

  if (upwardResult) {
    webappsFolder = upwardResult.webappsFolder;
    currentWebappName = upwardResult.currentWebappName;
  } else {
    // Step 2: Check for SFDX project and search webui in all package directories
    const projectRoot = await tryResolveSfdxProjectRoot(cwd);

    if (projectRoot) {
      inSfdxProject = true;
      const webappsPaths = await getWebapplicationsPathsFromProject(projectRoot);

      if (webappsPaths.length > 0) {
        // Discover webapps from all package directories and combine
        const webappArrays = await Promise.all(webappsPaths.map((path) => discoverWebappsInFolder(path, cwd)));
        const allWebapps = webappArrays.flat();

        return {
          webapps: allWebapps.sort((a, b) => a.name.localeCompare(b.name)),
          currentWebappName: null,
          webappsFolderFound: true,
          inSfdxProject,
        };
      }
    }
  }

  // Step 3: If no webui folder found, check if current directory IS a webapp
  // (has a .webapplication-meta.xml file) - for running outside SFDX project context
  if (!webappsFolder) {
    const metaXmlName = await findWebappMetaXml(cwd);
    if (metaXmlName) {
      // Current directory is a standalone webapp
      const manifestFilePath = join(cwd, 'webapplication.json');
      const manifest = await tryParseWebappManifest(manifestFilePath);
      const webappName = resolveWebappName(basename(cwd), metaXmlName);

      const standaloneWebapp: DiscoveredWebapp = {
        path: cwd,
        relativePath: '.',
        manifest,
        name: webappName,
        hasManifest: manifest !== null,
        manifestPath: manifest ? manifestFilePath : null,
        hasMetaXml: true,
      };

      return {
        webapps: [standaloneWebapp],
        currentWebappName: webappName,
        webappsFolderFound: false,
        inSfdxProject: false,
      };
    }

    // No webapp found anywhere
    return {
      webapps: [],
      currentWebappName: null,
      webappsFolderFound: false,
      inSfdxProject,
    };
  }

  // Discover all webapps in the folder
  const webapps = await discoverWebappsInFolder(webappsFolder, cwd);

  // Sort by name for consistent ordering
  return {
    webapps: webapps.sort((a, b) => a.name.localeCompare(b.name)),
    currentWebappName,
    webappsFolderFound: true,
    inSfdxProject,
  };
}

/**
 * Result of webapp discovery
 */
export type DiscoverWebappResult = {
  /** The selected/discovered webapp (null if user needs to select via prompt) */
  webapp: DiscoveredWebapp | null;
  /** All discovered webapps */
  allWebapps: DiscoveredWebapp[];
  /** Whether the webapp was auto-selected because user is inside its folder */
  autoSelected: boolean;
};

/**
 * Get a single webapp, handling the various discovery scenarios.
 *
 * Discovery use cases:
 * 1. SFDX Project Root: Search webui in all package directories
 * - Webapps identified by {name}.webapplication-meta.xml
 * - Always prompt for selection (even if only 1 webapp)
 *
 * 2. Inside webui/<webapp> directory:
 * - Auto-select current webapp
 * - Error if --name conflicts with current directory
 *
 * 3. Outside SFDX project with .webapplication-meta.xml in current dir:
 * - Use current directory as standalone webapp
 *
 * @param name - Optional webapp name to search for (--name flag)
 * @param cwd - Directory to search from
 * @returns Object containing the discovered webapp, all webapps, and autoSelected flag
 * @throws SfError if no webapps found, named webapp not found, or --name conflicts with current dir
 */
export async function discoverWebapp(
  name: string | undefined,
  cwd: string = process.cwd()
): Promise<DiscoverWebappResult> {
  const { webapps: allWebapps, currentWebappName, webappsFolderFound, inSfdxProject } = await findAllWebapps(cwd);

  // No webapps found
  if (allWebapps.length === 0) {
    if (webappsFolderFound) {
      // Folder exists but no valid webapps (no .webapplication-meta.xml files)
      throw new SfError(
        'Found "webui" folder but no valid webapps inside it.\n' +
          'Each webapp must have a {name}.webapplication-meta.xml file.\n\n' +
          'Expected structure:\n' +
          '  webui/\n' +
          '    └── my-app/\n' +
          '        ├── my-app.webapplication-meta.xml  (required)\n' +
          '        └── webapplication.json             (optional, for dev config)',
        'WebappNotFoundError'
      );
    } else if (inSfdxProject) {
      // In SFDX project but webui folder doesn't exist
      throw new SfError(
        'No webui folder found in the SFDX project.\n\n' +
          'Create the folder structure in any package directory (e.g. force-app, packages/my-pkg):\n' +
          '  <package-path>/main/default/webui/\n' +
          '    └── my-app/\n' +
          '        ├── my-app.webapplication-meta.xml  (required)\n' +
          '        └── webapplication.json             (optional, for dev config)',
        'WebappNotFoundError'
      );
    } else {
      // Not in SFDX project and no webapp found
      throw new SfError(
        'No webapp found.\n\n' +
          'To use this command, either:\n' +
          '1. Run from an SFDX project with webapps in <package>/main/default/webui/\n' +
          '2. Run from inside a webui/<webapp>/ directory\n' +
          '3. Run from a directory containing a {name}.webapplication-meta.xml file',
        'WebappNotFoundError'
      );
    }
  }

  // Check for --name conflict with current directory
  // If user is inside webapp A but specifies --name B, that's an error
  if (name && currentWebappName) {
    const currentWebapp = allWebapps.find(
      (w) => w.name === currentWebappName || basename(w.path) === currentWebappName
    );
    if (currentWebapp && currentWebapp.name !== name && basename(currentWebapp.path) !== name) {
      throw new SfError(
        `You are inside the "${currentWebappName}" webapp directory but specified --name "${name}".\n\n` +
          'Either:\n' +
          `  - Remove the --name flag to use the current webapp ("${currentWebappName}")\n` +
          `  - Navigate to the "${name}" webapp directory and run the command from there\n` +
          '  - Run the command from the project root to use --name',
        'WebappNameConflictError'
      );
    }
  }

  // Priority 1: If --name flag provided, find that specific webapp
  if (name) {
    const webapp = allWebapps.find((w) => w.name === name || basename(w.path) === name);
    if (!webapp) {
      const WARNING = '\u26A0\uFE0F'; // ⚠️

      const availableNames = allWebapps
        .map((w) => `  - ${w.name} (${w.relativePath})${w.hasManifest ? '' : ` ${WARNING} No dev manifest`}`)
        .join('\n');
      throw new SfError(
        `No webapp found with name "${name}".\n\nAvailable webapps:\n${availableNames}`,
        'WebappNameNotFoundError'
      );
    }
    return { webapp, allWebapps, autoSelected: false };
  }

  // Priority 2: If user is inside a webapp folder, auto-select that webapp
  if (currentWebappName) {
    const webapp = allWebapps.find((w) => w.name === currentWebappName || basename(w.path) === currentWebappName);
    if (webapp) {
      return { webapp, allWebapps, autoSelected: true };
    }
  }

  // No auto-selection - always prompt user to select
  // (Removed: auto-selection of single webapp - reviewer wants prompt even for 1 webapp)
  return { webapp: null, allWebapps, autoSelected: false };
}
