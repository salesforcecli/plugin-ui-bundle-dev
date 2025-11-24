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

import { EventEmitter } from 'node:events';
import { Logger } from '../utils/Logger.js';
import type { ErrorMetadata, ErrorSeverity, GlobalErrorCaptureOptions } from './types.js';
import { StackTraceFormatter } from './StackTraceFormatter.js';

/**
 * GlobalErrorCapture implements a singleton pattern for capturing and handling
 * all uncaught exceptions and unhandled promise rejections in the application.
 *
 * Features:
 * - Captures uncaught exceptions
 * - Captures unhandled promise rejections
 * - Extracts comprehensive error metadata
 * - Formats stack traces
 * - Emits events for error consumers
 * - Prevents duplicate handler registration
 * - Graceful error handling and logging
 *
 * Usage:
 * ```typescript
 * const capture = GlobalErrorCapture.getInstance({
 *   onError: (metadata) => {
 *     // Handle error (e.g., display in UI, log to file)
 *   }
 * });
 * capture.start();
 *
 * // Later...
 * capture.stop();
 * ```
 *
 * Events:
 * - 'error': Emitted when an error is captured
 * - 'critical': Emitted for critical errors
 */
export class GlobalErrorCapture extends EventEmitter {
  private static instance: GlobalErrorCapture | null = null;
  private readonly options: Omit<Required<GlobalErrorCaptureOptions>, 'onError'> & {
    onError?: (metadata: ErrorMetadata) => void;
  };
  private readonly logger: Logger;
  private readonly formatter: StackTraceFormatter;
  private isStarted = false;
  private lastError: ErrorMetadata | null = null;

  // Handler references for cleanup
  private readonly boundExceptionHandler: (error: Error) => void;
  private readonly boundRejectionHandler: (reason: unknown, promise: Promise<unknown>) => void;

  private constructor(options: GlobalErrorCaptureOptions = {}) {
    super();

    this.options = {
      captureExceptions: options.captureExceptions ?? true,
      captureRejections: options.captureRejections ?? true,
      filterNodeModules: options.filterNodeModules ?? true,
      filterNodeInternals: options.filterNodeInternals ?? true,
      exitOnCritical: options.exitOnCritical ?? false,
      onError: options.onError,
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
    };

    this.logger = new Logger(false);
    this.formatter = new StackTraceFormatter({
      filterNodeModules: this.options.filterNodeModules,
      filterNodeInternals: this.options.filterNodeInternals,
      workspaceRoot: this.options.workspaceRoot,
    });

    // Bind handlers for proper cleanup
    this.boundExceptionHandler = this.handleUncaughtException.bind(this);
    this.boundRejectionHandler = this.handleUnhandledRejection.bind(this);
  }

  /**
   * Get or create the singleton instance
   *
   * @param options - Configuration options (only used on first call)
   * @returns GlobalErrorCapture instance
   */
  public static getInstance(options?: GlobalErrorCaptureOptions): GlobalErrorCapture {
    if (!GlobalErrorCapture.instance) {
      GlobalErrorCapture.instance = new GlobalErrorCapture(options);
    }
    return GlobalErrorCapture.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (GlobalErrorCapture.instance) {
      GlobalErrorCapture.instance.stop();
      GlobalErrorCapture.instance = null;
    }
  }

  /**
   * Check if an error is an intentional exit (e.g., oclif exit, Ctrl+C)
   *
   * @param error - Error to check
   * @returns True if this is an intentional exit
   */
  private static isIntentionalExit(error: Error): boolean {
    // Check for oclif exit errors (EEXIT)
    if ('code' in error && error.code === 'EEXIT') {
      return true;
    }

    // Check for oclif property indicating controlled exit
    type OclifError = Error & { oclif?: { exit?: number } };
    if (
      'oclif' in error &&
      typeof (error as OclifError).oclif === 'object' &&
      'exit' in ((error as OclifError).oclif ?? {})
    ) {
      return true;
    }

    // Check for skipOclifErrorHandling flag
    if ('skipOclifErrorHandling' in error) {
      return true;
    }

    // Check error message patterns for intentional exits
    const message = error.message ?? '';
    if (message.includes('EEXIT') || message.includes('SIGINT') || message.includes('SIGTERM')) {
      return true;
    }

    return false;
  }

  /**
   * Start capturing global errors
   */
  public start(): void {
    if (this.isStarted) {
      this.logger.warn('GlobalErrorCapture is already started');
      return;
    }

    if (this.options.captureExceptions) {
      process.on('uncaughtException', this.boundExceptionHandler);
      this.logger.debug('Registered uncaughtException handler');
    }

    if (this.options.captureRejections) {
      process.on('unhandledRejection', this.boundRejectionHandler);
      this.logger.debug('Registered unhandledRejection handler');
    }

    this.isStarted = true;
    this.logger.debug('GlobalErrorCapture started');
  }

  /**
   * Stop capturing global errors and cleanup handlers
   */
  public stop(): void {
    if (!this.isStarted) {
      return;
    }

    if (this.options.captureExceptions) {
      process.off('uncaughtException', this.boundExceptionHandler);
    }

    if (this.options.captureRejections) {
      process.off('unhandledRejection', this.boundRejectionHandler);
    }

    this.isStarted = false;
    this.logger.debug('GlobalErrorCapture stopped');
  }

  /**
   * Get the last captured error
   *
   * @returns Last error metadata or null
   */
  public getLastError(): ErrorMetadata | null {
    return this.lastError;
  }

  /**
   * Clear the last error
   */
  public clearLastError(): void {
    this.lastError = null;
  }

