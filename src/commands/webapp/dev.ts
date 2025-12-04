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

import open from 'open';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Logger, Messages, SfError } from '@salesforce/core';
import type { WebAppDevResult, DevServerError } from '../../config/types.js';
import type { WebAppManifest } from '../../config/manifest.js';
import { ManifestWatcher } from '../../config/ManifestWatcher.js';
import { DevServerManager } from '../../server/DevServerManager.js';
import { ProxyServer } from '../../proxy/ProxyServer.js';
import { ErrorHandler } from '../../error/ErrorHandler.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-webapp', 'webapp.dev');

export default class WebappDev extends SfCommand<WebAppDevResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: true,
    }),
    url: Flags.string({
      summary: messages.getMessage('flags.url.summary'),
      description: messages.getMessage('flags.url.description'),
      char: 'u',
      required: false,
    }),
    port: Flags.integer({
      summary: messages.getMessage('flags.port.summary'),
      description: messages.getMessage('flags.port.description'),
      char: 'p',
      default: 4545,
    }),
    'target-org': Flags.requiredOrg(),
    open: Flags.boolean({
      summary: messages.getMessage('flags.open.summary'),
      description: messages.getMessage('flags.open.description'),
      char: 'b',
      default: false,
    }),
  };

  private manifestWatcher: ManifestWatcher | null = null;
  private devServerManager: DevServerManager | null = null;
  private proxyServer: ProxyServer | null = null;
  private logger: Logger | null = null;

  /**
   * Open the proxy URL in the default browser
   */
  private static async openBrowser(url: string): Promise<void> {
    await open(url);
  }

  // eslint-disable-next-line complexity
  public async run(): Promise<WebAppDevResult> {
    const { flags } = await this.parse(WebappDev);

    // Initialize logger from @salesforce/core for debug logging
    // Logger respects SF_LOG_LEVEL environment variable
    this.logger = await Logger.child('WebappDev');

    // Declare variables outside try block for catch block access
    let manifest: WebAppManifest | null = null;
    let devServerUrl: string | null = null;
    let orgUsername = '';

    try {
      // Step 1: Load and validate manifest
      this.logger.debug('Loading webapp.json manifest...');
      const manifestPath = 'webapp.json';
      this.manifestWatcher = new ManifestWatcher({ manifestPath, watch: true });

      this.manifestWatcher.initialize();
      manifest = this.manifestWatcher.getManifest();

      if (!manifest) {
        throw ErrorHandler.createManifestNotFoundError();
      }

      this.logger.debug(`Manifest loaded: ${manifest.name}`);

      // Setup manifest change handler
      this.manifestWatcher.on('change', (event) => {
        this.log(messages.getMessage('info.manifest-changed', [event.type]));
        if (event.type === 'changed' && event.manifest) {
          this.log(messages.getMessage('info.manifest-reloaded'));

          // Check for dev.url changes (can be updated dynamically)
          const oldDevUrl = manifest?.dev?.url;
          const newDevUrl = event.manifest.dev?.url;

          if (newDevUrl && oldDevUrl !== newDevUrl) {
            this.log(messages.getMessage('info.dev-url-changed', [newDevUrl]));
            this.proxyServer?.updateDevServerUrl(newDevUrl);
          }

          // Check for dev.command changes (cannot be changed while running)
          if (event.manifest.dev?.command && event.manifest.dev.command !== manifest?.dev?.command) {
            this.warn(messages.getMessage('warning.dev-command-changed', [event.manifest.dev.command]));
          }

          // Update proxy server with new manifest (for routing changes)
          this.proxyServer?.updateManifest(event.manifest);

          // Update manifest reference to reflect all changes
          manifest = event.manifest;
        }
      });

      this.manifestWatcher.on('error', (error: SfError) => {
        this.warn(messages.getMessage('error.manifest-watch-failed', [error.message]));
      });

      // Step 2: Determine dev server URL

      // Priority: --url flag > manifest dev.url > spawn dev.command
      if (flags.url) {
        devServerUrl = flags.url;
        this.logger.debug(`Using explicit dev server URL: ${devServerUrl}`);
      } else if (manifest.dev?.url) {
        devServerUrl = manifest.dev.url;
        this.logger.debug(`Using dev server URL from manifest: ${devServerUrl}`);
      } else if (manifest.dev?.command) {
        // Start dev server
        this.logger.debug(`Starting dev server with command: ${manifest.dev.command}`);
        this.devServerManager = new DevServerManager({
          command: manifest.dev.command,
          cwd: process.cwd(),
        });

        // Setup dev server event handlers
        this.devServerManager.on('ready', (url: string) => {
          this.logger?.debug(`Dev server ready at: ${url}`);
          // Clear any dev server error when server starts successfully
          this.proxyServer?.clearActiveDevServerError();
        });

        this.devServerManager.on('error', (error: SfError | DevServerError) => {
          // Check if this is a parsed dev server error (has DevServerError-specific fields)
          if ('stderrLines' in error && Array.isArray(error.stderrLines) && 'title' in error && 'type' in error) {
            // This is a DevServerError with parsed stderr
            this.warn(messages.getMessage('error.dev-server-failed', [error.title]));
            this.proxyServer?.setActiveDevServerError(error);
          } else {
            // Generic SfError
            this.warn(messages.getMessage('error.dev-server-failed', [error.message]));
          }
        });

        this.devServerManager.on('exit', () => {
          this.logger?.debug('Dev server stopped');
        });

        await this.devServerManager.start();

        // Wait for dev server to be ready
        devServerUrl = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(ErrorHandler.createDevServerTimeoutError(30));
          }, 30_000);

          this.devServerManager?.on('ready', (url: string) => {
            clearTimeout(timeout);
            resolve(url);
          });

          this.devServerManager?.on('error', (error: SfError) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      } else {
        throw ErrorHandler.createDevServerCommandRequiredError();
      }

      // Step 3: Get org info for authentication
      const orgConnection = flags['target-org'].getConnection(undefined);
      orgUsername = flags['target-org'].getUsername() ?? orgConnection.getUsername() ?? 'unknown';
      this.logger.debug(`Using authentication for org: ${orgUsername}`);

      // Step 4: Start proxy server
      this.logger.debug(`Starting proxy server on port ${flags.port}...`);
      const salesforceInstanceUrl = orgConnection.instanceUrl;
      this.proxyServer = new ProxyServer({
        devServerUrl,
        salesforceInstanceUrl,
        port: flags.port,
        manifest,
        orgAlias: orgUsername,
      });

      await this.proxyServer.start();
      const proxyUrl = this.proxyServer.getProxyUrl();
      this.logger.debug(`Proxy server running on ${proxyUrl}`);

      // Listen for dev server status changes (minimal output)
      this.proxyServer.on('dev-server-up', (url: string) => {
        this.log(messages.getMessage('info.dev-server-detected', [url]));
      });

      this.proxyServer.on('dev-server-down', (url: string) => {
        this.log(messages.getMessage('warning.dev-server-unreachable-status', [url]));
        this.log(messages.getMessage('info.start-dev-server-hint'));
      });

      // Step 5: Check if dev server is reachable (non-blocking warning)
      if (devServerUrl) {
        await this.checkDevServerHealth(devServerUrl);
      }

      // Step 6: Open browser if requested
      if (flags.open) {
        this.logger.debug('Opening browser...');
        await WebappDev.openBrowser(proxyUrl);
      }

      // Display usage instructions
      this.log('');
      this.log(messages.getMessage('info.ready-for-development'));
      this.log(messages.getMessage('info.proxy-url', [proxyUrl]));
      this.log(messages.getMessage('info.dev-server-url', [devServerUrl ?? 'N/A']));
      this.log(messages.getMessage('info.press-ctrl-c'));
      this.log('');

      // Keep the command running until interrupted or dev server exits
      await new Promise<void>((resolve) => {
        // Exit if dev server exits with SIGINT (user pressed Ctrl+C)
        if (this.devServerManager) {
          this.devServerManager.on('exit', (code: number | null, signal: string | null) => {
            if (signal === 'SIGINT') {
              this.logger?.debug('Dev server received SIGINT, exiting command');
              resolve();
            }
          });
        }

        // CRITICAL: Use prependOnceListener to add our handlers BEFORE sfCommand's handlers
        // sfCommand adds process.on('SIGINT', () => this.exit(130)) which throws ExitError
        // By using prependOnceListener, our resolve() runs FIRST, allowing clean shutdown
        // This is especially important when there's no dev server (explicit URL mode)
        process.prependOnceListener('SIGINT', () => {
          this.logger?.debug('Received SIGINT signal, initiating graceful shutdown');
          resolve();
        });

        process.prependOnceListener('SIGTERM', () => {
          this.logger?.debug('Received SIGTERM signal, initiating graceful shutdown');
          resolve();
        });
      });

      // Return result (never reached, but required for type safety)
      return {
        url: proxyUrl,
        devServerUrl: devServerUrl ?? '',
      };
    } catch (error) {
      // Cleanup on error
      await this.cleanup();

      // Re-throw as SfError if not already
      if (error instanceof SfError) {
        throw error;
      }

      throw ErrorHandler.wrapError(error, 'Failed to start webapp dev command');
    }
  }

  /**
   * Oclif lifecycle method - called when command exits (including Ctrl+C)
   * This is the proper way to handle cleanup in oclif commands
   */
  protected async finally(): Promise<void> {
    // Cleanup all resources silently
    // Don't show messages here as this runs on ALL exits (errors, Ctrl+C, etc)
    await this.cleanup();
  }

  /**
   * Check if dev server is reachable (non-blocking health check)
   */
  private async checkDevServerHealth(devServerUrl: string): Promise<void> {
    try {
      const response = await fetch(devServerUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (response.ok) {
        this.log(messages.getMessage('info.dev-server-healthy', [devServerUrl]));
      } else {
        this.warn(messages.getMessage('warning.dev-server-not-responding', [devServerUrl, String(response.status)]));
      }
    } catch (error) {
      // Dev server not reachable - show warning but don't fail
      this.warn(messages.getMessage('warning.dev-server-unreachable', [devServerUrl]));
      this.warn(messages.getMessage('warning.dev-server-start-hint'));
      this.logger?.debug(`Dev server check error: ${(error as Error).message}`);
    }
  }

  /**
   * Cleanup all resources (proxy, dev server, file watcher)
   */
  private async cleanup(): Promise<void> {
    // Stop proxy server
    if (this.proxyServer) {
      try {
        await this.proxyServer.stop();
        this.logger?.debug('Proxy server stopped');
      } catch (error) {
        this.logger?.debug(`Failed to stop proxy server: ${(error as Error).message}`);
      }
      this.proxyServer = null;
    }

    // Stop dev server
    if (this.devServerManager) {
      try {
        await this.devServerManager.stop();
        this.logger?.debug('Dev server stopped');
      } catch (error) {
        this.logger?.debug(`Failed to stop dev server: ${(error as Error).message}`);
      }
      this.devServerManager = null;
    }

    // Stop manifest watcher
    if (this.manifestWatcher) {
      try {
        await this.manifestWatcher.stop();
        this.logger?.debug('Manifest watcher stopped');
      } catch (error) {
        this.logger?.debug(`Failed to stop manifest watcher: ${(error as Error).message}`);
      }
      this.manifestWatcher = null;
    }

    this.logger?.debug('Cleanup complete');
  }
}
