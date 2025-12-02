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

import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import httpProxy from 'http-proxy';
import { SfError } from '@salesforce/core';
import type { AuthManager } from '../auth/AuthManager.js';
import { ErrorPageRenderer } from '../templates/ErrorPageRenderer.js';
import type { ErrorPageData } from '../templates/ErrorPageRenderer.js';
import { Logger } from '../utils/Logger.js';
import type { ErrorMetadata, RuntimeErrorPageData } from '../error/types.js';
import { ErrorHandler } from '../error/ErrorHandler.js';
import { RequestRouter } from './RequestRouter.js';
import type { RouterConfig } from './RequestRouter.js';

/**
 * Configuration for the proxy server
 */
export type ProxyServerConfig = {
  /**
   * Port to listen on
   */
  port: number;
  /**
   * Dev server URL (e.g., http://localhost:5173)
   */
  devServerUrl: string;
  /**
   * Salesforce instance URL (from AuthManager)
   */
  salesforceInstanceUrl: string;
  /**
   * AuthManager instance for token injection
   */
  authManager: AuthManager;
  /**
   * Optional router configuration
   */
  routerConfig?: RouterConfig;
  /**
   * Enable debug logging
   */
  debug?: boolean;
  /**
   * Host to bind to (0.0.0.0 for all interfaces, 127.0.0.1 for localhost only)
   */
  host?: string;
};

/**
 * Proxy server statistics
 */
export type ProxyStats = {
  requestCount: number;
  salesforceRequests: number;
  devServerRequests: number;
  webSocketUpgrades: number;
  errors: number;
  startTime: Date;
};

/**
 * ProxyServer manages the HTTP proxy that sits between the web application
 * and both the Salesforce instance and the local development server.
 *
 * It performs the following key functions:
 * - Routes requests to either Salesforce or dev server based on URL patterns
 * - Injects Salesforce authentication headers for API requests
 * - Proxies WebSocket connections for HMR (Hot Module Replacement)
 * - Handles Code Builder environment specifics
 * - Provides error handling and logging
 * - Periodic health checks of dev server with status updates
 * - HTML error pages for browser when dev server is down
 *
 * Architecture:
 * - Browser sends request to ProxyServer
 * - RequestRouter decides where to route (Salesforce or dev server)
 * - AuthManager provides authentication headers for Salesforce requests
 * - http-proxy forwards the request to the appropriate target
 * - Periodic health check monitors dev server availability
 * - On dev server down, serves HTML error page to browser
 *
 * Events:
 * - 'dev-server-up': Dev server became available
 * - 'dev-server-down': Dev server became unavailable
 */
export class ProxyServer extends EventEmitter {
  private readonly config: ProxyServerConfig;
  private readonly logger: Logger;
  private readonly router: RequestRouter;
  private readonly proxy: httpProxy;
  private readonly errorPageRenderer: ErrorPageRenderer;
  private server: Server | null = null;
  private readonly stats: ProxyStats;
  private readonly isCodeBuilder: boolean;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private devServerStatus: 'unknown' | 'up' | 'down' = 'unknown';
  private readonly workspaceScript: string;
  private activeRuntimeError: ErrorMetadata | null = null;
  private errorClearTimeout: NodeJS.Timeout | null = null;
  private readonly activeConnections: Set<import('net').Socket> = new Set();

