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

// Re-export base types from @salesforce/webapp-experimental package
export type {
  WebAppManifest as BaseWebAppManifest,
  RoutingConfig,
  RewriteRule,
  RedirectRule,
} from '@salesforce/webapp-experimental/app';

// Import for local use
import type { WebAppManifest as BaseWebAppManifest } from '@salesforce/webapp-experimental/app';

/**
 * Development configuration (plugin-specific extension)
 * NOT in @salesforce/webapp-experimental package
 */
export type DevConfig = {
  /** Command to run the dev server (e.g., "npm run dev") */
  command?: string;
  /** Explicit URL for the dev server */
  url?: string;
  /** Proxy port (default 4545 when not specified) */
  port?: number;
};

/**
 * WebApp manifest configuration - defines the structure of webapplication.json file
 * Extended from @salesforce/webapp-experimental with plugin-specific fields
 */
export type WebAppManifest = BaseWebAppManifest & {
  /** Development configuration (plugin-specific) */
  dev?: DevConfig;
};
