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

import { expect } from 'chai';
import { SfError } from '@salesforce/core';
import { ErrorHandler, WebAppErrorCode } from '../../src/error/ErrorHandler.js';

describe('ErrorHandler', () => {
  describe('Authentication Errors', () => {
    it('should create token expired error with suggestions', () => {
      const error = ErrorHandler.createTokenExpiredError('myorg');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.TOKEN_EXPIRED);
      expect(error.message).to.include('expired');
      expect(error.message).to.include('myorg');
      expect(error.actions).to.have.lengthOf(3);
      expect(error.actions?.[0]).to.include('sf org login web');
    });

    it('should create org not found error with suggestions', () => {
      const error = ErrorHandler.createOrgNotFoundError('testorg');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.ORG_NOT_FOUND);
      expect(error.message).to.include('testorg');
      expect(error.message).to.include('not found');
      expect(error.actions).to.have.lengthOf(3);
      expect(error.actions?.[0]).to.include('sf org list');
    });

    it('should create auth failed error without details', () => {
      const error = ErrorHandler.createAuthFailedError('myorg');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.AUTH_FAILED);
      expect(error.message).to.include('Authentication failed');
      expect(error.message).to.include('myorg');
      expect(error.actions).to.have.lengthOf(3);
    });

    it('should create auth failed error with details', () => {
      const error = ErrorHandler.createAuthFailedError('myorg', 'Invalid credentials');

      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('Invalid credentials');
    });

    it('should create token refresh failed error', () => {
      const error = ErrorHandler.createTokenRefreshFailedError('myorg');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.TOKEN_REFRESH_FAILED);
      expect(error.message).to.include('refresh');
      expect(error.message).to.include('myorg');
      expect(error.actions?.[0]).to.include('Re-authenticate');
    });
  });

  describe('Manifest Errors', () => {
    it('should create manifest not found error', () => {
      const error = ErrorHandler.createManifestNotFoundError();

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.MANIFEST_NOT_FOUND);
      expect(error.message).to.include('webapp.json');
      expect(error.message).to.include('not found');
      expect(error.actions?.[0]).to.include('Create a webapp.json');
    });

    it('should create manifest validation error with multiple issues', () => {
      const validationErrors = ['name is required', 'version must be semantic', 'outputDir is missing'];

      const error = ErrorHandler.createManifestValidationError(validationErrors);

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.MANIFEST_INVALID);
      expect(error.message).to.include('validation failed');
      expect(error.message).to.include('name is required');
      expect(error.message).to.include('version must be semantic');
      expect(error.message).to.include('outputDir is missing');
    });

    it('should create manifest parse error', () => {
      const error = ErrorHandler.createManifestParseError('Unexpected token } in JSON at position 123');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.MANIFEST_PARSE_ERROR);
      expect(error.message).to.include('Failed to parse');
      expect(error.message).to.include('Unexpected token');
      expect(error.actions?.[0]).to.include('JSON syntax errors');
    });
  });

  describe('Dev Server Errors', () => {
    it('should create dev server start failed error without error message', () => {
      const error = ErrorHandler.createDevServerStartFailedError('npm run dev');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.DEV_SERVER_START_FAILED);
      expect(error.message).to.include('failed to start');
      expect(error.message).to.include('npm run dev');
      expect(error.actions?.[1]).to.include('npm install');
    });

    it('should create dev server start failed error with error message', () => {
      const error = ErrorHandler.createDevServerStartFailedError('npm run dev', 'ENOENT: command not found');

      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('ENOENT');
    });

    it('should create dev server timeout error', () => {
      const error = ErrorHandler.createDevServerTimeoutError(30);

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.DEV_SERVER_TIMEOUT);
      expect(error.message).to.include('30 seconds');
      expect(error.message).to.include('did not start');
    });

    it('should create dev server crashed error with exit code', () => {
      const error = ErrorHandler.createDevServerCrashedError(1, null);

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.DEV_SERVER_CRASHED);
      expect(error.message).to.include('crashed');
      expect(error.message).to.include('exit code 1');
    });

    it('should create dev server crashed error with signal', () => {
      const error = ErrorHandler.createDevServerCrashedError(null, 'SIGKILL');

      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('signal SIGKILL');
    });

    it('should create dev server command required error', () => {
      const error = ErrorHandler.createDevServerCommandRequiredError();

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.DEV_SERVER_COMMAND_REQUIRED);
      expect(error.message).to.include('command or URL is required');
      expect(error.actions?.[0]).to.include('dev.command');
    });
  });

  describe('Proxy Errors', () => {
    it('should create port in use error with alternative suggestion', () => {
      const error = ErrorHandler.createPortInUseError(4545);

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.PORT_IN_USE);
      expect(error.message).to.include('4545');
      expect(error.message).to.include('already in use');
      expect(error.actions?.[0]).to.include('4546');
    });

    it('should create proxy start failed error', () => {
      const error = ErrorHandler.createProxyStartFailedError('EACCES: permission denied');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.PROXY_START_FAILED);
      expect(error.message).to.include('Failed to start proxy');
      expect(error.message).to.include('EACCES');
    });

    it('should create target unreachable error for Salesforce', () => {
      const error = ErrorHandler.createTargetUnreachableError('https://myorg.salesforce.com', 'Connection timeout');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.TARGET_UNREACHABLE);
      expect(error.message).to.include('Cannot reach');
      expect(error.message).to.include('salesforce.com');
      expect(error.message).to.include('Connection timeout');
      expect(error.actions?.[0]).to.include('internet connection');
    });

    it('should create target unreachable error for dev server', () => {
      const error = ErrorHandler.createTargetUnreachableError('http://localhost:5173');

      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('localhost:5173');
      expect(error.actions?.[0]).to.include('dev server is running');
    });
  });

  describe('Network Errors', () => {
    it('should create generic network error', () => {
      const error = ErrorHandler.createNetworkError('API call');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.NETWORK_ERROR);
      expect(error.message).to.include('Network error');
      expect(error.message).to.include('API call');
      expect(error.actions?.[0]).to.include('internet connection');
    });

    it('should create network error with message', () => {
      const error = ErrorHandler.createNetworkError('fetching data', 'DNS resolution failed');

      expect(error).to.be.instanceOf(SfError);
      expect(error.message).to.include('DNS resolution failed');
    });

    it('should create connection refused error', () => {
      const error = ErrorHandler.createConnectionRefusedError('http://localhost:3000');

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.CONNECTION_REFUSED);
      expect(error.message).to.include('Connection refused');
      expect(error.message).to.include('localhost:3000');
    });

    it('should create timeout error', () => {
      const error = ErrorHandler.createTimeoutError('HTTP request', 60);

      expect(error).to.be.instanceOf(SfError);
      expect(error.name).to.equal(WebAppErrorCode.TIMEOUT_ERROR);
      expect(error.message).to.include('timed out');
      expect(error.message).to.include('60 seconds');
    });
  });

  describe('Security & Sanitization', () => {
    it('should sanitize Bearer tokens from error messages', () => {
      const message = 'Request failed with Authorization: Bearer abc123xyz456.def789ghi012_jkl345-mno678';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('abc123xyz456');
      expect(sanitized).to.include('Bearer [REDACTED]');
    });

    it('should sanitize access tokens from error messages', () => {
      const message = 'Error: access_token=00D5g000001ABC!ARsomeTokenHere123';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('00D5g000001ABC!ARsomeTokenHere123');
      expect(sanitized).to.include('access_token=[REDACTED]');
    });

    it('should sanitize session IDs from error messages', () => {
      const message = 'Session error: sid=00D5g000001sessionId123';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('00D5g000001sessionId123');
      expect(sanitized).to.include('sid=[REDACTED]');
    });

    it('should sanitize passwords from error messages', () => {
      const message = 'Login failed with password=mySecret123';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('mySecret123');
      expect(sanitized).to.include('password=[REDACTED]');
    });

    it('should sanitize client secrets from error messages', () => {
      const message = 'OAuth error: client_secret=superSecretKey456';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('superSecretKey456');
      expect(sanitized).to.include('client_secret=[REDACTED]');
    });

    it('should sanitize refresh tokens from error messages', () => {
      const message = 'Token refresh failed: refresh_token=5Aep861.abc_xyz-123';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('5Aep861.abc_xyz-123');
      expect(sanitized).to.include('refresh_token=[REDACTED]');
    });

    it('should handle messages without sensitive data', () => {
      const message = 'Connection timeout error';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.equal(message);
    });

    it('should sanitize multiple tokens in the same message', () => {
      const message = 'Auth failed: Bearer abc123 and access_token=xyz789 with refresh_token=def456';
      const sanitized = ErrorHandler.sanitizeErrorMessage(message);

      expect(sanitized).to.not.include('abc123');
      expect(sanitized).to.not.include('xyz789');
      expect(sanitized).to.not.include('def456');
      expect(sanitized).to.include('[REDACTED]');
    });
  });

  describe('Error Detection & Wrapping', () => {
    it('should detect network errors by code', () => {
      const error = new Error('Connection failed') as Error & { code: string };
      error.code = 'ECONNREFUSED';

      expect(ErrorHandler.isNetworkError(error)).to.be.true;
    });

    it('should detect network errors by message', () => {
      const error = new Error('Network timeout occurred');

      expect(ErrorHandler.isNetworkError(error)).to.be.true;
    });

    it('should not detect non-network errors', () => {
      const error = new Error('Invalid JSON syntax');

      expect(ErrorHandler.isNetworkError(error)).to.be.false;
    });

    it('should wrap SfError without modification', () => {
      const originalError = new SfError('Test error', 'TestError');
      const wrapped = ErrorHandler.wrapError(originalError, 'test context');

      expect(wrapped).to.equal(originalError);
    });

    it('should wrap network errors with appropriate handler', () => {
      const error = new Error('Connection refused') as Error & { code: string };
      error.code = 'ECONNREFUSED';

      const wrapped = ErrorHandler.wrapError(error, 'API call');

      expect(wrapped).to.be.instanceOf(SfError);
      expect(wrapped.name).to.equal(WebAppErrorCode.NETWORK_ERROR);
      expect(wrapped.message).to.include('API call');
    });

    it('should wrap generic errors with context', () => {
      const error = new Error('Something went wrong');
      const wrapped = ErrorHandler.wrapError(error, 'processing request');

      expect(wrapped).to.be.instanceOf(SfError);
      expect(wrapped.message).to.include('processing request');
      expect(wrapped.message).to.include('Something went wrong');
    });

    it('should handle non-Error objects', () => {
      const wrapped = ErrorHandler.wrapError('string error', 'test operation');

      expect(wrapped).to.be.instanceOf(SfError);
      expect(wrapped.message).to.include('test operation');
      expect(wrapped.message).to.include('string error');
    });

    it('should sanitize wrapped error messages', () => {
      const error = new Error('Failed with Bearer abc123xyz456');
      const wrapped = ErrorHandler.wrapError(error, 'authentication');

      expect(wrapped.message).to.not.include('abc123xyz456');
      expect(wrapped.message).to.include('[REDACTED]');
    });
  });

  describe('Error Codes', () => {
    it('should use consistent error codes', () => {
      expect(WebAppErrorCode.TOKEN_EXPIRED).to.equal('TokenExpiredError');
      expect(WebAppErrorCode.ORG_NOT_FOUND).to.equal('OrgNotFoundError');
      expect(WebAppErrorCode.MANIFEST_NOT_FOUND).to.equal('ManifestNotFoundError');
      expect(WebAppErrorCode.DEV_SERVER_TIMEOUT).to.equal('DevServerTimeoutError');
      expect(WebAppErrorCode.PORT_IN_USE).to.equal('PortInUseError');
      expect(WebAppErrorCode.NETWORK_ERROR).to.equal('NetworkError');
    });
  });

  describe('Action Suggestions', () => {
    it('should provide actionable suggestions for all errors', () => {
      const errors = [
        ErrorHandler.createTokenExpiredError('org'),
        ErrorHandler.createOrgNotFoundError('org'),
        ErrorHandler.createManifestNotFoundError(),
        ErrorHandler.createDevServerTimeoutError(30),
        ErrorHandler.createPortInUseError(4545),
        ErrorHandler.createNetworkError('operation'),
      ];

      for (const error of errors) {
        expect(error.actions).to.exist;
        expect(error.actions).to.have.length.greaterThan(0);
        // All actions should be strings
        for (const action of error.actions ?? []) {
          expect(action).to.be.a('string');
          expect(action.length).to.be.greaterThan(0);
        }
      }
    });

    it('should provide command suggestions in actions', () => {
      const error = ErrorHandler.createTokenExpiredError('myorg');
      const actionsString = error.actions?.join(' ') ?? '';

      expect(actionsString).to.include('sf org login web');
    });
  });
});
