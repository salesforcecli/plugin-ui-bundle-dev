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

// This file is adapted from @salesforce/webapps package
// When the package is published to npm, replace with: import { createProxyHandler } from '@salesforce/webapps';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OrgInfo } from '../auth/org.js';
import { refreshOrgAuth } from '../auth/org.js';
import type { WebAppManifest } from '../config/manifest.js';
import { applyTrailingSlash, matchRoute } from './routing.js';

/**
 * Configuration options for the WebApp proxy handler
 */
export type ProxyOptions = {
  /** Enable verbose logging */
  debug?: boolean;
};

/**
 * Proxy handler function type
 */
export type ProxyHandler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>;

/**
 * Handles all proxy routing and forwarding for WebApps
 */
class WebAppProxyHandler {
  // 1. Instance fields
  private orgInfo?: OrgInfo;

  // 2. Constructor
  public constructor(
    private manifest: WebAppManifest,
    orgInfo?: OrgInfo,
    private target?: string,
    private basePath?: string,
    private options?: ProxyOptions
  ) {
    this.orgInfo = orgInfo;
  }

  // 3. Static methods (must come before instance methods)
  private static getBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  private static getFilteredHeaders(headers: IncomingMessage['headers']): Record<string, string> {
    const filtered: Record<string, string> = {};
    const hopByHopHeaders = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ]);

    for (const [key, value] of Object.entries(headers)) {
      if (!hopByHopHeaders.has(key.toLowerCase()) && value) {
        filtered[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    return filtered;
  }

  private static handleRedirect(res: ServerResponse, location: string, statusCode: number): void {
    res.writeHead(statusCode, { Location: location });
    res.end();
  }

  private static async sendResponse(res: ServerResponse, response: Response): Promise<void> {
    const headers: Record<string, string> = {};
    const skipHeaders = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

    response.headers.forEach((value, key) => {
      if (!skipHeaders.has(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    res.writeHead(response.status, headers);

    if (response.body) {
      const reader = response.body.getReader();
      // Use recursive function to avoid no-await-in-loop error
      const readChunks = async (): Promise<void> => {
        const result = await reader.read();
        if (result.done) return;
        if (result.value) {
          res.write(result.value);
        }
        return readChunks();
      };
      await readChunks();
    }

    res.end();
  }

  // 4. Public instance methods
  public async handle(req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = url.pathname;

    if (this.options?.debug) {
      // eslint-disable-next-line no-console
      console.log(`[webapps-proxy] ${req.method ?? 'GET'} ${pathname}`);
    }

    pathname = applyTrailingSlash(pathname, this.manifest.routing?.trailingSlash);

    const routeMatch = matchRoute(
      pathname,
      this.basePath,
      this.manifest.routing?.rewrites,
      this.manifest.routing?.redirects
    );

    if (routeMatch) {
      if (routeMatch.type === 'api') {
        await this.handleSalesforceApi(req, res);
        return;
      }

      if (routeMatch.type === 'redirect' && routeMatch.target && routeMatch.statusCode) {
        WebAppProxyHandler.handleRedirect(res, routeMatch.target, routeMatch.statusCode);
        return;
      }

      if (routeMatch.type === 'rewrite' && routeMatch.target) {
        const newPathname = `/${routeMatch.target}`.replace(/\/+/g, '/');
        const newUrl = newPathname + url.search;

        // Create a modified request object to pass the new URL
        Object.defineProperty(req, 'url', { value: newUrl, writable: true });

        if (this.options?.debug) {
          // eslint-disable-next-line no-console
          console.log(`[webapps-proxy] Rewrite to ${newUrl}`);
        }
      }
    }

    if (next) {
      next();
    } else {
      await this.forwardToDevServer(req, res);
    }
  }

  // 5. Private instance methods
  private async forwardToDevServer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Don't catch errors here - let them propagate to ProxyServer
    // so it can show the beautiful error page
    const url = new URL(req.url ?? '/', this.target ?? 'http://localhost');

    if (this.options?.debug) {
      // eslint-disable-next-line no-console
      console.log(`[webapps-proxy] Forwarding to dev server: ${url.href}`);
    }

    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await WebAppProxyHandler.getBody(req) : undefined;

    const response = await fetch(url.href, {
      method: req.method,
      headers: WebAppProxyHandler.getFilteredHeaders(req.headers),
      body,
    });

    await WebAppProxyHandler.sendResponse(res, response);
  }

  private async handleSalesforceApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!this.orgInfo) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'NO_ORG_FOUND',
            message: "No Salesforce org found. Run 'sf org login web --set-default' to authenticate.",
          })
        );
        return;
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const apiPath = url.pathname.substring(url.pathname.indexOf('/services'));
      let targetUrl = `${this.orgInfo.instanceUrl}${apiPath}${url.search}`;

      if (this.options?.debug) {
        // eslint-disable-next-line no-console
        console.log(`[webapps-proxy] Forwarding to Salesforce: ${targetUrl}`);
      }

      // Buffer the request body for retry capability
      const body = req.method !== 'GET' && req.method !== 'HEAD' ? await WebAppProxyHandler.getBody(req) : undefined;

      let response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...WebAppProxyHandler.getFilteredHeaders(req.headers),
          Cookie: `sid=${this.orgInfo.accessToken}`,
          Accept: req.headers.accept ?? 'application/json',
        },
        body,
      });

      // Handle token refresh on 401/403
      if (response.status === 401 || response.status === 403) {
        // eslint-disable-next-line no-console
        console.warn(`[webapps-proxy] Received ${String(response.status)}, refreshing token...`);

        if (this.orgInfo.orgAlias) {
          const updatedOrgInfo = await refreshOrgAuth(this.orgInfo.orgAlias);
          this.orgInfo = updatedOrgInfo;

          if (this.options?.debug) {
            // eslint-disable-next-line no-console
            console.log('[webapps-proxy] Token refreshed, retrying request');
          }

          targetUrl = `${this.orgInfo.instanceUrl}${url.pathname}${url.search}`;

          response = await fetch(targetUrl, {
            method: req.method,
            headers: {
              ...WebAppProxyHandler.getFilteredHeaders(req.headers),
              Cookie: `sid=${this.orgInfo.accessToken}`,
              Accept: req.headers.accept ?? 'application/json',
            },
            body,
          });
        }
      }

      await WebAppProxyHandler.sendResponse(res, response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[webapps-proxy] Salesforce API request failed:', error);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'GATEWAY_ERROR',
          message: 'Failed to forward request to Salesforce',
        })
      );
    }
  }
}

/**
 * Create proxy request handler
 *
 * @param manifest - WebApp manifest configuration
 * @param orgInfo - Salesforce org information
 * @param target - Target URL for dev server forwarding
 * @param basePath - Base path prefix for routing
 * @param options - Proxy configuration options
 * @returns Async request handler function for Node.js HTTP server
 */
export function createProxyHandler(
  manifest: WebAppManifest,
  orgInfo?: OrgInfo,
  target?: string,
  basePath?: string,
  options?: ProxyOptions
): ProxyHandler {
  const handler = new WebAppProxyHandler(manifest, orgInfo, target, basePath, options);
  return (req, res, next): Promise<void> => handler.handle(req, res, next);
}