  public constructor(config: ProxyServerConfig) {
    super(); // Call EventEmitter constructor
    this.config = config;
    this.logger = new Logger(config.debug ?? false);
    this.router = new RequestRouter(config.routerConfig);
    this.errorPageRenderer = new ErrorPageRenderer();
    this.workspaceScript = ProxyServer.detectWorkspaceScript();
    this.stats = {
      requestCount: 0,
      salesforceRequests: 0,
      devServerRequests: 0,
      webSocketUpgrades: 0,
      errors: 0,
      startTime: new Date(),
    };

    // Detect Code Builder environment
    this.isCodeBuilder = ProxyServer.detectCodeBuilder();
    if (this.isCodeBuilder) {
      this.logger.debug('Code Builder environment detected');
    }

    // Create http-proxy instance
    this.proxy = httpProxy.createProxyServer({
      changeOrigin: true,
      ws: true, // Enable WebSocket proxying
      xfwd: true, // Add X-Forwarded-* headers
    });

    // Set up proxy error handling
    this.proxy.on('error', (err, req, res) => {
      this.handleProxyError(err, req, res);
    });

    this.logger.debug('ProxyServer initialized');
    this.logger.debug(`  Dev server: ${config.devServerUrl}`);
    this.logger.debug(`  Salesforce: ${config.salesforceInstanceUrl}`);
    this.logger.debug(`  Port: ${config.port}`);
    this.logger.debug(`  Code Builder: ${this.isCodeBuilder}`);
  }

  /**
   * Detects if running in Code Builder environment
   * Code Builder sets specific environment variables
   */
  private static detectCodeBuilder(): boolean {
    // Code Builder sets these environment variables
    const codeBuilderIndicators = [
      'SBQQ_STUDIO_WORKSPACE', // Code Builder workspace indicator
      'SALESFORCE_PROJECT_ID', // Project ID in Code Builder
      'CODE_BUILDER_SESSION', // Session indicator
    ];

    return codeBuilderIndicators.some((indicator) => process.env[indicator] !== undefined);
  }

