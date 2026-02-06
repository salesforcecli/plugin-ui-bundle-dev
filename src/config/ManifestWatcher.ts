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

import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { SfError } from '@salesforce/core';
import type { WebAppManifest } from './manifest.js';

/**
 * Manifest change event type
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
 * Configuration options for ManifestWatcher
 */
type ManifestWatcherOptions = {
  /**
   * Path to the webapplication.json manifest file
   * Defaults to webapplication.json in the current working directory
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
type ManifestWatcherEvents = {
  change: (event: ManifestChangeEvent) => void;
  error: (error: SfError) => void;
  ready: (manifest: WebAppManifest) => void;
};

/**
 * ManifestWatcher loads and monitors the webapplication.json manifest file
 *
 * Features:
 * - Loads webapplication.json from project root
 * - Watches for file changes and emits events
 * - Provides helpful error messages
 * - Supports hot-reload without restarting the proxy
 * - No strict validation - all fields are optional for dev mode
 */
export class ManifestWatcher extends EventEmitter {
  // 1. Instance fields
  private options: Required<ManifestWatcherOptions>;
  private manifest: WebAppManifest | null = null;
  private watcher: FSWatcher | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;

  // 2. Constructor
  public constructor(options: ManifestWatcherOptions = {}) {
    super();

    this.options = {
      manifestPath: options.manifestPath ?? join(process.cwd(), 'webapplication.json'),
      watch: options.watch ?? true,
      debounceMs: options.debounceMs ?? 300,
    };
  }

  // 3. Public instance methods
  /**
   * Initializes the ManifestWatcher
   * Loads the manifest file and optionally starts watching for changes
   *
   * @throws SfError if manifest is missing or invalid
   */
  public initialize(): void {
    this.loadManifest();

    if (this.options.watch) {
      this.startWatching();
    }

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

  // 5. Private instance methods
  /**
   * Handles file change events with debouncing
   *
   * @param eventType Type of file change event
   */
  private handleFileChange(eventType: 'added' | 'changed' | 'removed'): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      if (eventType === 'removed') {
        this.manifest = null;
        this.emit('change', {
          type: 'removed',
          path: this.options.manifestPath,
        });
        this.emit(
          'error',
          new SfError('webapplication.json was deleted', 'ManifestRemovedError', [
            'Recreate the webapplication.json file to continue',
          ])
        );
      } else {
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorName = error instanceof SfError ? error.name : 'ManifestLoadError';
          const errorActions = error instanceof SfError ? error.actions : undefined;

          this.emit('error', new SfError(errorMessage, errorName, errorActions));
        }
      }
    }, this.options.debounceMs);
  }

  /**
   * Loads and validates the manifest file
   *
   * @throws SfError if file is missing, invalid JSON, or fails validation
   */
  private loadManifest(): void {
    // Check if file exists
    if (!existsSync(this.options.manifestPath)) {
      throw new SfError(`webapplication.json not found at ${this.options.manifestPath}`, 'ManifestNotFoundError', [
        'Make sure you are in the correct directory',
        'Create a webapplication.json file in your project root',
        'Check that the file is named exactly "webapplication.json"',
      ]);
    }

    // Read the file
    let rawContent: string;
    try {
      rawContent = readFileSync(this.options.manifestPath, 'utf-8');
    } catch (error) {
      throw new SfError(
        `Failed to read webapplication.json: ${error instanceof Error ? error.message : String(error)}`,
        'ManifestReadError',
        ['Check file permissions', 'Ensure the file is not locked by another process']
      );
    }

    // Parse JSON
    let parsed: WebAppManifest;
    try {
      parsed = JSON.parse(rawContent) as WebAppManifest;
    } catch (error) {
      throw new SfError(`Invalid JSON in webapplication.json: ${(error as Error).message}`, 'ManifestParseError', [
        'Check for missing commas or brackets',
        'Validate JSON syntax using a JSON validator',
        'Common issues: trailing commas, unquoted keys, single quotes instead of double quotes',
      ]);
    }

    // Store the manifest (no strict validation - fields are optional for dev mode)
    this.manifest = parsed;
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
          'The webapplication.json file watcher encountered an error',
          'You may need to restart the command',
        ])
      );
    });
  }
}
