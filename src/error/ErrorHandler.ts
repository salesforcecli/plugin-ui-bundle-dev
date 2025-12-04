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

import { SfError } from '@salesforce/core';

/**
 * Standardized error codes for webapp dev command
 */
export enum WebAppErrorCode {
  // Authentication errors
  TOKEN_EXPIRED = 'TokenExpiredError',
  ORG_NOT_FOUND = 'OrgNotFoundError',
  AUTH_FAILED = 'AuthenticationFailedError',
  TOKEN_REFRESH_FAILED = 'TokenRefreshFailedError',

  // Manifest errors
  MANIFEST_NOT_FOUND = 'ManifestNotFoundError',
  MANIFEST_INVALID = 'ManifestValidationError',
  MANIFEST_PARSE_ERROR = 'ManifestParseError',

  // Dev server errors
  DEV_SERVER_START_FAILED = 'DevServerStartFailedError',
  DEV_SERVER_TIMEOUT = 'DevServerTimeoutError',
  DEV_SERVER_CRASHED = 'DevServerCrashedError',
  DEV_SERVER_COMMAND_REQUIRED = 'DevServerCommandRequiredError',

  // Proxy errors
  PORT_IN_USE = 'PortInUseError',
  PROXY_START_FAILED = 'ProxyStartFailedError',
  TARGET_UNREACHABLE = 'TargetUnreachableError',

  // Network errors
  NETWORK_ERROR = 'NetworkError',
  CONNECTION_REFUSED = 'ConnectionRefusedError',
  TIMEOUT_ERROR = 'TimeoutError',

  // Runtime errors
  RUNTIME_ERROR = 'RuntimeError',
  UNCAUGHT_EXCEPTION = 'UncaughtException',
  UNHANDLED_REJECTION = 'UnhandledRejection',
  STACK_TRACE_ERROR = 'StackTraceError',
}

/**
 * ErrorHandler provides standardized error messages with actionable suggestions
 * for all webapp dev command error scenarios.
 */
export class ErrorHandler {
  /**
   * Create an error for expired authentication token
   *
   * @param orgAlias - The org alias that has expired authentication
   * @returns SfError with user-friendly message and suggestions
   */
  public static createTokenExpiredError(orgAlias: string): SfError {
    return new SfError(`Your org authentication has expired for '${orgAlias}'.`, WebAppErrorCode.TOKEN_EXPIRED, [
      `Run 'sf org login web -o ${orgAlias}' to re-authenticate`,
      "Or run 'sf org login web' to log in to a new org",
      'You can check your current org status with: sf org display',
    ]);
  }

  /**
   * Create an error for org not found
   *
   * @param orgAlias - The org alias that was not found
   * @returns SfError with user-friendly message and suggestions
   */
  public static createOrgNotFoundError(orgAlias: string): SfError {
    return new SfError(`Org '${orgAlias}' not found in your authenticated orgs.`, WebAppErrorCode.ORG_NOT_FOUND, [
      'Check available orgs with: sf org list',
      `Log in to the org with: sf org login web -a ${orgAlias}`,
      'Make sure the org alias is spelled correctly',
    ]);
  }

  /**
   * Create an error for authentication failure
   *
   * @param orgAlias - The org alias where authentication failed
   * @param details - Optional details about the failure
   * @returns SfError with user-friendly message and suggestions
   */
  public static createAuthFailedError(orgAlias: string, details?: string): SfError {
    const message = details
      ? `Authentication failed for org '${orgAlias}': ${details}`
      : `Authentication failed for org '${orgAlias}'.`;

    return new SfError(message, WebAppErrorCode.AUTH_FAILED, [
      `Check your org status with: sf org display -o ${orgAlias}`,
      `Re-authenticate with: sf org login web -o ${orgAlias}`,
      'Ensure your Salesforce org is accessible and your credentials are valid',
    ]);
  }

  /**
   * Create an error for token refresh failure
   *
   * @param orgAlias - The org alias where token refresh failed
   * @returns SfError with user-friendly message and suggestions
   */
  public static createTokenRefreshFailedError(orgAlias: string): SfError {
    return new SfError(`Failed to refresh access token for org '${orgAlias}'.`, WebAppErrorCode.TOKEN_REFRESH_FAILED, [
      `Re-authenticate with: sf org login web -r -o ${orgAlias}`,
      'The refresh token may have expired or been revoked',
      'Check your Salesforce org session settings',
    ]);
  }

  /**
   * Create an error for missing webapp.json manifest
   *
   * @returns SfError with user-friendly message and suggestions
   */
  public static createManifestNotFoundError(): SfError {
    return new SfError('webapp.json not found in the current directory.', WebAppErrorCode.MANIFEST_NOT_FOUND, [
      "Run 'sf webapp generate' to create a webapp.json file",
      'Make sure you are in the correct project directory',
      'The webapp.json file should be in the project root',
    ]);
  }

