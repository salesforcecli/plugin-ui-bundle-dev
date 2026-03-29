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

// Re-export base types from @salesforce/ui-bundle package
export type {
  UIBundleManifest as BaseUiBundleManifest,
  RoutingConfig,
  RewriteRule,
  RedirectRule,
} from '@salesforce/ui-bundle/app';

// Import for local use
import type { UIBundleManifest as BaseUiBundleManifest } from '@salesforce/ui-bundle/app';

/**
 * Development configuration (plugin-specific extension)
 * NOT in @salesforce/ui-bundle package
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
 * UI bundle manifest configuration - defines the structure of ui-bundle.json file
 * Extended from @salesforce/ui-bundle with plugin-specific fields
 */
export type UiBundleManifest = BaseUiBundleManifest & {
  /** Development configuration (plugin-specific) */
  dev?: DevConfig;
};
