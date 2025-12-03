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

import { Connection, Logger, Org, SfError } from '@salesforce/core';
import { AuthHeaders } from '../config/types.js';

/**
 * Manages authentication for Salesforce API requests
 * Handles token retrieval, refresh, and header injection
 */
export class AuthManager {
  private org: Org | null = null;
  private connection: Connection | null = null;
  private logger: Logger | null = null;
  private targetOrg: string;

  public constructor(targetOrg: string) {
    this.targetOrg = targetOrg;
  }

  /**
   * Initialize the auth manager by loading the org
   */
  public async initialize(): Promise<void> {
    // Initialize logger
    this.logger = await Logger.child('AuthManager');

    try {
      this.org = await Org.create({ aliasOrUsername: this.targetOrg });
      this.connection = this.org.getConnection();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('No authorization information found')) {
          throw new SfError(
            `Org '${this.targetOrg}' not found. Check available orgs with 'sf org list'.`,
            'OrgNotFoundError'
          );
        }
        throw new SfError(
          `Failed to authenticate with org '${this.targetOrg}'. Run 'sf org login web --alias ${this.targetOrg}' to re-authenticate.`,
          'OrgAuthFailedError'
        );
      }
      throw error;
    }
  }

  /**
   * Get authentication headers for Salesforce requests
   */
  public getAuthHeaders(): AuthHeaders {
    if (!this.connection) {
      throw new SfError('AuthManager not initialized. Call initialize() first.');
    }

    try {
      // Check if token is expired and refresh if needed
      const accessToken = this.connection.accessToken;
      if (!accessToken) {
        throw new SfError(
          `Your org authentication has expired. Run 'sf org login web --alias ${this.targetOrg}' to re-authenticate.`,
          'TokenExpiredError'
        );
      }

      return {
        authorization: `Bearer ${accessToken}`,
      };
    } catch (error) {
      if (error instanceof SfError) {
        throw error;
      }
      throw new SfError(
        `Failed to authenticate with org '${this.targetOrg}'. Run 'sf org login web --alias ${this.targetOrg}' to re-authenticate.`,
        'OrgAuthFailedError'
      );
    }
  }

  /**
   * Get the Salesforce instance URL
   */
  public getInstanceUrl(): string {
    if (!this.connection) {
      throw new SfError('AuthManager not initialized. Call initialize() first.');
    }
    return this.connection.instanceUrl;
  }

  /**
   * Refresh the access token
   */
  public async refreshToken(): Promise<void> {
    if (!this.org) {
      throw new SfError('AuthManager not initialized. Call initialize() first.');
    }

    try {
      this.logger?.debug('Token expired, attempting refresh...');

      // Recreate the org connection to force a token refresh
      this.org = await Org.create({ aliasOrUsername: this.targetOrg });
      this.connection = this.org.getConnection();

      // Force a token refresh by making a lightweight request
      await this.connection.request('/services/data');

      this.logger?.debug('Token refresh successful');
    } catch (error) {
      if (error instanceof Error) {
        throw new SfError(
          `Failed to refresh access token. Run 'sf org login web --alias ${this.targetOrg}' to re-authenticate.`,
          'TokenRefreshFailedError'
        );
      }
      throw error;
    }
  }

  /**
   * Check if the current token is valid
   */
  public async isTokenValid(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }

    try {
      // Make a lightweight request to verify token validity
      await this.connection.request('/services/data');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the org username/alias
   */
  public getOrgAlias(): string {
    return this.targetOrg;
  }

  /**
   * Get the org username
   */
  public getUsername(): string | undefined {
    return this.org?.getUsername();
  }

  /**
   * Get the org ID
   */
  public getOrgId(): string | undefined {
    return this.org?.getOrgId();
  }

  /**
   * Handle authentication errors and attempt recovery
   */
  public async handleAuthError(error: Error): Promise<boolean> {
    // Check if this is an auth-related error
    const isAuthError =
      error.message.includes('authentication') ||
      error.message.includes('expired') ||
      error.message.includes('unauthorized') ||
      error.message.includes('401');

    if (!isAuthError) {
      return false;
    }

    try {
      // Attempt to refresh the token
      await this.refreshToken();
      return true;
    } catch (refreshError) {
      // Token refresh failed, user needs to re-authenticate
      return false;
    }
  }
}
