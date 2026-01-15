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

import type { OrgInfo } from '@salesforce/webapp-experimental/app';

/**
 * Get authentication headers for Salesforce requests
 * Constructs Bearer token header from OrgInfo
 *
 * Note: This function is NOT available in @salesforce/webapp-experimental package
 */
export function getAuthHeaders(orgInfo: OrgInfo): Record<string, string> {
  return {
    Authorization: `Bearer ${orgInfo.accessToken}`,
  };
}