  /**
   * Create an error for invalid webapp.json manifest
   *
   * @param validationErrors - Array of validation error messages
   * @returns SfError with user-friendly message and suggestions
   */
  public static createManifestValidationError(validationErrors: string[]): SfError {
    const errorList = validationErrors.map((err) => `  • ${err}`).join('\n');

    return new SfError(`Web application manifest validation failed:\n${errorList}`, WebAppErrorCode.MANIFEST_INVALID, [
      'Check the webapp.json file for syntax errors',
      'Ensure all required fields are present: name, label, version, outputDir',
      'Refer to the schema documentation for valid field formats',
    ]);
  }

  /**
   * Create an error for JSON parse errors in webapp.json
   *
   * @param parseError - The original parse error message
   * @returns SfError with user-friendly message and suggestions
   */
  public static createManifestParseError(parseError: string): SfError {
    return new SfError(`Failed to parse webapp.json: ${parseError}`, WebAppErrorCode.MANIFEST_PARSE_ERROR, [
      'Check for JSON syntax errors (missing commas, brackets, quotes)',
      'Validate your JSON with a JSON validator tool',
      'Make sure the file is saved with UTF-8 encoding',
    ]);
  }

  /**
   * Create an error for dev server start failure
   *
   * @param command - The command that failed to start
   * @param errorMessage - The error message from the failed command
   * @returns SfError with user-friendly message and suggestions
   */
  public static createDevServerStartFailedError(command: string, errorMessage?: string): SfError {
    const message = errorMessage
      ? `Dev server failed to start: ${errorMessage}`
      : `Dev server failed to start with command: ${command}`;

    return new SfError(message, WebAppErrorCode.DEV_SERVER_START_FAILED, [
      'Check the dev.command in your webapp.json is correct',
      'Make sure all dependencies are installed (run: npm install or yarn install)',
      'Verify the command works when run manually in the terminal',
      'Check the dev server logs for more details',
    ]);
  }

  /**
   * Create an error for dev server timeout
   *
   * @param timeoutSeconds - The timeout duration in seconds
   * @returns SfError with user-friendly message and suggestions
   */
  public static createDevServerTimeoutError(timeoutSeconds: number): SfError {
    return new SfError(
      `Dev server did not start within ${timeoutSeconds} seconds.`,
      WebAppErrorCode.DEV_SERVER_TIMEOUT,
      [
        'The dev server may be taking longer than expected to start',
        'Check if the dev server command is correct in webapp.json',
        'Try running the dev server command manually to see if it starts',
        'Increase the startup timeout if your dev server is slow to start',
      ]
    );
  }

  /**
   * Create an error for dev server crash
   *
   * @param exitCode - The exit code of the crashed process
   * @param signal - The signal that killed the process (if any)
   * @returns SfError with user-friendly message and suggestions
   */
  public static createDevServerCrashedError(exitCode: number | null, signal: string | null): SfError {
    const details = signal ? `signal ${signal}` : `exit code ${String(exitCode)}`;
    return new SfError(`Dev server crashed unexpectedly (${details}).`, WebAppErrorCode.DEV_SERVER_CRASHED, [
      'Check the dev server logs for error messages',
      'Verify all dependencies are properly installed',
      'Try running the dev server command manually to diagnose the issue',
      'The dev server will attempt to restart automatically',
    ]);
  }

  /**
   * Create an error for missing dev server command
   *
   * @returns SfError with user-friendly message and suggestions
   */
  public static createDevServerCommandRequiredError(): SfError {
    return new SfError('Dev server command or URL is required.', WebAppErrorCode.DEV_SERVER_COMMAND_REQUIRED, [
      'Add a "dev.command" field to your webapp.json (e.g., "npm run dev")',
      'Or provide a --url flag to specify the dev server URL',
      'Example: sf webapp dev --url http://localhost:5173',
    ]);
  }

  /**
   * Create an error for port already in use
   *
   * @param port - The port that is already in use
   * @returns SfError with user-friendly message and suggestions
   */
  public static createPortInUseError(port: number): SfError {
    const alternativePort = port + 1;
    return new SfError(`Port ${port} is already in use.`, WebAppErrorCode.PORT_IN_USE, [
      `Try a different port with: sf webapp dev --port ${alternativePort}`,
      'Check if another proxy server or application is running on this port',
      `On macOS/Linux, find the process using: lsof -i :${port}`,
      `On Windows, find the process using: netstat -ano | findstr :${port}`,
    ]);
  }

  /**
   * Create an error for proxy start failure
   *
   * @param errorMessage - The error message from the proxy failure
   * @returns SfError with user-friendly message and suggestions
   */
  public static createProxyStartFailedError(errorMessage: string): SfError {
    return new SfError(`Failed to start proxy server: ${errorMessage}`, WebAppErrorCode.PROXY_START_FAILED, [
      'Check if the port is available',
      'Verify network permissions and firewall settings',
      'Try running with sudo/administrator privileges if needed',
    ]);
  }

