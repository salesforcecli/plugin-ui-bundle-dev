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

import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import httpProxy from 'http-proxy';
import { Logger, SfError } from '@salesforce/core';
import type { OrgInfo } from '@salesforce/webapp-experimental/app';
import { getOrgInfo } from '@salesforce/webapp-experimental/app';
import type { ProxyHandler } from '@salesforce/webapp-experimental/proxy';
import { createProxyHandler } from '@salesforce/webapp-experimental/proxy';
import type { WebAppManifest } from '../config/manifest.js';
import type { DevServerError } from '../config/types.js';
import type { ErrorPageData } from '../templates/ErrorPageRenderer.js';
import { ErrorPageRenderer } from '../templates/ErrorPageRenderer.js';

/**
 * Configuration for the proxy server
 */
export type ProxyServerConfig = {
  port: number;
  devServerUrl: string;
  salesforceInstanceUrl: string;
  manifest?: WebAppManifest;
  orgAlias?: string;
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
 */
export class ProxyServer extends EventEmitter {
  // Instance fields
  private config: ProxyServerConfig;
  private readonly logger: Logger;
  private readonly wsProxy: httpProxy;
  private readonly errorPageRenderer: ErrorPageRenderer;
  private server: Server | null = null;
  private readonly stats: ProxyStats;
  private isCodeBuilder = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private devServerStatus: 'unknown' | 'up' | 'down' | 'error' = 'unknown';
  private readonly workspaceScript: string;
  private activeDevServerError: DevServerError | null = null;
  private errorClearTimeout: NodeJS.Timeout | null = null;
  private readonly activeConnections: Set<import('net').Socket> = new Set();
  private proxyHandler: ProxyHandler | null = null;
  private orgInfo: OrgInfo | undefined;

  // Constructor
  public constructor(config: ProxyServerConfig) {
    super();
    this.config = config;
    this.logger = Logger.childFromRoot('ProxyServer');
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

    this.isCodeBuilder = ProxyServer.detectCodeBuilder();

    this.wsProxy = httpProxy.createProxyServer({
      changeOrigin: true,
      ws: true,
      xfwd: true,
    });

    this.wsProxy.on('error', (err, req, res) => {
      this.handleProxyError(err, req, res);
    });
  }

  // Private static methods
  private static detectCodeBuilder(): boolean {
    const codeBuilderIndicators = ['SBQQ_STUDIO_WORKSPACE', 'SALESFORCE_PROJECT_ID', 'CODE_BUILDER_SESSION'];
    return codeBuilderIndicators.some((indicator) => process.env[indicator] !== undefined);
  }

  private static detectWorkspaceScript(): string {
    try {
      const packageJsonPath = join(process.cwd(), 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as { scripts?: Record<string, string> };

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

  // Public instance methods
  public clearActiveDevServerError(): void {
    if (this.activeDevServerError) {
      this.logger.debug('Dev server error cleared - dev server recovered');
      this.activeDevServerError = null;
    }
  }

  public getDevServerStatus(): string {
    return this.devServerStatus;
  }

  public getProxyUrl(): string {
    const host = this.getBindHost();
    const displayHost = host === '0.0.0.0' || host === '127.0.0.1' ? 'localhost' : host;
    return `http://${displayHost}:${this.config.port}`;
  }

  public getStats(): ProxyStats {
    return { ...this.stats };
  }

  public hasActiveDevServerError(): boolean {
    return this.activeDevServerError !== null;
  }

  public isCodeBuilderEnvironment(): boolean {
    return this.isCodeBuilder;
  }

  public isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  public setActiveDevServerError(error: DevServerError): void {
    this.activeDevServerError = error;
    this.devServerStatus = 'error';
    this.logger.debug(`Dev server error is now active: ${error.title}`);
  }

  public setupGracefulShutdown(onShutdown?: () => void | Promise<void>): () => void {
    const handleShutdown = async (signal: string): Promise<void> => {
      this.logger.debug(`Received ${signal}, shutting down gracefully...`);

      if (onShutdown) {
        try {
          await onShutdown();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(`Shutdown callback error: ${errorMessage}`);
        }
      }

      await this.stop();
    };

    const sigintHandler = (): void => {
      handleShutdown('SIGINT').catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`SIGINT handler error: ${errorMessage}`);
        process.exit(1);
      });
    };

    const sigtermHandler = (): void => {
      handleShutdown('SIGTERM').catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`SIGTERM handler error: ${errorMessage}`);
        process.exit(1);
      });
    };

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    return () => {
      process.off('SIGINT', sigintHandler);
      process.off('SIGTERM', sigtermHandler);
    };
  }

  public async start(): Promise<void> {
    if (this.isCodeBuilder) {
      this.logger.debug('Code Builder environment detected');
    }

    if (this.server) {
      throw new SfError('Proxy server is already running', 'ProxyAlreadyRunning');
    }

    // Get org info for auth
    if (this.config.orgAlias) {
      try {
        this.orgInfo = await getOrgInfo(this.config.orgAlias);
        if (this.orgInfo) {
          this.logger.debug(`Org info loaded for: ${this.orgInfo.username}`);
        } else {
          this.logger.warn(`Failed to get org info for: ${this.config.orgAlias}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to get org info: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.initializeProxyHandler();

    return new Promise((resolve, reject) => {
      try {
        this.server = createServer((req, res) => {
          this.handleRequest(req, res).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Request handling error: ${errorMessage}`);
            this.stats.errors++;
          });
        });

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

        const host = this.getBindHost();

        this.server.on('connection', (socket) => {
          this.activeConnections.add(socket);
          socket.once('close', () => {
            this.activeConnections.delete(socket);
          });
        });

        this.server.listen(this.config.port, host, () => {
          this.logger.debug(`Proxy server listening on http://${host}:${this.config.port}`);
          this.logger.debug(`Forwarding to dev server: ${this.config.devServerUrl}`);
          this.logger.debug(`Forwarding to Salesforce: ${this.config.salesforceInstanceUrl}`);
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

  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.errorClearTimeout) {
      clearTimeout(this.errorClearTimeout);
      this.errorClearTimeout = null;
    }

    for (const socket of this.activeConnections) {
      socket.destroy();
    }
    this.activeConnections.clear();

    return new Promise((resolve, reject) => {
      const forceCloseTimeout = setTimeout(() => {
        this.logger.debug('Proxy server stop timeout, forcing shutdown');
        this.server = null;
        resolve();
      }, 2000);

      this.server!.close((error) => {
        clearTimeout(forceCloseTimeout);
        if (error) {
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

      this.wsProxy.close();
    });
  }

  public updateDevServerUrl(newDevServerUrl: string): void {
    if (this.config.devServerUrl === newDevServerUrl) {
      this.logger.debug(`Dev server URL unchanged: ${newDevServerUrl}`);
      return;
    }

    this.logger.info(`Updating dev server URL: ${this.config.devServerUrl} → ${newDevServerUrl}`);
    this.config.devServerUrl = newDevServerUrl;

    this.initializeProxyHandler();

    this.devServerStatus = 'unknown';

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.startHealthCheck();
    }

    this.checkDevServerHealth().catch((error) => {
      this.logger.error(`Failed to check dev server health: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  public updateManifest(manifest: WebAppManifest): void {
    this.config.manifest = manifest;
    this.initializeProxyHandler();
    this.logger.debug('Proxy handler reinitialized with updated manifest');
  }

  // Private instance methods
  private async checkDevServerHealth(): Promise<void> {
    try {
      await fetch(this.config.devServerUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });

      if (this.devServerStatus !== 'up') {
        this.devServerStatus = 'up';
        this.emit('dev-server-up', this.config.devServerUrl);
        this.logger.debug(`Dev server is UP: ${this.config.devServerUrl}`);
        this.clearActiveDevServerError();
      }
    } catch {
      if (this.devServerStatus !== 'down') {
        this.devServerStatus = 'down';
        this.emit('dev-server-down', this.config.devServerUrl);
        this.logger.debug(`Dev server is DOWN: ${this.config.devServerUrl}`);
      }
    }
  }

  private getBindHost(): string {
    if (this.config.host) {
      return this.config.host;
    }

    if (this.isCodeBuilder) {
      this.logger.debug('Code Builder: Binding to 0.0.0.0 (all interfaces)');
      return '0.0.0.0';
    }

    return '127.0.0.1';
  }

  private handleProxyError(error: Error, req: IncomingMessage, res: ServerResponse | NodeJS.Socket): void {
    this.stats.errors++;
    const url = req.url ?? '/';
    this.logger.error(`Proxy error for ${url}: ${error.message}`);

    if ('writeHead' in res && 'headersSent' in res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Proxy Error',
          message: error.message,
        })
      );
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.stats.requestCount++;

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    this.logger.debug(`[${method}] ${url}`);

    if (this.activeDevServerError) {
      this.logger.debug('Active dev server error - serving error page');
      this.serveDevServerErrorPage(this.activeDevServerError, res);
      return;
    }

    if (this.devServerStatus === 'down' && !url.includes('/services')) {
      this.serveErrorPage(res);
      return;
    }

    if (this.proxyHandler) {
      if (url.includes('/services')) {
        this.stats.salesforceRequests++;
      } else {
        this.stats.devServerRequests++;
      }

      // Package handles all errors internally and returns proper HTTP responses
      await this.proxyHandler(req, res);
    } else {
      this.logger.error('Proxy handler not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy not initialized' }));
    }
  }

  private handleWebSocketUpgrade(req: IncomingMessage, socket: NodeJS.Socket, head: Buffer): void {
    this.stats.webSocketUpgrades++;

    const url = req.url ?? '/';
    this.logger.debug(`[WebSocket] Upgrade request: ${url}`);

    try {
      const isSalesforceWs = url.includes('/cometd') || url.includes('/bayeux');

      if (isSalesforceWs && this.orgInfo) {
        this.logger.debug(`→ Salesforce WebSocket: ${url}`);
        this.wsProxy.ws(
          req,
          socket,
          head,
          {
            target: this.config.salesforceInstanceUrl,
            headers: { Authorization: `Bearer ${this.orgInfo.accessToken}` },
          },
          (error) => {
            if (error) {
              this.logger.error(`WebSocket proxy error: ${error.message}`);
              socket.end();
            }
          }
        );
      } else {
        this.logger.debug(`→ Dev Server WebSocket: ${url}`);
        this.wsProxy.ws(req, socket, head, {
          target: this.config.devServerUrl,
        });
      }
    } catch (error) {
      this.logger.error(`WebSocket upgrade failed: ${error instanceof Error ? error.message : String(error)}`);
      socket.end();
    }
  }

  private initializeProxyHandler(): void {
    const manifest: WebAppManifest = this.config.manifest ?? {
      name: 'webapp',
      label: 'WebApp',
      version: '1.0.0',
      outputDir: 'dist',
    };

    this.proxyHandler = createProxyHandler(manifest, this.orgInfo, this.config.devServerUrl, undefined, {
      debug: process.env.SF_LOG_LEVEL === 'debug',
    });
  }

  private serveDevServerErrorPage(error: DevServerError, res: ServerResponse): void {
    try {
      const html = this.errorPageRenderer.renderDevServerError(error);

      res.writeHead(500, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });

      res.end(html);
      this.logger.debug('Served dev server error page to browser');
    } catch (err) {
      this.logger.error(`Failed to render dev server error page: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Dev Server Error: ${error.title}\n\n${error.message}\n\nCheck terminal for details.`);
    }
  }

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`CRITICAL: Failed to render dev server error page: ${errorMessage}`);

      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end(
        `Dev Server Unavailable\n\nCannot connect to: ${this.config.devServerUrl}\n\nStart your dev server and refresh this page.`
      );
    }
  }

  private startHealthCheck(): void {
    this.checkDevServerHealth().catch((error) => {
      this.logger.debug(`Initial health check error: ${String(error)}`);
    });

    this.healthCheckInterval = setInterval(() => {
      this.checkDevServerHealth().catch((error) => {
        this.logger.debug(`Health check error: ${String(error)}`);
      });
    }, 10_000);
  }
}
