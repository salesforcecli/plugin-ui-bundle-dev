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

import { expect } from 'chai';
import { TestContext } from '@salesforce/core/testSetup';
import { Org, Connection, SfError } from '@salesforce/core';
import { AuthManager } from '../../src/auth/AuthManager.js';
import { Logger } from '../../src/utils/Logger.js';

describe('AuthManager', () => {
  const $$ = new TestContext();
  let logger: Logger;
  let mockOrg: Partial<Org>;
  let mockConnection: Partial<Connection>;

  beforeEach(() => {
    logger = new Logger(false);

    // Create mock connection
    mockConnection = {
      accessToken: 'test-access-token',
      instanceUrl: 'https://test.salesforce.com',
      request: $$.SANDBOX.stub().resolves({}),
    };

    // Create mock org
    mockOrg = {
      getConnection: $$.SANDBOX.stub().returns(mockConnection as Connection),
      getUsername: $$.SANDBOX.stub().returns('test@example.com'),
      getOrgId: $$.SANDBOX.stub().returns('00D000000000001'),
    };
  });

  afterEach(() => {
    $$.restore();
  });

  describe('initialize', () => {
    it('should successfully initialize with valid org', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      expect(authManager.getInstanceUrl()).to.equal('https://test.salesforce.com');
    });

    it('should throw OrgNotFoundError when org does not exist', async () => {
      $$.SANDBOX.stub(Org, 'create').rejects(new Error('No authorization information found'));

      const authManager = new AuthManager('nonexistent', logger);

      try {
        await authManager.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('OrgNotFoundError');
        expect((error as SfError).message).to.include('nonexistent');
        expect((error as SfError).message).to.include('sf org list');
      }
    });

    it('should throw OrgAuthFailedError on other auth errors', async () => {
      $$.SANDBOX.stub(Org, 'create').rejects(new Error('Authentication failed'));

      const authManager = new AuthManager('testorg', logger);

      try {
        await authManager.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('OrgAuthFailedError');
        expect((error as SfError).message).to.include('testorg');
      }
    });
  });

  describe('getAuthHeaders', () => {
    it('should return authorization headers with bearer token', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const headers = authManager.getAuthHeaders();

      expect(headers).to.deep.equal({
        authorization: 'Bearer test-access-token',
      });
    });

    it('should throw error if not initialized', () => {
      const authManager = new AuthManager('testorg', logger);

      try {
        authManager.getAuthHeaders();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).message).to.include('not initialized');
      }
    });

    it('should throw TokenExpiredError if access token is missing', async () => {
      const mockConnWithoutToken = {
        ...mockConnection,
        accessToken: undefined,
      };
      const mockOrgWithoutToken = {
        ...mockOrg,
        getConnection: $$.SANDBOX.stub().returns(mockConnWithoutToken as unknown as Connection),
      };

      $$.SANDBOX.stub(Org, 'create').resolves(mockOrgWithoutToken as unknown as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      try {
        authManager.getAuthHeaders();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('TokenExpiredError');
        expect((error as SfError).message).to.include('expired');
      }
    });
  });

  describe('getInstanceUrl', () => {
    it('should return the Salesforce instance URL', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const instanceUrl = authManager.getInstanceUrl();

      expect(instanceUrl).to.equal('https://test.salesforce.com');
    });

    it('should throw error if not initialized', () => {
      const authManager = new AuthManager('testorg', logger);

      try {
        authManager.getInstanceUrl();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).message).to.include('not initialized');
      }
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const orgCreateStub = $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      await authManager.refreshToken();

      // Should have called Org.create twice (once for init, once for refresh)
      expect(orgCreateStub.callCount).to.equal(2);
    });

    it('should throw TokenRefreshFailedError on failure', async () => {
      const orgCreateStub = $$.SANDBOX.stub(Org, 'create');
      orgCreateStub.onFirstCall().resolves(mockOrg as Org);
      orgCreateStub.onSecondCall().rejects(new Error('Refresh failed'));

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      try {
        await authManager.refreshToken();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(SfError);
        expect((error as SfError).name).to.equal('TokenRefreshFailedError');
      }
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const isValid = await authManager.isTokenValid();

      expect(isValid).to.be.true;
    });

    it('should return false for invalid token', async () => {
      const mockConnWithError = {
        ...mockConnection,
        request: $$.SANDBOX.stub().rejects(new Error('Unauthorized')),
      };
      const mockOrgWithError = {
        ...mockOrg,
        getConnection: $$.SANDBOX.stub().returns(mockConnWithError as unknown as Connection),
      };

      $$.SANDBOX.stub(Org, 'create').resolves(mockOrgWithError as unknown as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const isValid = await authManager.isTokenValid();

      expect(isValid).to.be.false;
    });

    it('should return false if not initialized', async () => {
      const authManager = new AuthManager('testorg', logger);

      const isValid = await authManager.isTokenValid();

      expect(isValid).to.be.false;
    });
  });

  describe('getOrgAlias', () => {
    it('should return the target org alias', () => {
      const authManager = new AuthManager('testorg', logger);

      expect(authManager.getOrgAlias()).to.equal('testorg');
    });
  });

  describe('getUsername', () => {
    it('should return the org username', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      expect(authManager.getUsername()).to.equal('test@example.com');
    });

    it('should return undefined if not initialized', () => {
      const authManager = new AuthManager('testorg', logger);

      expect(authManager.getUsername()).to.be.undefined;
    });
  });

  describe('getOrgId', () => {
    it('should return the org ID', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      expect(authManager.getOrgId()).to.equal('00D000000000001');
    });

    it('should return undefined if not initialized', () => {
      const authManager = new AuthManager('testorg', logger);

      expect(authManager.getOrgId()).to.be.undefined;
    });
  });

  describe('handleAuthError', () => {
    it('should attempt token refresh on auth error', async () => {
      $$.SANDBOX.stub(Org, 'create').resolves(mockOrg as Org);

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const authError = new Error('401 Unauthorized');
      const recovered = await authManager.handleAuthError(authError);

      expect(recovered).to.be.true;
    });

    it('should return false for non-auth errors', async () => {
      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const networkError = new Error('Network timeout');
      const recovered = await authManager.handleAuthError(networkError);

      expect(recovered).to.be.false;
    });

    it('should return false if token refresh fails', async () => {
      const orgCreateStub = $$.SANDBOX.stub(Org, 'create');
      orgCreateStub.onFirstCall().resolves(mockOrg as Org);
      orgCreateStub.onSecondCall().rejects(new Error('Refresh failed'));

      const authManager = new AuthManager('testorg', logger);
      await authManager.initialize();

      const authError = new Error('Token expired');
      const recovered = await authManager.handleAuthError(authError);

      expect(recovered).to.be.false;
    });
  });
});
