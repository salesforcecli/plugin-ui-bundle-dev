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
// When the package is published to npm, replace with: import { matchRoute, applyTrailingSlash } from '@salesforce/webapps';

import micromatch from 'micromatch';
import { match } from 'path-to-regexp';
import type { RedirectRule, RewriteRule } from '../config/manifest.js';

export type RouteMatch = {
  type: 'rewrite' | 'redirect' | 'api';
  target?: string;
  statusCode?: number;
  params?: Record<string, string>;
};

function normalizeRoute(route: string): string {
  let wildcardIndex = 0;
  return route.replace(/\*/g, () => `{*wildcard${wildcardIndex++}}`);
}

/**
 * Match URL path against routing rules
 *
 * @param pathname - The URL pathname to match
 * @param basePath - Optional base path prefix
 * @param rewrites - Optional array of rewrite rules
 * @param redirects - Optional array of redirect rules
 * @returns Route match result indicating the type and target, or null if no match
 */
export function matchRoute(
  pathname: string,
  basePath?: string,
  rewrites?: RewriteRule[],
  redirects?: RedirectRule[]
): RouteMatch | null {
  // Check for Salesforce API paths
  if (pathname.startsWith(`${basePath ?? ''}/services`)) {
    return { type: 'api' };
  }

  // Check redirects first (they take precedence)
  if (redirects) {
    for (const redirect of redirects) {
      const normalizedRoute = normalizeRoute(redirect.route);
      const matcher = match(normalizedRoute, { decode: decodeURIComponent });
      const result = matcher(pathname);

      if (result) {
        let target = redirect.target;

        const params = result.params as Record<string, string>;
        for (const [key, value] of Object.entries(params)) {
          if (!key.startsWith('wildcard')) {
            target = target.replace(`:${key}`, value);
          }
        }

        return {
          type: 'redirect',
          target,
          statusCode: redirect.statusCode,
        };
      }
    }
  }

  // Check rewrites
  if (rewrites) {
    for (const rewrite of rewrites) {
      const normalizedRoute = normalizeRoute(rewrite.route);
      const matcher = match(normalizedRoute, { decode: decodeURIComponent });
      const result = matcher(pathname);

      if (result) {
        const params: Record<string, string> = {};

        const matchParams = result.params as Record<string, string>;
        for (const [key, value] of Object.entries(matchParams)) {
          if (!key.startsWith('wildcard')) {
            params[key] = value;
          }
        }

        return {
          type: 'rewrite',
          target: rewrite.target,
          params,
        };
      }
    }
  }

  return null;
}

/**
 * Check if a path matches any of the given glob patterns
 *
 * @param path - The path to test
 * @param patterns - Array of glob patterns to match against
 * @returns True if the path matches any pattern
 */
export function matchesPattern(path: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return micromatch.isMatch(path, patterns);
}

/**
 * Apply trailing slash rules to pathname
 *
 * @param pathname - The URL pathname
 * @param trailingSlash - Trailing slash handling strategy
 * @returns Modified pathname with trailing slash applied according to rules
 */
export function applyTrailingSlash(pathname: string, trailingSlash?: 'always' | 'never' | 'auto'): string {
  if (!trailingSlash || trailingSlash === 'auto') {
    return pathname;
  }

  const hasTrailingSlash = pathname.endsWith('/');
  const isRoot = pathname === '/';

  if (trailingSlash === 'always' && !hasTrailingSlash && !isRoot) {
    return `${pathname}/`;
  }

  if (trailingSlash === 'never' && hasTrailingSlash && !isRoot) {
    return pathname.slice(0, -1);
  }

  return pathname;
}