  /**
   * Create an error for target unreachable
   *
   * @param target - The target URL that is unreachable
   * @param reason - The reason why the target is unreachable
   * @returns SfError with user-friendly message and suggestions
   */
  public static createTargetUnreachableError(target: string, reason?: string): SfError {
    const message = reason ? `Cannot reach ${target}: ${reason}` : `Cannot reach ${target}`;

    const suggestions =
      target.includes('salesforce.com') || target.includes('force.com')
        ? [
            'Check your internet connection',
            'Verify the Salesforce org is accessible',
            'Check if there are any Salesforce service outages',
            'Verify your firewall is not blocking the connection',
          ]
        : [
            'Make sure the dev server is running',
            `Verify the dev server URL is correct: ${target}`,
            'Check if the dev server started successfully',
            'Try accessing the URL directly in your browser',
          ];

    return new SfError(message, WebAppErrorCode.TARGET_UNREACHABLE, suggestions);
  }

  /**
   * Create an error for network errors
   *
   * @param operation - The operation that failed due to network error
   * @param errorMessage - The network error message
   * @returns SfError with user-friendly message and suggestions
   */
  public static createNetworkError(operation: string, errorMessage?: string): SfError {
    const message = errorMessage
      ? `Network error during ${operation}: ${errorMessage}`
      : `Network error during ${operation}`;

    return new SfError(message, WebAppErrorCode.NETWORK_ERROR, [
      'Check your internet connection',
      'Verify your network proxy settings if behind a corporate firewall',
      'Try again in a few moments',
      'Check if the target service is accessible',
    ]);
  }

  /**
   * Create an error for connection refused
   *
   * @param target - The target that refused the connection
   * @returns SfError with user-friendly message and suggestions
   */
  public static createConnectionRefusedError(target: string): SfError {
    return new SfError(`Connection refused by ${target}`, WebAppErrorCode.CONNECTION_REFUSED, [
      'Make sure the target service is running',
      'Verify the URL and port are correct',
      'Check firewall settings',
      'The service may be temporarily unavailable',
    ]);
  }

  /**
   * Create an error for timeout
   *
   * @param operation - The operation that timed out
   * @param timeoutSeconds - The timeout duration in seconds
   * @returns SfError with user-friendly message and suggestions
   */
  public static createTimeoutError(operation: string, timeoutSeconds: number): SfError {
    return new SfError(`${operation} timed out after ${timeoutSeconds} seconds`, WebAppErrorCode.TIMEOUT_ERROR, [
      'The operation took longer than expected',
      'Check your network connection speed',
      'Try increasing the timeout if this happens frequently',
      'Verify the target service is responding',
    ]);
  }

  /**
   * Sanitize error messages to remove sensitive information
   *
   * @param message - The original error message
   * @returns Sanitized error message with tokens and credentials removed
   */
  public static sanitizeErrorMessage(message: string): string {
    // Remove access tokens (Bearer tokens, session IDs)
    let sanitized = message.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(/access_token[=:]\s*[A-Za-z0-9._-]+/gi, 'access_token=[REDACTED]');
    sanitized = sanitized.replace(/sid[=:]\s*[A-Za-z0-9._-]+/gi, 'sid=[REDACTED]');

    // Remove potential passwords
    sanitized = sanitized.replace(/password[=:]\s*[^\s&]+/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/client_secret[=:]\s*[^\s&]+/gi, 'client_secret=[REDACTED]');

    // Remove refresh tokens
    sanitized = sanitized.replace(/refresh_token[=:]\s*[A-Za-z0-9._-]+/gi, 'refresh_token=[REDACTED]');

    return sanitized;
  }

  /**
   * Check if an error is a network-related error
   *
   * @param error - The error to check
   * @returns True if the error is network-related
   */
  public static isNetworkError(error: Error): boolean {
    const networkErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'];

    // Check error code
    if ('code' in error && typeof error.code === 'string') {
      return networkErrorCodes.includes(error.code);
    }

    // Check error message
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused')
    );
  }

  /**
   * Convert a generic error to an SfError with appropriate context
   *
   * @param error - The original error
   * @param context - Context about where the error occurred
   * @returns SfError with proper formatting and suggestions
   */
  public static wrapError(error: unknown, context: string): SfError {
    if (error instanceof SfError) {
      return error as SfError;
    }

    const errorObj = error instanceof Error ? error : new Error(String(error));
    const sanitizedMessage = ErrorHandler.sanitizeErrorMessage(errorObj.message);

    // Check for specific error types
    if (ErrorHandler.isNetworkError(errorObj)) {
      return ErrorHandler.createNetworkError(context, sanitizedMessage);
    }

    // Generic error wrapping
    return new SfError(`${context}: ${sanitizedMessage}`, 'UnexpectedError', [
      'This is an unexpected error',
      'Please try again',
      'If the problem persists, check the command logs with SF_LOG_LEVEL=debug',
    ]);
  }
}
