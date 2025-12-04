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
// When the package is published to npm, replace with: import { getOrgInfo, refreshOrgAuth } from '@salesforce/webapps';

import { Org, SfError } from '@salesforce/core';

export type OrgInfo = {
  orgId: string;
  apiVersion: string;
  instanceUrl: string;
  username: string;
  accessToken: string;
  orgAlias?: string;
};

/**
 * Get authentication headers for Salesforce requests
 * Constructs Bearer token header from OrgInfo
 */
export function getAuthHeaders(orgInfo: OrgInfo): Record<string, string> {
  return {
    Authorization: `Bearer ${orgInfo.accessToken}`,
  };
}

/**
 * Get Salesforce org info and authentication details
 *
 * @param orgAlias - Optional org alias or username, uses default org if not provided
 * @returns Promise resolving to org info
 * @throws SfError if org not found or authentication fails
 */
export async function getOrgInfo(orgAlias?: string): Promise<OrgInfo> {
  const org = await createOrg(orgAlias);

  const connection = org.getConnection();
  const authInfo = connection.getAuthInfo();
  const authFields = authInfo.getFields();

  const accessToken = connection.accessToken;
  if (!accessToken) {
    throw new SfError(
      `Your org authentication has expired. Run 'sf org login web${
        orgAlias ? ` --alias ${orgAlias}` : ''
      }' to re-authenticate.`,
      'TokenExpiredError'
    );
  }

  return {
    apiVersion: connection.getApiVersion(),
    orgId: authFields.orgId ?? '',
    instanceUrl: toLightningDomain(connection.instanceUrl),
    username: authFields.username ?? '',
    accessToken,
    orgAlias,
  };
}

/**
 * Create Org instance with error handling
 */
async function createOrg(orgAlias?: string): Promise<Org> {
  try {
    if (!orgAlias) {
      return await Org.create({});
    }
    return await Org.create({ aliasOrUsername: orgAlias });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('No authorization information found') || error.message.includes('No AuthInfo found')) {
        throw new SfError(
          `Org '${orgAlias ?? 'default'}' not found. Check available orgs with 'sf org list'.`,
          'OrgNotFoundError'
        );
      }
    }
    throw new SfError(
      `Failed to authenticate with org '${orgAlias ?? 'default'}'. Run 'sf org login web${
        orgAlias ? ` --alias ${orgAlias}` : ''
      }' to re-authenticate.`,
      'OrgAuthFailedError'
    );
  }
}

/**
 * Refresh Salesforce org authentication
 *
 * @param orgAlias - Org alias to refresh
 * @returns Promise resolving to refreshed org info
 */
export async function refreshOrgAuth(orgAlias: string): Promise<OrgInfo> {
  const org = await Org.create({ aliasOrUsername: orgAlias });
  await org.refreshAuth();
  return getOrgInfo(orgAlias);
}

/**
 * Convert instance URL to Lightning domain format
 */
function toLightningDomain(instanceUrl: string): string {
  if (!instanceUrl.includes('.my.')) {
    return instanceUrl;
  }

  let url = replaceLast(instanceUrl, '.my.', '.lightning.');
  url = replaceLast(url, '.salesforce', '.force');
  return url;
}

function replaceLast(originalString: string, searchString: string, replacementString: string): string {
  const lastIndex = originalString.lastIndexOf(searchString);
  if (lastIndex === -1) {
    return originalString;
  }

  const before = originalString.slice(0, lastIndex);
  const after = originalString.slice(lastIndex + searchString.length);
  return before + replacementString + after;
}
