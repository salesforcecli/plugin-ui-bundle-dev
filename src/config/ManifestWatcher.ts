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

import { EventEmitter } from 'node:events';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv';
import { type ValidateFunction, type ErrorObject } from 'ajv';
import { watch, type FSWatcher } from 'chokidar';
import { SfError } from '@salesforce/core';
import type { WebAppManifest, ManifestValidationError, ManifestChangeEvent } from './types.js';

const Ajv = AjvModule.default || AjvModule;

/**
 * Configuration options for ManifestWatcher
 */
export type ManifestWatcherOptions = {
  /**
   * Path to the webapp.json manifest file
   * Defaults to webapp.json in the current working directory
   */
  manifestPath?: string;

  /**
   * Whether to watch for file changes
   * If false, only loads the manifest once
   */
  watch?: boolean;

  /**
   * Debounce delay in milliseconds for file change events
   * Prevents excessive reloads on rapid file saves
   */
  debounceMs?: number;
};

/**
 * Events emitted by ManifestWatcher
 */
export type ManifestWatcherEvents = {
  change: (event: ManifestChangeEvent) => void;
  error: (error: SfError) => void;
  ready: (manifest: WebAppManifest) => void;
};

/**
 * ManifestWatcher loads and monitors the webapp.json manifest file
 *
 * Features:
 * - Loads webapp.json from project root
 * - Validates manifest structure against JSON schema
 * - Watches for file changes and emits events
 * - Provides helpful error messages with suggestions
 * - Supports hot-reload without restarting the proxy
 *
 * Usage:
 * ```typescript
 * const watcher = new ManifestWatcher();
 * await watcher.initialize();
 *
 * watcher.on('change', (event) => {
 *   console.log('Manifest changed:', event.manifest);
 * });
 *
 * watcher.on('error', (error) => {
 *   console.error('Manifest error:', error.message);
 * });
 *
 * const manifest = watcher.getManifest();
 * ```
 */
export class ManifestWatcher extends EventEmitter {
  private options: Required<ManifestWatcherOptions>;
  private manifest: WebAppManifest | null = null;
  private watcher: FSWatcher | null = null;
  private validator: ValidateFunction;
  private debounceTimeout: NodeJS.Timeout | null = null;

  public constructor(options: ManifestWatcherOptions = {}) {
    super();

    // Set default options
    this.options = {
      manifestPath: options.manifestPath ?? join(process.cwd(), 'webapp.json'),
      watch: options.watch ?? true,
      debounceMs: options.debounceMs ?? 300,
    };

    // Load schema from file
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const currentDirPath = dirname(currentFilePath);
    const schemaPath = join(currentDirPath, '..', 'schemas', 'webapp-manifest.json');
    const manifestSchema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;

    // Initialize JSON schema validator
    const ajv = new Ajv({ allErrors: true });
    this.validator = ajv.compile(manifestSchema);
  }

