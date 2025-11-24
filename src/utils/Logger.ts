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

/**
 * Logger utility for the webapp dev command
 * Provides debug logging and formatted output
 */
export class Logger {
  private debugEnabled: boolean;

  public constructor(debug = false) {
    this.debugEnabled = debug;
  }

  /**
   * Log an info message
   */
  public info(message: string): void {
    this.logMessage(message, 'log');
  }

  /**
   * Log a warning message
   */
  public warn(message: string): void {
    this.logMessage(message, 'warn');
  }

  /**
   * Log an error message
   */
  public error(message: string): void {
    this.logMessage(message, 'error');
  }

  /**
   * Log a debug message (only if debug mode is enabled)
   */
  public debug(message: string): void {
    if (this.debugEnabled) {
      this.logMessage(`[DEBUG] ${message}`, 'log');
    }
  }

  /**
   * Check if debug mode is enabled
   */
  public isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Internal method to log messages (suppresses console warnings)
   */
  // eslint-disable-next-line class-methods-use-this
  private logMessage(message: string, level: 'log' | 'warn' | 'error'): void {
    // eslint-disable-next-line no-console
    console[level](message);
  }
}
