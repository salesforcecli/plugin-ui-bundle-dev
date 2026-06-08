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

import { randomUUID } from 'node:crypto';
import open from 'open';
import select from '@inquirer/select';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Logger, Messages, SfError } from '@salesforce/core';
import type { UiBundleDevResult, DevServerError } from '../../config/types.js';
import type { UiBundleManifest } from '../../config/manifest.js';
import { ManifestWatcher } from '../../config/ManifestWatcher.js';
import { DevServerManager } from '../../server/DevServerManager.js';
import { ProxyServer } from '../../proxy/ProxyServer.js';
import { discoverUiBundle, DEFAULT_DEV_COMMAND, type DiscoveredUiBundle } from '../../config/uiBundleDiscovery.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-ui-bundle-dev', 'ui-bundle.dev');

// Kill switch for backward compatibility. true = warn + allow webapps that
// don't echo X-Live-Preview-Token; false = strict, abort on missing token.
// Override at runtime with SF_UI_BUNDLE_ALLOW_LEGACY_WEBAPPS=false. Flip the
// default once webapp adoption is high; the liberal branch then becomes dead
// code and is a one-line removal.
const ALLOW_LEGACY_WEBAPPS_DEFAULT = true;

function allowLegacyWebapps(): boolean {
  const raw = process.env.SF_UI_BUNDLE_ALLOW_LEGACY_WEBAPPS;
  if (raw == null) return ALLOW_LEGACY_WEBAPPS_DEFAULT;
  const v = raw.trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

type PortStatus = 'available' | 'verified' | 'legacy' | 'foreign';
type PollResult = { mode: 'verified' | 'legacy' } | { mode: 'timeout' };

export default class UiBundleDev extends SfCommand<UiBundleDevResult> {
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
  /** Legacy-webapp warning fires once per CLI process. */
  private legacyWarningEmitted = false;

  /**
   * Open the proxy URL in the default browser
   */
  private static async openBrowser(url: string): Promise<void> {
    await open(url);
  }

  /**
   * Prompt user to select a uiBundle from multiple discovered uiBundles
   * Uses interactive arrow-key selection (standard SF CLI pattern)
   */
  private static async promptUiBundleSelection(uiBundles: DiscoveredUiBundle[]): Promise<DiscoveredUiBundle> {
    const WARNING = '\u26A0\uFE0F'; // ⚠️

    const choices = uiBundles.map((uiBundle) => {
      if (uiBundle.hasManifest) {
        // Has manifest - show name only
        return {
          name: uiBundle.name,
          value: uiBundle,
        };
      } else {
        // No manifest - show warning symbol
        return {
          name: `${uiBundle.name} - ${WARNING} No Manifest`,
          value: uiBundle,
        };
      }
    });

    return select({
      message: messages.getMessage('prompt.select-uiBundle'),
      choices,
    });
  }

  /**
   * Probe the dev-server URL and classify what's listening.
   * Returns 'available' when no TCP response, 'verified' when the response
   * echoes our X-Live-Preview-Token, 'legacy' on OK with no token header
   * (old @salesforce/ui-bundle or a passive squatter; the caller decides via
   * allowLegacyWebapps()), 'foreign' on non-OK status or token mismatch.
   */
  private static async checkPortStatus(url: string): Promise<PortStatus> {
    const expectedToken = process.env.SF_LIVE_PREVIEW_TOKEN;

    try {
      const healthUrl = new URL(url);
      healthUrl.searchParams.set('sfProxyHealthCheck', 'true');
      const response = await fetch(healthUrl.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return 'foreign';

      const token = response.headers.get('X-Live-Preview-Token');
      if (token == null) return 'legacy';
      if (expectedToken && token === expectedToken) return 'verified';
      return 'foreign';
    } catch {
      return 'available';
    }
  }

  /**
   * Resolve a non-'available' port status to an action: returns the effective
   * mode ('verified' | 'legacy') or throws PortSquattingAbort for 'foreign'
   * (always) and 'legacy' under strict mode.
   */
  private static classifyOccupiedPort(status: 'verified' | 'legacy' | 'foreign', url: string): 'verified' | 'legacy' {
    if (status === 'verified') return 'verified';
    if (status === 'legacy') {
      if (allowLegacyWebapps()) return 'legacy';
      process.stderr.write(
        JSON.stringify({ error: 'PortSquattingAbort', port: url, reason: 'strict-mode-legacy' }) + '\n'
      );
      throw new SfError(
        'Aborted: server on port did not echo X-Live-Preview-Token and strict mode is enabled ' +
          '(SF_UI_BUNDLE_ALLOW_LEGACY_WEBAPPS=false).',
        'PortSquattingAbort'
      );
    }
    // 'foreign'
    process.stderr.write(JSON.stringify({ error: 'PortSquattingAbort', port: url, reason: 'foreign' }) + '\n');
    throw new SfError('Aborted: another server is on the port and failed identity verification.', 'PortSquattingAbort');
  }

  /**
   * Poll the URL after spawn until it answers. Every poll re-runs identity
   * verification via the X-Live-Preview-Token header (no "is it up vs. is it
   * ours" race). Throws PortSquattingAbort on 'foreign' (always) or 'legacy'
   * under strict mode; otherwise resolves with the effective mode or 'timeout'.
   */
  private static async pollUntilVerified(
    url: string,
    timeoutMs: number,
    intervalMs = 500,
    start = Date.now()
  ): Promise<PollResult> {
    const status = await UiBundleDev.checkPortStatus(url);
    if (status !== 'available') {
      const mode = UiBundleDev.classifyOccupiedPort(status, url);
      return { mode };
    }
    if (Date.now() - start >= timeoutMs) {
      return { mode: 'timeout' };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    return UiBundleDev.pollUntilVerified(url, timeoutMs, intervalMs, start);
  }

  /**
   * Check if Vite's UiBundleProxyHandler is active at the dev server URL.
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
      return response.headers.get('X-Salesforce-UIBundle-Proxy') === 'true';
    } catch {
      // Health check failed - Vite proxy not active
      return false;
    }
  }

  // eslint-disable-next-line complexity
  public async run(): Promise<UiBundleDevResult> {
    const { flags } = await this.parse(UiBundleDev);

    // Initialize logger from @salesforce/core for debug logging
    // Logger respects SF_LOG_LEVEL environment variable
    this.logger = await Logger.child('UiBundleDev');

    // Ensure a live preview token exists — self-generate if the extension didn't provide one
    if (!process.env.SF_LIVE_PREVIEW_TOKEN) {
      process.env.SF_LIVE_PREVIEW_TOKEN = randomUUID();
    }

    // Declare variables outside try block for catch block access
    let manifest: UiBundleManifest | null = null;
    let devServerUrl: string | null = null;
    let orgUsername = '';

    try {
      // Step 1: Discover and select uiBundle
      this.logger.debug('Discovering ui-bundle.json manifest(s)...');

      const { uiBundle: discoveredUiBundle, allUiBundles, autoSelected } = await discoverUiBundle(flags.name);

      // Handle multiple uiBundles case - prompt user to select
      let selectedUiBundle: DiscoveredUiBundle;
      if (!discoveredUiBundle) {
        this.log(messages.getMessage('info.multiple-uiBundles-found', [String(allUiBundles.length)]));

        selectedUiBundle = await UiBundleDev.promptUiBundleSelection(allUiBundles);
      } else {
        selectedUiBundle = discoveredUiBundle;

        // Show info message if uiBundle was auto-selected because user is inside its folder
        if (autoSelected) {
          this.log(messages.getMessage('info.uiBundle-auto-selected', [selectedUiBundle.name]));
        }
      }

      // The uiBundle directory path (where the uiBundle lives)
      const uiBundleDir = selectedUiBundle.path;

      this.logger.debug(`Using uiBundle: ${selectedUiBundle.name} at ${selectedUiBundle.relativePath}`);

      // Step 2: Handle manifest-based vs no-manifest uiBundles
      if (selectedUiBundle.hasManifest && selectedUiBundle.manifestPath) {
        // UI bundle has manifest - load and watch it
        this.manifestWatcher = new ManifestWatcher({
          manifestPath: selectedUiBundle.manifestPath,
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
        this.log(messages.getMessage('info.starting-uiBundle', [selectedUiBundle.name]));
        this.logger.debug(`Manifest loaded: ${selectedUiBundle.name}`);

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
        this.log(messages.getMessage('info.starting-uiBundle', [selectedUiBundle.name]));
      }

      // Step 3: Resolve dev server URL (config-driven, no stdout parsing)
      // Priority: --url > dev.url > (dev.command or no-manifest or no dev config ? default localhost:5173 : throw)
      // Use default URL when: no manifest, no dev section, no dev.command, or dev.command is non-empty
      const hasExplicitCommand = Boolean(manifest?.dev?.command?.trim());
      const hasDevCommand = !selectedUiBundle.hasManifest || !manifest?.dev?.command || hasExplicitCommand;
      const resolvedUrl = flags.url ?? manifest?.dev?.url ?? (hasDevCommand ? 'http://localhost:5173' : null);
      if (!resolvedUrl) {
        throw new SfError(
          '❌ Unable to determine dev server URL. Specify --url or configure dev.url or dev.command in ui-bundle.json.',
          'DevServerUrlError'
        );
      }

      // Pre-flight: classifyOccupiedPort throws on foreign / strict-mode legacy.
      let portReachable = false;
      const preFlightStatus = await UiBundleDev.checkPortStatus(resolvedUrl);
      if (preFlightStatus !== 'available') {
        const mode = UiBundleDev.classifyOccupiedPort(preFlightStatus, resolvedUrl);
        portReachable = true;
        if (mode === 'legacy') {
          this.emitLegacyWebappWarning(resolvedUrl, selectedUiBundle.name);
        }
      }

      if (portReachable) {
        devServerUrl = resolvedUrl;
        this.log(messages.getMessage('info.url-already-available', [resolvedUrl]));
        this.logger.debug(`URL ${resolvedUrl} is already available, skipping dev server startup`);
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
          'Or add dev.command to ui-bundle.json to start it automatically',
        ]);
      } else {
        // URL not reachable - we have dev.command (or defaults) to start
        const devCommand = manifest?.dev?.command ?? DEFAULT_DEV_COMMAND;
        if (!selectedUiBundle.hasManifest) {
          this.logger.debug(messages.getMessage('info.using-defaults', [devCommand]));
        }

        this.logger.debug(`Starting dev server with command: ${devCommand}, url: ${resolvedUrl}`);
        this.devServerManager = new DevServerManager({
          command: devCommand,
          url: resolvedUrl,
          cwd: uiBundleDir,
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

        // pollUntilVerified throws on foreign / strict-mode legacy; otherwise
        // resolves with { mode: 'verified' | 'legacy' | 'timeout' }.
        const pollPromise = UiBundleDev.pollUntilVerified(resolvedUrl, 60_000);
        const errorPromise = new Promise<PollResult>((_, reject) => {
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

        const pollResult = await Promise.race([pollPromise, errorPromise]);
        if (pollResult.mode === 'legacy') {
          this.emitLegacyWebappWarning(resolvedUrl, selectedUiBundle.name);
        }
        if (pollResult.mode === 'timeout') {
          // Timeout - capture context before cleanup nulls devServerManager
          const manager = this.devServerManager;
          const lastOutput = manager?.getLastOutput() ?? '';

          const suggestions: string[] = [
            'The dev server may be taking longer than expected to start',
            'Check if the dev server command is correct in ui-bundle.json',
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
          '❌ Unable to determine dev server URL. Please specify --url or configure dev.url in ui-bundle.json.',
          'DevServerUrlError'
        );
      }

      // Step 5: Check for Vite proxy and conditionally start standalone proxy
      this.logger.debug('Checking if Vite UI bundle proxy is active...');
      const viteProxyActive = await UiBundleDev.checkViteProxyActive(devServerUrl);

      // Track the final URL to open in browser (either proxy or dev server)
      let finalUrl: string;

      if (viteProxyActive) {
        // Vite's UiBundleProxyHandler is handling the proxy - skip standalone proxy
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
        await UiBundleDev.openBrowser(finalUrl);
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
      throw new SfError(`❌ Failed to start ui-bundle dev command: ${errorMessage}`, 'UnexpectedError', [
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
   * Emit the legacy-webapp warning on stderr (structured JSON for the VS Code
   * extension) and via SfCommand.warn() (terminal/output channel). Idempotent.
   */
  private emitLegacyWebappWarning(url: string, bundleName: string): void {
    if (this.legacyWarningEmitted) return;
    this.legacyWarningEmitted = true;
    process.stderr.write(
      JSON.stringify({ warn: 'LEGACY_WEBAPP_DETECTED', port: url, bundle: bundleName }) + '\n'
    );
    this.warn(
      `Legacy @salesforce/ui-bundle detected on ${url} for "${bundleName}". ` +
        'Live Preview is proceeding without token verification. ' +
        'Please update your webapp\'s @salesforce/ui-bundle dependency — ' +
        'strict mode will be enforced in a future release.'
    );
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