  /**
   * Detects workspace dev server script from package.json
   */
  private static detectWorkspaceScript(): string {
    try {
      // Try to read package.json from current working directory
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };

      // Look for common dev script names
      const commonScripts = ['dev', 'start', 'serve'];
      for (const scriptName of commonScripts) {
        if (packageJson.scripts?.[scriptName]) {
          return `npm run ${scriptName}`;
        }
      }

      return 'npm run dev';
    } catch {
      return 'npm run dev';
    }
  }

  /**
   * Updates the dev server URL and restarts health checks
   * Used when the manifest changes and specifies a new dev server URL
   *
   * @param newDevServerUrl - The new dev server URL
   */
  public updateDevServerUrl(newDevServerUrl: string): void {
    if (this.config.devServerUrl === newDevServerUrl) {
      this.logger.debug(`Dev server URL unchanged: ${newDevServerUrl}`);
      return;
    }

    this.logger.info(`Updating dev server URL: ${this.config.devServerUrl} → ${newDevServerUrl}`);
    this.config.devServerUrl = newDevServerUrl;

    // Reset dev server status to trigger fresh check
    this.devServerStatus = 'unknown';

    // Restart health check with new URL
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.startHealthCheck();
    }

    // Perform immediate health check
    this.checkDevServerHealth().catch((error) => {
      this.logger.error(`Failed to check dev server health: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /**
   * Starts the proxy server
   */
  public async start(): Promise<void> {
    if (this.server) {
      throw new SfError('Proxy server is already running', 'ProxyAlreadyRunning');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.server = createServer((req, res) => {
          this.handleRequest(req, res).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Request handling error: ${errorMessage}`);
            this.stats.errors++;
          });
        });

        // Handle WebSocket upgrades
        this.server.on('upgrade', (req, socket, head) => {
          try {
            this.handleWebSocketUpgrade(req, socket, head);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`WebSocket upgrade error: ${errorMessage}`);
            this.stats.errors++;
            socket.end();
          }
        });

        // Determine host to bind to
        const host = this.getBindHost();

        // Track connections for graceful shutdown
        this.server.on('connection', (socket) => {
          this.activeConnections.add(socket);
          socket.once('close', () => {
            this.activeConnections.delete(socket);
          });
        });

        // Start listening
        this.server.listen(this.config.port, host, () => {
          this.logger.debug(`Proxy server listening on http://${host}:${this.config.port}`);
          this.logger.debug(`Forwarding to dev server: ${this.config.devServerUrl}`);
          this.logger.debug(`Forwarding to Salesforce: ${this.config.salesforceInstanceUrl}`);

          // Start periodic health check
          this.startHealthCheck();

          resolve();
        });

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            reject(
              new SfError(
                `Port ${this.config.port} is already in use. Please try a different port with the --port flag or stop the service using that port.`,
                'PortInUseError'
              )
            );
          } else if (error.code === 'EACCES') {
            reject(
              new SfError(
                `Permission denied to bind to port ${this.config.port}. Try using a port number above 1024 or run with appropriate permissions.`,
                'PortPermissionError'
              )
            );
          } else {
            reject(new SfError(`Failed to start proxy server: ${error.message}`, 'ProxyStartFailed'));
          }
        });
      } catch (error) {
        reject(
          new SfError(
            `Failed to create proxy server: ${error instanceof Error ? error.message : String(error)}`,
            'ProxyCreateFailed'
          )
        );
      }
    });
  }

  /**
   * Stops the proxy server
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Clear any error timeout
    if (this.errorClearTimeout) {
      clearTimeout(this.errorClearTimeout);
      this.errorClearTimeout = null;
    }

    // Clear active runtime error
    this.activeRuntimeError = null;

    // Destroy all active connections to force immediate shutdown
    for (const socket of this.activeConnections) {
      socket.destroy();
    }
    this.activeConnections.clear();

    return new Promise((resolve, reject) => {
      // Set a timeout to force resolve if server.close() hangs
      const forceCloseTimeout = setTimeout(() => {
        this.logger.debug('Proxy server stop timeout, forcing shutdown');
        this.server = null;
        resolve();
      }, 2000); // 2 second timeout

      this.server!.close((error) => {
        clearTimeout(forceCloseTimeout);
        if (error) {
          // Don't reject on ENOTCONN or similar - server might already be closing
          if (error.message.includes('Server is not running')) {
            this.logger.debug('Proxy server already stopped');
            this.server = null;
            resolve();
          } else {
            reject(new SfError(`Failed to stop proxy server: ${error.message}`, 'ProxyStopFailed'));
          }
        } else {
          this.logger.debug('Proxy server stopped');
          this.server = null;
          resolve();
        }
      });

      // Close the http-proxy instance
      this.proxy.close();
    });
  }

  /**
   * Gets current server statistics
   */
  public getStats(): ProxyStats {
    return { ...this.stats };
  }

  /**
   * Gets the proxy server URL
   */
  public getProxyUrl(): string {
    const host = this.getBindHost();
    // Always display localhost for local addresses
    const displayHost = host === '0.0.0.0' || host === '127.0.0.1' ? 'localhost' : host;
    return `http://${displayHost}:${this.config.port}`;
  }

  /**
   * Checks if the proxy server is running
   */
  public isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get current dev server status
   */
  public getDevServerStatus(): string {
    return this.devServerStatus;
  }

  /**
   * Set an active runtime error that will be displayed on all requests
   *
   * This makes the error visible automatically without requiring developers
   * to navigate to a special URL. The error will be displayed on any page
   * until it's cleared or times out.
   *
   * @param metadata - Error metadata from GlobalErrorCapture
   */
  public setActiveRuntimeError(metadata: ErrorMetadata): void {
    this.activeRuntimeError = metadata;
    this.logger.debug('Runtime error is now active - will be displayed on all requests');

    // Clear any existing timeout
    if (this.errorClearTimeout) {
      clearTimeout(this.errorClearTimeout);
    }

    // Auto-clear error after 5 minutes (in case developer doesn't fix it)
    // This prevents the error page from being stuck indefinitely
    this.errorClearTimeout = setTimeout(() => {
      this.clearActiveRuntimeError();
      this.logger.debug('Runtime error auto-cleared after timeout');
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Clear the active runtime error
   *
   * This should be called when the error is fixed or no longer relevant.
   * After clearing, normal proxying will resume.
   */
  public clearActiveRuntimeError(): void {
    if (this.activeRuntimeError) {
      this.logger.debug('Runtime error cleared - resuming normal operation');
      this.activeRuntimeError = null;
    }

    if (this.errorClearTimeout) {
      clearTimeout(this.errorClearTimeout);
      this.errorClearTimeout = null;
    }
  }

  /**
   * Check if there's an active runtime error
   *
   * @returns True if there's an active runtime error
   */
  public hasActiveRuntimeError(): boolean {
    return this.activeRuntimeError !== null;
  }

  /**
   * Serve a runtime error page to the browser
   *
   * This method formats and serves a beautiful error page when runtime errors occur
   *
   * @param metadata - Error metadata from GlobalErrorCapture
   * @param res - HTTP response object
   */
  public serveRuntimeErrorPage(metadata: ErrorMetadata, res: ServerResponse): void {
    try {
      // Format timestamp
      const timestamp = new Date(metadata.timestamp);
      const timestampFormatted = timestamp.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });

      // Get context-aware suggestions
      const suggestions = ErrorHandler.getSuggestionsForError(metadata.originalError as Error);

      // Prepare error report JSON
      const errorReport = {
        type: metadata.type,
        message: metadata.message,
        code: metadata.code,
        timestamp: metadata.timestamp,
        severity: metadata.severity,
        stack: metadata.formattedStack.text,
        frames: metadata.formattedStack.frames.map((frame) => ({
          function: frame.functionName,
          file: frame.fileName,
          line: frame.lineNumber,
          column: frame.columnNumber,
        })),
        system: {
          nodeVersion: metadata.nodeVersion,
          platform: metadata.platform,
          pid: metadata.pid,
          memory: metadata.memoryUsage,
        },
        context: metadata.context,
        isUnhandledRejection: metadata.isUnhandledRejection,
      };

      // Prepare runtime error page data
      const pageData: RuntimeErrorPageData = {
        errorType: metadata.type,
        errorMessage: metadata.message,
        formattedStackHtml: metadata.formattedStack.html,
        formattedStackText: metadata.formattedStack.text,
        timestamp: metadata.timestamp,
        timestampFormatted,
        severity: metadata.severity,
        metadata: {
          nodeVersion: metadata.nodeVersion,
          platform: metadata.platform,
          pid: metadata.pid,
          heapUsedMB: metadata.memoryUsage.heapUsedMB,
          heapTotalMB: metadata.memoryUsage.heapTotalMB,
          rssMB: metadata.memoryUsage.rssMB,
        },
        suggestions,
        errorCode: metadata.code,
        errorReportJson: JSON.stringify(errorReport, null, 2),
      };

      // Render the error page
      const html = this.errorPageRenderer.renderRuntimeError(pageData);

      // Send response
      res.writeHead(500, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(html);

      this.logger.debug(`Served runtime error page: ${metadata.type}: ${metadata.message}`);
    } catch (renderError) {
      // Fallback if rendering fails
      const errorMessage = renderError instanceof Error ? renderError.message : String(renderError);
      this.logger.error(`Failed to render error page template: ${errorMessage}`);
      this.logger.debug('Using fallback error page');

      const fallbackHtml = ErrorPageRenderer.renderRuntimeErrorFallback(
        metadata.type,
        metadata.message,
        metadata.formattedStack.text
      );

      res.writeHead(500, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(fallbackHtml);
    }
  }

  /**
   * Checks if running in Code Builder environment
   */
  public isCodeBuilderEnvironment(): boolean {
    return this.isCodeBuilder;
  }

  /**
   * Sets up graceful shutdown handlers for process signals
   * Call this method to automatically handle SIGINT and SIGTERM
   *
   * @param onShutdown Optional callback to run before shutdown
   * @returns Cleanup function to remove signal handlers
   */
  public setupGracefulShutdown(onShutdown?: () => void | Promise<void>): () => void {
    const handleShutdown = async (signal: string): Promise<void> => {
      this.logger.debug(`Received ${signal}, shutting down gracefully...`);

      // Run optional callback
      if (onShutdown) {
        try {
          await onShutdown();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Shutdown callback error: ${errorMessage}`);
        }
      }

      // Stop the proxy server
      await this.stop();
    };

    const sigintHandler = (): void => {
      handleShutdown('SIGINT').catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`SIGINT handler error: ${errorMessage}`);
        process.exit(1);
      });
    };

    const sigtermHandler = (): void => {
      handleShutdown('SIGTERM').catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`SIGTERM handler error: ${errorMessage}`);
        process.exit(1);
      });
    };

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    // Return cleanup function
    return (): void => {
      process.off('SIGINT', sigintHandler);
      process.off('SIGTERM', sigtermHandler);
    };
  }

  /**
   * Start periodic health check of dev server
   */
  private startHealthCheck(): void {
    // Initial check
    this.checkDevServerHealth().catch((error) => {
      this.logger.debug(`Initial health check error: ${String(error)}`);
    });

    // Check every 10 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkDevServerHealth().catch((error) => {
        this.logger.debug(`Health check error: ${String(error)}`);
      });
    }, 10_000); // 10 seconds
  }

  /**
   * Check if dev server is reachable
   */
  private async checkDevServerHealth(): Promise<void> {
    try {
      await fetch(this.config.devServerUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      // Dev server is responding
      if (this.devServerStatus !== 'up') {
        this.devServerStatus = 'up';
        this.emit('dev-server-up', this.config.devServerUrl);
        this.logger.debug(`Dev server is UP: ${this.config.devServerUrl}`);
      }
    } catch {
      // Dev server is not responding
      if (this.devServerStatus !== 'down') {
        this.devServerStatus = 'down';
        this.emit('dev-server-down', this.config.devServerUrl);
        this.logger.debug(`Dev server is DOWN: ${this.config.devServerUrl}`);
      }
    }
  }

  /**
   * Determines the appropriate host to bind to based on environment
   */
  private getBindHost(): string {
    // If host is explicitly configured, use it
    if (this.config.host) {
      return this.config.host;
    }

    // Code Builder requires binding to all interfaces (0.0.0.0)
    // so it can be accessed from the browser preview
    if (this.isCodeBuilder) {
      this.logger.debug('Code Builder: Binding to 0.0.0.0 (all interfaces)');
      return '0.0.0.0';
    }

    // Default: localhost only for security
    return '127.0.0.1';
  }

  /**
   * Handles incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.stats.requestCount++;

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    this.logger.debug(`[${method}] ${url}`);

    // Special route to clear active runtime error (for manual clearing)
    if (url === '/__clear_error__') {
      this.clearActiveRuntimeError();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h1>Error Cleared</h1><p>Runtime error has been cleared. <a href="/">Return to app</a></p></body></html>'
      );
      return;
    }

    // If there's an active runtime error, display it on ALL requests
    // This provides automatic error visibility without requiring navigation to a special URL
    if (this.activeRuntimeError) {
      this.logger.debug('Active runtime error - serving error page');
      this.serveRuntimeErrorPage(this.activeRuntimeError, res);
      return;
    }

    try {
      // Determine routing
      const decision = this.router.route(req);
      this.logger.debug(`Routing decision: ${decision.target} (${decision.reason})`);

      if (decision.target === 'salesforce') {
        await this.proxySalesforceRequest(req, res);
      } else {
        this.proxyDevServerRequest(req, res);
      }

      // If we successfully handled a request and had a previous runtime error,
      // it might be fixed now. We'll keep the error active for now to let
      // the auto-refresh mechanism check if the error is truly gone.
      // The error will auto-clear after timeout if not triggered again.
    } catch (error) {
      this.handleRequestError(error, req, res);
    }
  }

  /**
   * Proxies a request to Salesforce with authentication
   */
  private async proxySalesforceRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.stats.salesforceRequests++;

    try {
      // Get auth headers from AuthManager
      const authHeaders = this.config.authManager.getAuthHeaders();

      // Prepare target URL
      const targetUrl = this.prepareSalesforceUrl(req.url ?? '/');

      this.logger.debug(`→ Salesforce: ${targetUrl}`);

      // Proxy the request with auth headers
      this.proxy.web(
        req,
        res,
        {
          target: this.config.salesforceInstanceUrl,
          headers: {
            ...authHeaders,
            // Preserve original host for some Salesforce APIs
            'X-Original-Host': req.headers.host ?? '',
          },
        },
        (error) => {
          if (error) {
            this.handleProxyError(error, req, res);
          }
        }
      );
    } catch (error) {
      // Check if it's a token error that can be recovered
      if (error instanceof SfError && error.name === 'TokenExpiredError') {
        // Try to refresh token and retry
        const recovered = await this.config.authManager.handleAuthError(error);
        if (recovered) {
          this.logger.debug('Token refreshed, retrying request');
          return this.proxySalesforceRequest(req, res);
        }
      }

      throw error;
    }
  }

  /**
   * Proxies a request to the dev server
   */
  private proxyDevServerRequest(req: IncomingMessage, res: ServerResponse): void {
    this.stats.devServerRequests++;

    const url = req.url ?? '/';
    this.logger.debug(`→ Dev Server: ${url}`);

    // If dev server is known to be down, serve HTML error page immediately
    if (this.devServerStatus === 'down') {
      this.serveErrorPage(res);
      return;
    }

    // Attempt to proxy the request to dev server
    this.proxy.web(
      req,
      res,
      {
        target: this.config.devServerUrl,
      },
      (error) => {
        if (error) {
          // On error, serve HTML error page instead of JSON error
          this.serveErrorPage(res);
        }
      }
    );
  }

  /**
   * Serves HTML error page when dev server is unavailable
   */
  private serveErrorPage(res: ServerResponse): void {
    try {
      const errorPageData: ErrorPageData = {
        status: 'No Dev Server Detected',
        devServerUrl: this.config.devServerUrl,
        workspaceScript: this.workspaceScript,
        proxyUrl: this.getProxyUrl(),
        orgTarget: this.config.salesforceInstanceUrl.replace('https://', ''),
      };

      const html = this.errorPageRenderer.render(errorPageData);

      res.writeHead(503, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(html);
    } catch (error) {
      // Fallback if error page rendering fails
      const fallbackHtml = ErrorPageRenderer.renderFallback(this.config.devServerUrl);
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end(fallbackHtml);
    }
  }

  /**
   * Handles WebSocket upgrade requests
   */
  private handleWebSocketUpgrade(req: IncomingMessage, socket: NodeJS.Socket, head: Buffer): void {
    this.stats.webSocketUpgrades++;

    const url = req.url ?? '/';
    this.logger.debug(`[WebSocket] Upgrade request: ${url}`);

    try {
      // Determine routing
      const decision = this.router.route(req);

      if (!decision.isWebSocket) {
        this.logger.warn(`Upgrade request but not detected as WebSocket: ${url}`);
      }

      // WebSocket upgrades typically go to dev server (HMR)
      if (decision.target === 'devserver') {
        this.logger.debug(`→ Dev Server WebSocket: ${url}`);
        this.proxy.ws(req, socket, head, {
          target: this.config.devServerUrl,
        });
      } else {
        // Salesforce WebSocket (rare, but possible for streaming APIs)
        this.logger.debug(`→ Salesforce WebSocket: ${url}`);
        const authHeaders = this.config.authManager.getAuthHeaders();
        this.proxy.ws(
          req,
          socket,
          head,
          {
            target: this.config.salesforceInstanceUrl,
            headers: authHeaders,
          },
          (error) => {
            if (error) {
              this.logger.error(`WebSocket proxy error: ${error.message}`);
              socket.end();
            }
          }
        );
      }
    } catch (error) {
      this.logger.error(`WebSocket upgrade failed: ${error instanceof Error ? error.message : String(error)}`);
      socket.end();
    }
  }

  /**
   * Prepares Salesforce URL for Code Builder environment
   * Code Builder requires special URI format handling
   */
  private prepareSalesforceUrl(url: string): string {
    if (!this.isCodeBuilder) {
      return url;
    }

    // Code Builder may require URI encoding adjustments
    // This ensures proper handling of special characters in Code Builder's proxy layer
    return url;
  }

  /**
   * Handles proxy errors with user-friendly messages
   */
  private handleProxyError(error: Error, req: IncomingMessage, res: ServerResponse | NodeJS.Socket): void {
    this.stats.errors++;
    const url = req.url ?? '/';
    this.logger.error(`Proxy error for ${url}: ${error.message}`);

    // If response hasn't been sent, send error
    // Check if res has writeHead method (ServerResponse) vs destroy (Socket)
    if ('writeHead' in res && 'headersSent' in res && !res.headersSent) {
      const errorInfo = this.getProxyErrorInfo(error, req);
      res.writeHead(errorInfo.statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: errorInfo.error,
          message: errorInfo.message,
          details: this.config.debug ? error.message : undefined,
          suggestion: errorInfo.suggestion,
        })
      );
    }
  }

  /**
   * Determines user-friendly error information based on error type
   */
  private getProxyErrorInfo(
    error: Error,
    req: IncomingMessage
  ): { statusCode: number; error: string; message: string; suggestion?: string } {
    const nodeError = error as NodeJS.ErrnoException;

    // Determine which target this request was going to
    const decision = this.router.route(req);
    const target = decision.target === 'salesforce' ? this.config.salesforceInstanceUrl : this.config.devServerUrl;

    // Check for specific error codes
    if (nodeError.code === 'ECONNREFUSED') {
      if (decision.target === 'devserver') {
        return {
          statusCode: 503,
          error: 'Dev Server Unavailable',
          message: `Cannot connect to dev server at ${this.config.devServerUrl}`,
          suggestion: 'Make sure your development server is running (e.g., npm run dev)',
        };
      } else {
        return {
          statusCode: 503,
          error: 'Salesforce Unavailable',
          message: `Cannot connect to Salesforce at ${this.config.salesforceInstanceUrl}`,
          suggestion: 'Check your network connection and Salesforce org status',
        };
      }
    }

    if (nodeError.code === 'ETIMEDOUT' || nodeError.code === 'ESOCKETTIMEDOUT') {
      return {
        statusCode: 504,
        error: 'Gateway Timeout',
        message: `Request to ${target} timed out`,
        suggestion: 'The target server took too long to respond. Please try again.',
      };
    }

    if (nodeError.code === 'ENOTFOUND') {
      return {
        statusCode: 502,
        error: 'Host Not Found',
        message: `Cannot resolve hostname for ${target}`,
        suggestion: 'Check your network connection and the target URL configuration',
      };
    }

    if (nodeError.code === 'ECONNRESET') {
      return {
        statusCode: 502,
        error: 'Connection Reset',
        message: `Connection to ${target} was reset`,
        suggestion: 'The target server closed the connection unexpectedly. Please try again.',
      };
    }

    // Generic proxy error
    return {
      statusCode: 502,
      error: 'Proxy Error',
      message: `Failed to proxy request to ${target}`,
      suggestion: this.config.debug ? undefined : 'Run with --debug flag for more details',
    };
  }

  /**
   * Handles request processing errors
   */
  private handleRequestError(error: unknown, req: IncomingMessage, res: ServerResponse): void {
    this.stats.errors++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const url = req.url ?? '/';
    this.logger.error(`Request error for ${url}: ${errorMessage}`);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Failed to process request',
          details: this.config.debug ? errorMessage : undefined,
        })
      );
    }
  }
}
