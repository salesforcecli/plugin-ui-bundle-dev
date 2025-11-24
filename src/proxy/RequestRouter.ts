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

import type { IncomingMessage } from 'node:http';
import { Logger } from '../utils/Logger.js';

/**
 * Route decision result
 */
export type RouteDecision = {
  /**
   * The target where the request should be routed
   */
  target: 'salesforce' | 'devserver';
  /**
   * The reason for this routing decision (for debugging)
   */
  reason: string;
  /**
   * Whether this is a WebSocket upgrade request
   */
  isWebSocket?: boolean;
};

/**
 * Configuration for request routing
 */
export type RouterConfig = {
  /**
   * Custom path patterns to route to Salesforce (in addition to defaults)
   */
  customSalesforcePaths?: string[];
  /**
   * Custom path patterns to route to dev server (overrides defaults)
   */
  customDevServerPaths?: string[];
  /**
   * Enable debug logging
   */
  debug?: boolean;
};

/**
 * RequestRouter analyzes incoming HTTP requests and determines whether they
 * should be routed to Salesforce or to the local development server.
 *
 * Salesforce requests include:
 * - REST API calls (/services/data)
 * - SOAP API calls (/services/Soap)
 * - Apex REST (/services/apexrest)
 * - Metadata API (/services/Metadata)
 * - Tooling API (within /services/data)
 * - Custom paths defined in webapp.json
 *
 * Dev server requests include:
 * - Static assets (JS, CSS, images, fonts)
 * - HTML pages
 * - HMR (Hot Module Replacement) endpoints
 * - WebSocket connections for live reload
 * - Source maps
 * - Any path not matching Salesforce patterns
 */
export class RequestRouter {
  private readonly logger: Logger;

  /**
   * Default Salesforce API path patterns
   * These paths will always be routed to Salesforce
   */
  private readonly salesforcePaths = [
    '/services/data',
    '/services/Soap',
    '/services/apexrest',
    '/services/async',
    '/services/oauth',
    '/services/Metadata',
    '/__sf__', // Internal Salesforce paths
  ];

  /**
   * Default dev server path patterns
   * These paths will always be routed to the dev server
   */
  private readonly devServerPaths = [
    '/__vite__', // Vite HMR
    '/@vite/', // Vite internal
    '/@react-refresh', // React Fast Refresh
    '/@fs/', // Vite filesystem access
    '/node_modules/', // Module imports
    '/__webpack_hmr', // Webpack HMR
    '/sockjs-node/', // Webpack dev server
    '.hot-update.', // Webpack HMR chunks (check before file extensions)
  ];

  /**
   * File extensions that should always go to dev server
   */
  private readonly devServerExtensions = [
    '.js',
    '.mjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.html',
    '.json',
    '.map', // Source maps
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.otf',
  ];

  public constructor(config: RouterConfig = {}) {
    this.logger = new Logger(config.debug ?? false);

    // Merge custom paths if provided
    if (config.customSalesforcePaths) {
      this.salesforcePaths.push(...config.customSalesforcePaths);
    }

    if (config.customDevServerPaths) {
      this.devServerPaths.unshift(...config.customDevServerPaths);
    }

    this.logger.debug('RequestRouter initialized with configuration:');
    this.logger.debug(`  Salesforce paths: ${this.salesforcePaths.length}`);
    this.logger.debug(`  Dev server paths: ${this.devServerPaths.length}`);
  }

  /**
   * Checks if a request is a WebSocket upgrade request
   *
   * @param req - The incoming HTTP request
   * @returns true if this is a WebSocket upgrade request
   */
  private static isWebSocketUpgrade(req: IncomingMessage): boolean {
    const upgradeHeader = req.headers.upgrade?.toLowerCase();
    const connectionHeader = req.headers.connection?.toLowerCase();

    return upgradeHeader === 'websocket' && connectionHeader?.includes('upgrade') === true;
  }

