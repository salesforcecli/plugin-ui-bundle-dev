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
      required: false,
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
   * Poll a URL until it is reachable or timeout.
   *
   * @param url - URL to poll (HEAD request)
   * @param timeoutMs - Max time to wait
   * @param intervalMs - Poll interval
   * @param start - Start timestamp (for recursion)
   * @returns true if reachable within timeout
   */
  private static async pollUntilReachable(
    url: string,
    timeoutMs: number,
    intervalMs = 500,
    start = Date.now()
  ): Promise<boolean> {
    if (await WebappDev.isUrlReachable(url)) {
      return true;
    }
    if (Date.now() - start >= timeoutMs) {
      return false;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    return WebappDev.pollUntilReachable(url, timeoutMs, intervalMs, start);
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
        const defaultPort = flags.port ?? 4545;
        this.log(messages.getMessage('info.no-manifest-defaults', [DEFAULT_DEV_COMMAND, String(defaultPort)]));
        this.log('');
        this.log(messages.getMessage('info.starting-webapp', [selectedWebapp.name]));
      }

      // Step 3: Resolve dev server URL (config-driven, no stdout parsing)
      // Priority: --url > dev.url > (dev.command or no-manifest or no dev config ? default localhost:5173 : throw)
      // Use default URL when: no manifest, no dev section, no dev.command, or dev.command is non-empty
      const hasExplicitCommand = Boolean(manifest?.dev?.command?.trim());
      const hasDevCommand = !selectedWebapp.hasManifest || !manifest?.dev?.command || hasExplicitCommand;
      const resolvedUrl = flags.url ?? manifest?.dev?.url ?? (hasDevCommand ? 'http://localhost:5173' : null);
      if (!resolvedUrl) {
        throw new SfError(
          '❌ Unable to determine dev server URL. Specify --url or configure dev.url or dev.command in webapplication.json.',
          'DevServerUrlError'
        );
      }

      // Check if URL is already reachable
      const isReachable = await WebappDev.isUrlReachable(resolvedUrl);
      if (isReachable) {
        devServerUrl = resolvedUrl;
        this.log(messages.getMessage('info.url-already-available', [resolvedUrl]));
        this.logger.debug(`URL ${resolvedUrl} is reachable, skipping dev server startup`);
      } else if (flags.url) {
        // User explicitly passed --url; assume server is already running at that URL
        // Fail immediately if unreachable (don't start dev server)
        throw new SfError(
          messages.getMessage('error.dev-url-unreachable-with-flag', [resolvedUrl]),
          'DevServerUrlError',
          [
            `Ensure your dev server is running at ${resolvedUrl}`,
            'Remove --url to use dev.command to start the server automatically',
          ]
        );
      } else if (manifest?.dev?.url && !manifest?.dev?.command?.trim()) {
        // dev.url in manifest but no dev.command - don't start (we can't control the port)
        throw new SfError(messages.getMessage('error.dev-url-unreachable', [resolvedUrl]), 'DevServerUrlError', [
          `Ensure your dev server is running at ${resolvedUrl}`,
          'Or add dev.command to webapplication.json to start it automatically',
        ]);
      } else {
        // URL not reachable - we have dev.command (or defaults) to start
        const devCommand = manifest?.dev?.command ?? DEFAULT_DEV_COMMAND;
        if (!selectedWebapp.hasManifest) {
          this.logger.debug(messages.getMessage('info.using-defaults', [devCommand]));
        }

        this.logger.debug(`Starting dev server with command: ${devCommand}, url: ${resolvedUrl}`);
        this.devServerManager = new DevServerManager({
          command: devCommand,
          url: resolvedUrl,
          cwd: webappDir,
          startupTimeout: 60_000,
        });

        let lastDevServerError: (SfError | DevServerError) | null = null;
        this.devServerManager.on('error', (error: SfError | DevServerError) => {
          lastDevServerError = error;
          const devError =
            'devServerError' in error ? (error as SfError & { devServerError?: DevServerError }).devServerError : error;
          if (
            devError &&
            'stderrLines' in devError &&
            Array.isArray(devError.stderrLines) &&
            'title' in devError &&
            'type' in devError
          ) {
            this.proxyServer?.setActiveDevServerError(devError);
          }
          this.logger?.debug(`Dev server error: ${error.message}`);
        });

        this.devServerManager.on('exit', () => {
          this.logger?.debug('Dev server stopped');
        });

        this.devServerManager.start();

        // Poll until URL is reachable, or fail immediately on process error
        const pollPromise = WebappDev.pollUntilReachable(resolvedUrl, 60_000);
        const errorPromise = new Promise<boolean>((_, reject) => {
          this.devServerManager!.once('error', (error: SfError | DevServerError) => {
            const devError =
              'devServerError' in error
                ? (error as SfError & { devServerError?: DevServerError }).devServerError
                : null;
            const suggestions: string[] = [`Try running the command manually to see the error: ${devCommand}`];
            if (devError) {
              suggestions.unshift(`Reason: ${devError.title} - ${devError.message}`);
              if (devError.suggestions.length > 0) suggestions.push(...devError.suggestions);
            } else if ('message' in error) {
              suggestions.unshift(`Reason: ${(error as { message: string }).message}`);
            }
            const lastOutput = this.devServerManager?.getLastOutput();
            if (lastOutput?.trim()) suggestions.push(`Last dev server output:\n${lastOutput}`);
            reject(new SfError('❌ Dev server failed to start.', 'DevServerError', suggestions));
          });
        });

        const pollReached = await Promise.race([pollPromise, errorPromise]);
        if (!pollReached) {
          // Timeout - capture context before cleanup nulls devServerManager
          const manager = this.devServerManager;
          const lastOutput = manager?.getLastOutput() ?? '';

          const suggestions: string[] = [
            'The dev server may be taking longer than expected to start',
            'Check if the dev server command is correct in webapplication.json',
            `Try running the command manually to see the error: ${devCommand}`,
          ];
          const devError =
            lastDevServerError && 'devServerError' in lastDevServerError
              ? (lastDevServerError as SfError & { devServerError?: DevServerError }).devServerError
              : null;
          if (devError) {
            suggestions.unshift(`Reason: ${devError.title} - ${devError.message}`);
            if (devError.suggestions.length > 0) suggestions.push(...devError.suggestions);
          } else if (lastDevServerError && 'message' in lastDevServerError) {
            suggestions.unshift(`Reason: ${(lastDevServerError as { message: string }).message}`);
          }
          if (lastOutput.trim()) suggestions.push(`Last dev server output:\n${lastOutput}`);

          await this.cleanup();
          throw new SfError('❌ Dev server did not start within 60 seconds.', 'DevServerTimeoutError', suggestions);
        }

        devServerUrl = resolvedUrl;
        this.logger?.debug(`Dev server ready at: ${devServerUrl}`);
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
        // Resolve proxy port: --port > dev.port > default 4545
        // If configured and busy: throw. If not configured and busy: try next port.
        const portExplicitlyConfigured = flags.port !== undefined || manifest?.dev?.port != null;
        const initialProxyPort = flags.port ?? manifest?.dev?.port ?? 4545;
        const maxPortAttempts = 10;
        const serverUrl = devServerUrl;

        const tryStartProxy = async (port: number, attempt: number): Promise<void> => {
          this.logger?.debug(`Starting proxy server on port ${port}...`);
          const salesforceInstanceUrl = orgConnection.instanceUrl;
          this.proxyServer = new ProxyServer({
            devServerUrl: serverUrl,
            salesforceInstanceUrl,
            port,
            manifest: manifest ?? undefined,
            orgAlias: orgUsername,
          });

          try {
            await this.proxyServer.start();
          } catch (error) {
            const err = error as NodeJS.ErrnoException;
            const isAddrInUse =
              err.code === 'EADDRINUSE' || (error instanceof SfError && error.name === 'PortInUseError');
            if (isAddrInUse) {
              if (portExplicitlyConfigured) {
                throw new SfError(messages.getMessage('error.port-in-use', [String(port)]), 'PortInUseError');
              }
              if (attempt >= maxPortAttempts - 1) {
                throw error;
              }
              this.proxyServer = null;
              this.logger?.debug(`Port ${port} busy, trying ${port + 1}...`);
              return tryStartProxy(port + 1, attempt + 1);
            }
            throw error;
          }
        };

        await tryStartProxy(initialProxyPort, 0);

        const proxyUrl = this.proxyServer!.getProxyUrl();
        this.logger.debug(`Proxy server running on ${proxyUrl}`);

        // Listen for dev server status changes (minimal output)
        this.proxyServer!.on('dev-server-up', (url: string) => {
          this.logger?.debug(messages.getMessage('info.dev-server-detected', [url]));
        });

        this.proxyServer!.on('dev-server-down', (url: string) => {
          this.log(messages.getMessage('warning.dev-server-unreachable-status', [url]));
          this.log(messages.getMessage('info.start-dev-server-hint'));
        });

        finalUrl = proxyUrl;
      }

      // Emit JSON line to stderr before human messages (CLI-extension contract)
      process.stderr.write(JSON.stringify({ url: finalUrl }) + '\n');

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
      // In TTY: match the "Stopped" messages (dev server, proxy server, or both)
      // In non-TTY (IDE, CI, piped): same target-based format, but "Close Live Preview" instead of Ctrl+C
      const hasProxy = !!this.proxyServer;
      const hasDevServer = !!this.devServerManager;
      const targetKey =
        hasProxy && hasDevServer
          ? 'info.stop-target-both'
          : hasProxy
          ? 'info.stop-target-proxy'
          : hasDevServer
          ? 'info.stop-target-dev'
          : null;
      const runningTargetKey =
        hasProxy && hasDevServer
          ? 'info.server-running-target-both'
          : hasProxy
          ? 'info.server-running-target-proxy'
          : hasDevServer
          ? 'info.server-running-target-dev'
          : null;

      if (process.stdout.isTTY) {
        if (targetKey) {
          this.log(messages.getMessage('info.press-ctrl-c-target', [messages.getMessage(targetKey)]));
        } else {
          this.log(messages.getMessage('info.press-ctrl-c'));
        }
      } else {
        this.log(messages.getMessage(runningTargetKey ?? 'info.server-running'));
      }
      this.log('');

      // Keep the command running until interrupted or dev server exits
      await new Promise<void>((resolve) => {
        const handleSignal = (signal: string): void => {
          this.logger?.debug(`Received ${signal} signal, initiating graceful shutdown`);
          process.exitCode = 130; // Standard exit code for SIGINT/SIGTERM
          resolve();
        };

        // Exit if dev server exits with SIGINT (user pressed Ctrl+C)
        if (this.devServerManager) {
          this.devServerManager.on('exit', (code: number | null, signal: string | null) => {
            if (signal === 'SIGINT') {
              this.logger?.debug('Dev server received SIGINT, exiting command');
              resolve();
            }
          });
        }

        // CRITICAL: Remove sfCommand's signal handlers before adding our own.
        // sfCommand adds process.on('SIGINT', () => this.exit(130)) which throws ExitError
        // and prints an ugly stack trace. By removing those handlers and handling signals
        // ourselves, we exit cleanly: resolve() -> run() returns -> finally() cleans up.
        const signalsToHandle = ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const;
        for (const signal of signalsToHandle) {
          process.removeAllListeners(signal);
          process.once(signal, () => handleSignal(signal));
        }
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
    const hasProxy = !!this.proxyServer;
    const hasDevServer = !!this.devServerManager;
    const showShutdownLog = hasProxy || hasDevServer;

    if (showShutdownLog) {
      this.log('');
    }

    // Stop proxy server first (closes connections, stops accepting new requests)
    if (this.proxyServer) {
      try {
        await this.proxyServer.stop();
      } catch (error) {
        this.logger?.debug(`Failed to stop proxy server: ${(error as Error).message}`);
      }
      this.proxyServer = null;
    }

    // Stop dev server
    if (this.devServerManager) {
      try {
        await this.devServerManager.stop();
      } catch (error) {
        this.logger?.debug(`Failed to stop dev server: ${(error as Error).message}`);
      }
      this.devServerManager = null;
    }

    // Stop manifest watcher
    if (this.manifestWatcher) {
      try {
        await this.manifestWatcher.stop();
      } catch (error) {
        this.logger?.debug(`Failed to stop manifest watcher: ${(error as Error).message}`);
      }
      this.manifestWatcher = null;
    }

    if (showShutdownLog) {
      const targetKey =
        hasProxy && hasDevServer
          ? 'info.stop-target-both'
          : hasProxy
          ? 'info.stop-target-proxy'
          : 'info.stop-target-dev';
      this.log(messages.getMessage('info.stopped-target', [messages.getMessage(targetKey)]));
    }
    this.logger?.debug('Cleanup complete');
  }
}