  /**
   * Formats an AJV validation error into a user-friendly error message
   *
   * @param error The AJV error object
   * @returns Formatted error with field, message, and suggestion
   */
  private static formatValidationError(error: ErrorObject): ManifestValidationError {
    // TypeScript helper to safely access error params
    const params = error.params as Record<string, unknown>;

    // Get field path - handle both instancePath and dataPath (different AJV versions)
    const errorWithPath = error as { instancePath?: string; dataPath?: string };
    const path = errorWithPath.instancePath ?? errorWithPath.dataPath ?? '';
    const field = path ? path.slice(1).replace(/\//g, '.') : (params.missingProperty as string) ?? 'root';

    switch (error.keyword) {
      case 'required':
        return {
          field,
          message: `Missing required field: ${params.missingProperty as string}`,
          suggestion: `Add '${params.missingProperty as string}' to your webapp.json`,
        };

      case 'type':
        return {
          field,
          message: `Expected ${params.type as string}, got ${typeof error.data}`,
          suggestion: `Change '${field}' to be a ${params.type as string}`,
        };

      case 'pattern':
        if (field === 'name') {
          return {
            field,
            message: 'Name must start with a letter and contain only letters, numbers, and underscores',
            suggestion: 'Example: "customerPortal" or "sales_dashboard"',
          };
        }
        if (field === 'version') {
          return {
            field,
            message: 'Version must follow semantic versioning (e.g., 1.0.0)',
            suggestion: 'Use format: MAJOR.MINOR.PATCH (e.g., "1.0.0")',
          };
        }
        if (field === 'apiVersion') {
          return {
            field,
            message: 'API version must be in format XX.0 (e.g., 60.0)',
            suggestion: 'Use a valid Salesforce API version like "60.0" or "61.0"',
          };
        }
        if (field.includes('url')) {
          return {
            field,
            message: 'URL must be a valid HTTP or HTTPS URL',
            suggestion: 'Example: "http://localhost:3000"',
          };
        }
        return {
          field,
          message: 'Value does not match required pattern',
          suggestion: error.message ?? 'Check the field format requirements',
        };

      case 'minLength':
        return {
          field,
          message: `Value is too short (minimum: ${params.limit as number} characters)`,
          suggestion: `Provide a longer value for '${field}'`,
        };

      case 'additionalProperties':
        return {
          field: params.additionalProperty as string,
          message: `Unknown property: ${params.additionalProperty as string}`,
          suggestion: `Remove '${params.additionalProperty as string}' or check for typos`,
        };

      default:
        return {
          field,
          message: error.message ?? 'Validation failed',
          suggestion: 'Check the webapp.json schema documentation',
        };
    }
  }

  /**
   * Initializes the ManifestWatcher
   * Loads the manifest file and optionally starts watching for changes
   *
   * @throws SfError if manifest is missing or invalid
   */
  public initialize(): void {
    // Load the manifest initially
    this.loadManifest();

    // Start watching if enabled
    if (this.options.watch) {
      this.startWatching();
    }

    // Emit ready event
    if (this.manifest) {
      this.emit('ready', this.manifest);
    }
  }

  /**
   * Gets the current manifest
   *
   * @returns The loaded manifest, or null if not yet loaded
   */
  public getManifest(): WebAppManifest | null {
    return this.manifest;
  }

  /**
   * Stops watching for file changes and cleans up resources
   */
  public async stop(): Promise<void> {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    this.removeAllListeners();
  }

  /**
   * TypeScript type guard for event emitter
   */
  public override on<K extends keyof ManifestWatcherEvents>(event: K, listener: ManifestWatcherEvents[K]): this {
    return super.on(event, listener);
  }

  /**
   * TypeScript type guard for event emitter
   */
  public override emit<K extends keyof ManifestWatcherEvents>(
    event: K,
    ...args: Parameters<ManifestWatcherEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Loads and validates the manifest file
   *
   * @throws SfError if file is missing, invalid JSON, or fails validation
   */
  private loadManifest(): void {
    // Check if file exists
    if (!existsSync(this.options.manifestPath)) {
      throw new SfError(`webapp.json not found at ${this.options.manifestPath}`, 'ManifestNotFoundError', [
        'Make sure you are in the correct directory',
        "Run 'sf webapp generate' to create a new webapp.json",
        'Check that the file is named exactly "webapp.json"',
      ]);
    }

    // Read and parse the file
    let rawContent: string;
    let parsed: unknown;

    try {
      rawContent = readFileSync(this.options.manifestPath, 'utf-8');
    } catch (error) {
      throw new SfError(
        `Failed to read webapp.json: ${error instanceof Error ? error.message : String(error)}`,
        'ManifestReadError',
        ['Check file permissions', 'Ensure the file is not locked by another process']
      );
    }

    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      const err = error as Error;
      throw new SfError(`Invalid JSON in webapp.json: ${err.message}`, 'ManifestParseError', [
        'Check for missing commas or brackets',
        'Validate JSON syntax using a JSON validator',
        'Common issues: trailing commas, unquoted keys, single quotes instead of double quotes',
      ]);
    }

    // Validate against schema
    const validationErrors = this.validateManifest(parsed);
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map((e) => `  • ${e.field}: ${e.message}`).join('\n');
      const suggestions = validationErrors
        .filter((e) => e.suggestion !== undefined)
        .map((e) => `  • ${e.suggestion as string}`)
        .join('\n');

      throw new SfError(
        `webapp.json validation failed:\n${errorMessages}`,
        'ManifestValidationError',
        suggestions ? [`Suggestions:\n${suggestions}`] : []
      );
    }

    // Store the validated manifest
    this.manifest = parsed as WebAppManifest;
  }

  /**
   * Validates the manifest against the JSON schema
   *
   * @param data The parsed manifest data
   * @returns Array of validation errors (empty if valid)
   */
  private validateManifest(data: unknown): ManifestValidationError[] {
    const valid = this.validator(data);

    if (valid) {
      return [];
    }

    const errors: ManifestValidationError[] = [];
    const ajvErrors = this.validator.errors ?? [];

    for (const error of ajvErrors) {
      errors.push(ManifestWatcher.formatValidationError(error));
    }

    return errors;
  }

  /**
   * Starts watching the manifest file for changes
   */
  private startWatching(): void {
    this.watcher = watch(this.options.manifestPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', () => {
      this.handleFileChange('changed');
    });

    this.watcher.on('unlink', () => {
      this.handleFileChange('removed');
    });

    this.watcher.on('add', () => {
      this.handleFileChange('added');
    });

    this.watcher.on('error', (error: Error) => {
      this.emit(
        'error',
        new SfError(`File watcher error: ${error.message}`, 'ManifestWatcherError', [
          'The webapp.json file watcher encountered an error',
          'You may need to restart the command',
        ])
      );
    });
  }

  /**
   * Handles file change events with debouncing
   *
   * @param eventType Type of file change event
   */
  private handleFileChange(eventType: 'added' | 'changed' | 'removed'): void {
    // Clear existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Debounce rapid file changes
    this.debounceTimeout = setTimeout(() => {
      if (eventType === 'removed') {
        // File was deleted
        this.manifest = null;
        this.emit('change', {
          type: 'removed',
          path: this.options.manifestPath,
        });
        this.emit(
          'error',
          new SfError('webapp.json was deleted', 'ManifestRemovedError', [
            "Recreate the file or run 'sf webapp generate'",
          ])
        );
      } else {
        // File was added or changed
        try {
          this.loadManifest();
          if (this.manifest) {
            this.emit('change', {
              type: eventType,
              path: this.options.manifestPath,
              manifest: this.manifest,
            });
          }
        } catch (error) {
          // Re-wrap SfError to ensure proper typing
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorName = error instanceof SfError ? error.name : 'ManifestLoadError';
          const errorActions = error instanceof SfError ? error.actions : undefined;

          this.emit('error', new SfError(errorMessage, errorName, errorActions));
        }
      }
    }, this.options.debounceMs);
  }
}