  /**
   * Determines where an incoming request should be routed
   *
   * @param req - The incoming HTTP request
   * @returns RouteDecision indicating target and reason
   */
  public route(req: IncomingMessage): RouteDecision {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    this.logger.debug(`Routing ${method} ${url}`);

    // Extract just the path without query string
    const path = url.split('?')[0];

    // Check for WebSocket upgrade requests
    const isWebSocketUpgrade = RequestRouter.isWebSocketUpgrade(req);
    if (isWebSocketUpgrade) {
      this.logger.debug('→ WebSocket upgrade detected');
    }

    // Check for dev server-specific paths first (HMR, WebSocket, etc.)
    for (const devPath of this.devServerPaths) {
      if (path.startsWith(devPath) || path.includes(devPath)) {
        const decision: RouteDecision = {
          target: 'devserver',
          reason: `matches dev server path pattern: ${devPath}`,
          ...(isWebSocketUpgrade && { isWebSocket: true }),
        };
        this.logger.debug(`→ ${decision.target}: ${decision.reason}`);
        return decision;
      }
    }

    // Check for Salesforce API paths
    for (const sfPath of this.salesforcePaths) {
      if (path.startsWith(sfPath)) {
        const decision: RouteDecision = {
          target: 'salesforce',
          reason: `matches Salesforce API path: ${sfPath}`,
          ...(isWebSocketUpgrade && { isWebSocket: true }),
        };
        this.logger.debug(`→ ${decision.target}: ${decision.reason}`);
        return decision;
      }
    }

    // Check file extensions
    for (const ext of this.devServerExtensions) {
      if (path.endsWith(ext)) {
        const decision: RouteDecision = {
          target: 'devserver',
          reason: `matches dev server file extension: ${ext}`,
          ...(isWebSocketUpgrade && { isWebSocket: true }),
        };
        this.logger.debug(`→ ${decision.target}: ${decision.reason}`);
        return decision;
      }
    }

    // Default: route to dev server (UI routes, index.html, etc.)
    const decision: RouteDecision = {
      target: 'devserver',
      reason: 'default route (no specific pattern matched)',
      ...(isWebSocketUpgrade && { isWebSocket: true }),
    };
    this.logger.debug(`→ ${decision.target}: ${decision.reason}`);
    return decision;
  }

  /**
   * Checks if a request should be routed to Salesforce
   *
   * @param req - The incoming HTTP request
   * @returns true if request should go to Salesforce
   */
  public isSalesforceRequest(req: IncomingMessage): boolean {
    return this.route(req).target === 'salesforce';
  }

  /**
   * Checks if a request should be routed to the dev server
   *
   * @param req - The incoming HTTP request
   * @returns true if request should go to dev server
   */
  public isDevServerRequest(req: IncomingMessage): boolean {
    return this.route(req).target === 'devserver';
  }

  /**
   * Gets the list of Salesforce path patterns
   *
   * @returns Array of Salesforce path patterns
   */
  public getSalesforcePaths(): string[] {
    return [...this.salesforcePaths];
  }

  /**
   * Gets the list of dev server path patterns
   *
   * @returns Array of dev server path patterns
   */
  public getDevServerPaths(): string[] {
    return [...this.devServerPaths];
  }

  /**
   * Adds a custom Salesforce path pattern at runtime
   *
   * @param path - The path pattern to add
   */
  public addSalesforcePath(path: string): void {
    if (!this.salesforcePaths.includes(path)) {
      this.salesforcePaths.push(path);
      this.logger.debug(`Added custom Salesforce path: ${path}`);
    }
  }

  /**
   * Adds a custom dev server path pattern at runtime
   *
   * @param path - The path pattern to add
   */
  public addDevServerPath(path: string): void {
    if (!this.devServerPaths.includes(path)) {
      this.devServerPaths.unshift(path); // Add to beginning for priority
      this.logger.debug(`Added custom dev server path: ${path}`);
    }
  }
}