  /**
   * Manually capture an error with optional context
   *
   * @param error - Error to capture
   * @param context - Error context
   * @returns Error metadata
   */
  public captureError(error: unknown, context?: string): ErrorMetadata {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    return this.captureErrorMetadata(errorObj, {
      context,
      severity: 'error',
      isUnhandledRejection: false,
    });
  }

  /**
   * Get capture statistics
   *
   * @returns Capture statistics
   */
  public getStats(): {
    isStarted: boolean;
    hasLastError: boolean;
    captureExceptions: boolean;
    captureRejections: boolean;
  } {
    return {
      isStarted: this.isStarted,
      hasLastError: this.lastError !== null,
      captureExceptions: this.options.captureExceptions,
      captureRejections: this.options.captureRejections,
    };
  }

  /**
   * Handle uncaught exceptions
   *
   * @param error - Uncaught exception
   */
  private handleUncaughtException(error: Error): void {
    try {
      // Ignore intentional exits (oclif exit errors, Ctrl+C, etc.)
      if (GlobalErrorCapture.isIntentionalExit(error)) {
        this.logger.debug('Ignoring intentional exit signal');
        return;
      }

      const metadata = this.captureErrorMetadata(error, {
        context: 'Uncaught Exception',
        severity: 'critical',
        isUnhandledRejection: false,
      });

      this.processError(metadata);
    } catch (captureError) {
      // Fallback error handling if capture itself fails
      this.logger.error(
        `Failed to capture uncaught exception: ${
          captureError instanceof Error ? captureError.message : String(captureError)
        }`
      );
      this.logger.error(`Original error: ${error.message}`);
    }
  }

  /**
   * Handle unhandled promise rejections
   *
   * @param reason - Rejection reason
   */
  private handleUnhandledRejection(reason: unknown): void {
    try {
      // Convert reason to Error if it's not already
      const error = reason instanceof Error ? reason : new Error(String(reason));

      // Ignore intentional exits
      if (GlobalErrorCapture.isIntentionalExit(error)) {
        this.logger.debug('Ignoring intentional exit signal from promise rejection');
        return;
      }

      const metadata = this.captureErrorMetadata(error, {
        context: 'Unhandled Promise Rejection',
        severity: 'error',
        isUnhandledRejection: true,
      });

      this.processError(metadata);
    } catch (captureError) {
      // Fallback error handling
      this.logger.error(
        `Failed to capture unhandled rejection: ${
          captureError instanceof Error ? captureError.message : String(captureError)
        }`
      );
      this.logger.error(`Original rejection reason: ${String(reason)}`);
    }
  }

  /**
   * Capture comprehensive error metadata
   *
   * @param error - Error object
   * @param options - Additional metadata options
   * @returns Error metadata
   */
  private captureErrorMetadata(
    error: Error,
    options: {
      context?: string;
      severity?: ErrorSeverity;
      isUnhandledRejection: boolean;
    }
  ): ErrorMetadata {
    // Capture memory usage
    const memUsage = process.memoryUsage();

    // Format stack trace
    const formattedStack = this.formatter.format(error.stack ?? 'No stack trace available');

    const metadata: ErrorMetadata = {
      type: error.name ?? 'Error',
      message: error.message ?? 'Unknown error',
      stack: error.stack ?? 'No stack trace available',
      formattedStack,
      timestamp: new Date().toISOString(),
      severity: options.severity ?? 'error',
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      memoryUsage: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
      code: (error as NodeJS.ErrnoException).code,
      context: options.context,
      isUnhandledRejection: options.isUnhandledRejection,
      originalError: error,
    };

    return metadata;
  }

  /**
   * Process captured error (log, emit events, call callbacks)
   *
   * @param metadata - Error metadata
   */
  private processError(metadata: ErrorMetadata): void {
    // Store as last error
    this.lastError = metadata;

    // Log the error
    this.logError(metadata);

    // Emit events only if there are listeners (EventEmitter throws if 'error' event has no listeners)
    if (this.listenerCount('error') > 0) {
      this.emit('error', metadata);
    }
    if (metadata.severity === 'critical' && this.listenerCount('critical') > 0) {
      this.emit('critical', metadata);
    }

    // Call custom error handler if provided
    if (this.options.onError) {
      try {
        this.options.onError(metadata);
      } catch (handlerError) {
        this.logger.error(
          `Error in custom error handler: ${
            handlerError instanceof Error ? handlerError.message : String(handlerError)
          }`
        );
      }
    }

    // Exit on critical errors if configured
    if (this.options.exitOnCritical && metadata.severity === 'critical') {
      this.logger.error('Exiting due to critical error');
      // Give some time for async operations to complete
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  }

  /**
   * Log error with formatted output
   *
   * @param metadata - Error metadata
   */
  private logError(metadata: ErrorMetadata): void {
    const severityLabel = metadata.severity.toUpperCase();
    const prefix = metadata.isUnhandledRejection ? '[UNHANDLED REJECTION]' : '[UNCAUGHT EXCEPTION]';

    this.logger.error(`${prefix} ${severityLabel}: ${metadata.type}: ${metadata.message}`);
    this.logger.error(`Timestamp: ${metadata.timestamp}`);
    this.logger.error(
      `Location: ${StackTraceFormatter.extractErrorLocation(metadata.originalError as Error) ?? 'unknown'}`
    );
    this.logger.error(`Memory: ${metadata.memoryUsage.heapUsedMB}MB / ${metadata.memoryUsage.heapTotalMB}MB heap`);

    if (metadata.code) {
      this.logger.error(`Error Code: ${metadata.code}`);
    }

    // Log formatted stack trace
    this.logger.error('\nStack Trace:');
    this.logger.error(metadata.formattedStack.text);

    if (metadata.formattedStack.filteredCount > 0) {
      this.logger.error(`\n(${metadata.formattedStack.filteredCount} frames filtered)`);
    }
  }
}
