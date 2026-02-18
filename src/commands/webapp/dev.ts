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

import open from 'open';
import select from '@inquirer/select';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Logger, Messages, SfError } from '@salesforce/core';
import type { WebAppDevResult, DevServerError } from '../../config/types.js';
import type { WebAppManifest } from '../../config/manifest.js';
import { ManifestWatcher } from '../../config/ManifestWatcher.js';
import { DevServerManager } from '../../server/DevServerManager.js';
import { ProxyServer } from '../../proxy/ProxyServer.js';
import { discoverWebapp, DEFAULT_DEV_COMMAND, type DiscoveredWebapp } from '../../config/webappDiscovery.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-app-dev', 'webapp.dev');

export default class WebappDev extends SfCommand<WebAppDevResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      description: messages.getMessage('flags.name.description'),
      char: 'n',
      required: false,
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

  /**
   * Prompt user to select a webapp from multiple discovered webapps
   * Uses interactive arrow-key selection (standard SF CLI pattern)
   */
  private static async promptWebappSelection(webapps: DiscoveredWebapp[]): Promise<DiscoveredWebapp> {
    const WARNING = '\u26A0\uFE0F'; // ⚠️

    const choices = webapps.map((webapp) => {
      if (webapp.hasManifest) {
        // Has manifest - show name only
        return {
          name: webapp.name,
          value: webapp,
        };
      } else {
        // No manifest - show warning symbol
        return {
          name: `${webapp.name} - ${WARNING} No Manifest`,
          value: webapp,
        };
      }
    });

    return select({
      message: messages.getMessage('prompt.select-webapp'),
      choices,
    });
  }

  /**
   * Check if a URL is reachable (returns true/false)
   * Used to check if --url is already available before starting dev server
   */
  private static async isUrlReachable(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if Vite's WebAppProxyHandler is active at the dev server URL.
   * The Vite plugin responds to a health check query parameter with a custom header
   * when the proxy middleware is active.
   *
   * @param devServerUrl - The dev server URL to check
   * @returns true if Vite's proxy is handling requests, false otherwise
   */
  private static async checkViteProxyActive(devServerUrl: string): Promise<boolean> {
    try {
      // The Vite plugin uses a query parameter for health checks, not a path
      const healthUrl = new URL(devServerUrl);
      healthUrl.searchParams.set('sfProxyHealthCheck', 'true');
      const response = await fetch(healthUrl.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      return response.headers.get('X-Salesforce-WebApp-Proxy') === 'true';
    } catch {
      // Health check failed - Vite proxy not active
      return false;
    }
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
      // Step 1: Discover and select webapp
      this.logger.debug('Discovering webapplication.json manifest(s)...');

      const { webapp: discoveredWebapp, allWebapps, autoSelected } = await discoverWebapp(flags.name);

      // Handle multiple webapps case - prompt user to select
      let selectedWebapp: DiscoveredWebapp;
      if (!discoveredWebapp) {
        this.log(messages.getMessage('info.multiple-webapps-found', [String(allWebapps.length)]));

        selectedWebapp = await WebappDev.promptWebappSelection(allWebapps);
      } else {
        selectedWebapp = discoveredWebapp;

        // Show info message if webapp was auto-selected because user is inside its folder
        if (autoSelected) {
          this.log(messages.getMessage('info.webapp-auto-selected', [selectedWebapp.name]));
        }
      }

      // The webapp directory path (where the webapp lives)
      const webappDir = selectedWebapp.path;

      this.logger.debug(`Using webapp: ${selectedWebapp.name} at ${selectedWebapp.relativePath}`);

      // Step 2: Handle manifest-based vs no-manifest webapps
      if (selectedWebapp.hasManifest && selectedWebapp.manifestPath) {
        // Webapp has manifest - load and watch it
        this.manifestWatcher = new ManifestWatcher({
          manifestPath: selectedWebapp.manifestPath,
          watch: true,
        });

        this.manifestWatcher.initialize();
        manifest = this.manifestWatcher.getManifest();

        // Check if manifest is effectively empty (no dev configuration)
        // Note: manifest is guaranteed non-null here since initialize() throws on failure
        const hasDevConfig = manifest?.dev?.url != null || manifest?.dev?.command != null;
        if (!hasDevConfig) {
          // Manifest exists but has no dev configuration - show empty manifest warning
          this.warn(messages.getMessage('warning.empty-manifest', [DEFAULT_DEV_COMMAND]));
        }

        // Show starting message
        this.log('');
        this.log(messages.getMessage('info.starting-webapp', [selectedWebapp.name]));
        this.logger.debug(`Manifest loaded: ${selectedWebapp.name}`);

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
      } else {
        // No manifest - log applied defaults for troubleshooting
        this.log(messages.getMessage('info.no-manifest-defaults', [DEFAULT_DEV_COMMAND, String(flags.port)]));
        this.log('');
        this.log(messages.getMessage('info.starting-webapp', [selectedWebapp.name]));
      }

      // Step 3: Determine dev server URL
      // Track whether we should skip starting dev server (when --url is already reachable)
      let skipDevServer = false;
      let explicitUrlProvided = false;

      // Handle --url flag: check if URL is already reachable before starting dev server
      if (flags.url) {
        explicitUrlProvided = true;
        this.logger.debug(`Checking if explicit URL is reachable: ${flags.url}`);

        const isReachable = await WebappDev.isUrlReachable(flags.url);

        if (isReachable) {
          // URL is already available - skip starting dev server, only start proxy
          devServerUrl = flags.url;
          skipDevServer = true;
          this.log(messages.getMessage('info.url-already-available', [flags.url]));
          this.logger.debug(`URL ${flags.url} is reachable, skipping dev server startup`);
        } else {
          // URL not reachable - will start dev server and check for mismatch later
          this.logger.debug(`URL ${flags.url} is not reachable, will start dev server`);
        }
      }

      // If we're not skipping dev server, determine how to start it
      if (!skipDevServer) {
        if (manifest?.dev?.url && !explicitUrlProvided) {
          // Use manifest dev.url
          devServerUrl = manifest.dev.url;
          this.logger.debug(`Using dev server URL from manifest: ${devServerUrl}`);
        } else {
          // Start dev server with command
          const devCommand = manifest?.dev?.command ?? DEFAULT_DEV_COMMAND;

          if (!selectedWebapp.hasManifest) {
            this.logger.debug(messages.getMessage('info.using-defaults', [devCommand]));
          }

          // Start dev server from the webapp directory
          this.logger.debug(`Starting dev server with command: ${devCommand}`);
          this.devServerManager = new DevServerManager({
            command: devCommand,
            cwd: webappDir,
            startupTimeout: 60_000, // 60 seconds - aligned with VS Code extension
          });

          // Setup dev server event handlers
          this.devServerManager.on('ready', (url: string) => {
            this.logger?.debug(`Dev server ready at: ${url}`);
            // Clear any dev server error when server starts successfully
            this.proxyServer?.clearActiveDevServerError();
          });

          this.devServerManager.on('error', (error: SfError | DevServerError) => {
            // Set error for proxy to display in browser (if proxy is running)
            // Don't log here - the error will be thrown and displayed by the main catch block
            if ('stderrLines' in error && Array.isArray(error.stderrLines) && 'title' in error && 'type' in error) {
              this.proxyServer?.setActiveDevServerError(error);
            }
            this.logger?.debug(`Dev server error: ${error.message}`);
          });

          this.devServerManager.on('exit', () => {
            this.logger?.debug('Dev server stopped');
          });

          this.devServerManager.start();

          // Wait for dev server to be ready
          const actualDevServerUrl = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(
                new SfError('❌ Dev server did not start within 60 seconds.', 'DevServerTimeoutError', [
                  'The dev server may be taking longer than expected to start',
                  'Check if the dev server command is correct in webapplication.json',
                  'Try running the dev server command manually to see if it starts',
                ])
              );
            }, 60_000);

            this.devServerManager?.on('ready', (url: string) => {
              clearTimeout(timeout);
              resolve(url);
            });

            this.devServerManager?.on('error', (error: SfError) => {
              clearTimeout(timeout);
              reject(error);
            });
          });

          // Check for URL mismatch if --url was provided
          if (explicitUrlProvided && flags.url && flags.url !== actualDevServerUrl) {
            this.warn(messages.getMessage('warning.url-mismatch', [flags.url, actualDevServerUrl]));
          }

          // Use the actual dev server URL
          devServerUrl = actualDevServerUrl;
        }
      }

      // Step 4: Get org info for authentication
      const orgConnection = flags['target-org'].getConnection(undefined);
      orgUsername = flags['target-org'].getUsername() ?? orgConnection.getUsername() ?? 'unknown';
      this.logger.debug(`Using authentication for org: ${orgUsername}`);

      // Ensure devServerUrl is set (should always be set by step 3)
      if (!devServerUrl) {
        throw new SfError(
          '❌ Unable to determine dev server URL. Please specify --url or configure dev.url in webapplication.json.',
          'DevServerUrlError'
        );
      }

      // Step 5: Check for Vite proxy and conditionally start standalone proxy
      this.logger.debug('Checking if Vite WebApp proxy is active...');
      const viteProxyActive = await WebappDev.checkViteProxyActive(devServerUrl);

      // Track the final URL to open in browser (either proxy or dev server)
      let finalUrl: string;

      if (viteProxyActive) {
        // Vite's WebAppProxyHandler is handling the proxy - skip standalone proxy
        this.log(messages.getMessage('info.vite-proxy-detected', [devServerUrl]));
        this.logger.debug('Vite proxy detected, skipping standalone proxy server');
        finalUrl = devServerUrl;
      } else {
        // Start standalone proxy server
        this.logger.debug(`Starting proxy server on port ${flags.port}...`);
        const salesforceInstanceUrl = orgConnection.instanceUrl;
        this.proxyServer = new ProxyServer({
          devServerUrl,
          salesforceInstanceUrl,
          port: flags.port,
          manifest: manifest ?? undefined,
          orgAlias: orgUsername,
        });

        await this.proxyServer.start();
        const proxyUrl = this.proxyServer.getProxyUrl();
        this.logger.debug(`Proxy server running on ${proxyUrl}`);

        // Listen for dev server status changes (minimal output)
        this.proxyServer.on('dev-server-up', (url: string) => {
          this.logger?.debug(messages.getMessage('info.dev-server-detected', [url]));
        });

        this.proxyServer.on('dev-server-down', (url: string) => {
          this.log(messages.getMessage('warning.dev-server-unreachable-status', [url]));
          this.log(messages.getMessage('info.start-dev-server-hint'));
        });

        finalUrl = proxyUrl;
      }

      // Step 6: Check if dev server is reachable (non-blocking warning) - only when using standalone proxy
      if (!viteProxyActive && devServerUrl) {
        await this.checkDevServerHealth(devServerUrl);
      }

      // Step 7: Open browser if requested
      if (flags.open) {
        this.logger.debug('Opening browser...');
        await WebappDev.openBrowser(finalUrl);
      }

      // Display usage instructions
      this.log('');
      if (viteProxyActive) {
        this.log(messages.getMessage('info.ready-for-development-vite', [devServerUrl]));
      } else {
        this.log(messages.getMessage('info.ready-for-development', [finalUrl]));
      }
      // Show appropriate stop message based on execution context
      // In TTY (interactive terminal): show "Press Ctrl+C to stop"
      // In non-TTY (IDE, CI, piped): show generic "Server running" message
      if (process.stdout.isTTY) {
        this.log(messages.getMessage('info.press-ctrl-c'));
      } else {
        this.log(messages.getMessage('info.server-running'));
      }
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
        url: finalUrl,
        devServerUrl: devServerUrl ?? '',
      };
    } catch (error) {
      // Cleanup on error
      await this.cleanup();

      // Re-throw as SfError if not already
      if (error instanceof SfError) {
        throw error;
      }

      // Wrap unknown errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SfError(`❌ Failed to start webapp dev command: ${errorMessage}`, 'UnexpectedError', [
        'This is an unexpected error',
        'Please try again',
        'If the problem persists, check the command logs with SF_LOG_LEVEL=debug',
      ]);
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
        this.logger?.debug(messages.getMessage('info.dev-server-healthy', [devServerUrl]));
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
