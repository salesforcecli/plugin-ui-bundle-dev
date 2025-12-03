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
import { spawn, type ChildProcess } from 'node:child_process';
import { Logger, SfError } from '@salesforce/core';
import type { DevServerOptions, DevServerStatus } from '../config/types.js';
import { DevServerErrorParser } from '../error/DevServerErrorParser.js';

/**
 * URL detection patterns for various dev servers
 * These patterns extract URLs from different dev server outputs
 */
/**
 * URL detection patterns organized by dev server type
 * Add new server patterns here for easy maintenance
 */

// Vite dev server patterns
// Example: "  ➜  Local:   http://localhost:5173/"
const VITE_PATTERNS = [
  /➜\s*Local:\s+(https?:\/\/[^\s]+)/iu, // Unicode arrow (with colors)
  />\s*Local:\s+(https?:\/\/[^\s]+)/i, // ASCII arrow fallback
];

// Create React App (Webpack) patterns
// Example: "On Your Network:  http://192.168.1.1:3000"
const CRA_PATTERNS = [/On Your Network:\s+(https?:\/\/[^\s]+)/i, /Local:\s+(https?:\/\/[^\s]+)/i];

// Next.js dev server patterns
// Example: "ready - started server on 0.0.0.0:3000, url: http://localhost:3000"
const NEXTJS_PATTERNS = [/url:\s+(https?:\/\/[^\s,]+)/i, /-\s*Local:\s+(https?:\/\/[^\s]+)/i];

// Generic patterns for custom/unknown servers
// Example: "Server running at http://localhost:8080"
const GENERIC_PATTERNS = [
  /(?:Server|server|Running|running|started|Started).*?(https?:\/\/[^\s]+)/i,
  /(https?:\/\/localhost:[0-9]+)/i,
  /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):[0-9]+)/i,
];

// Combined patterns in priority order
// Specific patterns first, generic fallbacks last
const URL_PATTERNS = [...VITE_PATTERNS, ...CRA_PATTERNS, ...NEXTJS_PATTERNS, ...GENERIC_PATTERNS];

/**
 * Default configuration values for DevServerManager
 */
const DEFAULT_OPTIONS = {
  cwd: process.cwd(),
  startupTimeout: 30_000, // 30 seconds
  maxRestarts: 3,
} as const;

/**
 * Dev server manager configuration with defaults applied
 */
type DevServerConfig = {
  command?: string;
  explicitUrl?: string;
  cwd: string;
  startupTimeout: number;
  maxRestarts: number;
};

/**
 * DevServerManager handles the lifecycle of the local development server process
 *
 * This class:
 * - Spawns the dev server as a child process (e.g., "npm run dev")
 * - Detects the dev server URL by parsing stdout (supports Vite, CRA, Next.js, etc.)
 * - Monitors process health and emits lifecycle events
 * - Handles process cleanup and graceful shutdown
 * - Supports automatic restart on crash (with retry limits)
 * - Provides debug logging for process output (use SF_LOG_LEVEL=debug)
 *
 * @example
 * ```typescript
 * const manager = new DevServerManager({
 *   command: 'npm run dev',
 *   cwd: '/path/to/project',
 * });
 *
 * manager.on('ready', (url) => {
 *   console.log(`Dev server ready at ${url}`);
 * });
 *
 * manager.on('error', (error) => {
 *   console.error('Dev server error:', error);
 * });
 *
 * await manager.start();
 * ```
 */
export class DevServerManager extends EventEmitter {
  private options: DevServerConfig;
  private process: ChildProcess | null = null;
  private detectedUrl: string | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private isReady = false;
  private restartCount = 0;
  private logger: Logger | null = null;
  private stderrBuffer: string[] = []; // Buffer to store stderr lines for error parsing
  private readonly maxStderrLines = 100; // Keep last 100 lines

  /**
   * Creates a new DevServerManager instance
   *
   * @param options Configuration options for the dev server
   */
  public constructor(options: DevServerOptions) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parses a command string into executable and arguments
   *
   * Handles common patterns like:
   * - "npm run dev"
   * - "yarn dev"
   * - "pnpm dev"
   * - "node server.js"
   *
   * @param command The command string to parse
   * @returns Array with executable as first element and args as remaining
   */
  private static parseCommand(command: string): string[] {
    // Split by spaces, but respect quoted strings
    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [command];
    return parts.map((part) => part.replace(/^["']|["']$/g, ''));
  }

  /**
   * Strips ANSI color codes from a string
   *
   * @param text - Text with potential ANSI codes
   * @returns Clean text without ANSI codes
   */
  private static stripAnsiCodes(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Detects dev server URL from process output
   *
   * Attempts to match common dev server URL patterns like Vite,
   * Create React App, Next.js, etc. Processes line-by-line for robustness.
   *
   * @param output - The output string to search for URLs
   * @returns Detected URL or null if none found
   */
  private static detectUrlFromOutput(output: string): string | null {
    // Split by newlines and check each line separately
    // This is more robust against chunked output
    const lines = output.split('\n');

    for (const line of lines) {
      // Strip ANSI color codes first (some tools ignore FORCE_COLOR=0)
      const cleanLine = DevServerManager.stripAnsiCodes(line);
      const trimmedLine = cleanLine.trim();
      if (!trimmedLine) continue;

      for (const pattern of URL_PATTERNS) {
        const match = trimmedLine.match(pattern);

        if (match?.[1]) {
          const url = match[1].trim();
          // Normalize 0.0.0.0 to localhost for better usability
          return url.replace('0.0.0.0', 'localhost');
        }
      }
    }

    return null;
  }

  /**
   * Starts the dev server process
   *
   * If an explicit URL is provided, skips process spawning and immediately
   * emits the ready event. Otherwise, spawns the dev server command and
   * monitors its output for URL detection.
   *
   * @throws SfError if command is not provided and no explicit URL is set
   * @throws SfError if process fails to start
   * @throws SfError if URL is not detected within the timeout period
   */
  public async start(): Promise<void> {
    // Initialize logger
    await this.initLogger();

    // If explicit URL is provided, skip process spawning
    if (this.options.explicitUrl) {
      this.logger?.debug(`Using explicit dev server URL: ${this.options.explicitUrl}`);
      this.detectedUrl = this.options.explicitUrl;
      this.isReady = true;
      this.emit('ready', this.detectedUrl);
      return;
    }

    // Validate that command is provided
    if (!this.options.command) {
      throw new SfError(
        'Dev server command is required when explicit URL is not provided',
        'DevServerCommandRequired',
        ['Provide a "command" in DevServerOptions', 'Or provide an "explicitUrl" to skip spawning']
      );
    }

    this.logger?.debug(`Starting dev server with command: ${this.options.command}`);

    // Parse command into executable and arguments
    const [cmd, ...args] = DevServerManager.parseCommand(this.options.command);

    // Spawn the dev server process
    try {
      this.process = spawn(cmd, args, {
        cwd: this.options.cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors for easier parsing
      });
    } catch (error) {
      const sfError =
        error instanceof Error ? error : new Error(error instanceof Object ? JSON.stringify(error) : String(error));
      throw new SfError(`Failed to spawn dev server process: ${sfError.message}`, 'DevServerSpawnError', [
        `Verify the command is correct: ${this.options.command}`,
        'Check that the executable exists in your PATH',
        'Ensure you have the necessary dependencies installed',
      ]);
    }

    // Setup process event handlers
    this.setupProcessHandlers();

    // Setup startup timeout
    this.startupTimer = setTimeout(() => {
      this.handleStartupTimeout();
    }, this.options.startupTimeout);
  }

  /**
   * Stops the dev server process
   *
   * Attempts graceful shutdown first (SIGTERM), then forceful kill (SIGKILL)
   * if process doesn't exit within 5 seconds.
   *
   * @returns Promise that resolves when process is stopped
   */
  public async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.logger?.debug('Stopping dev server process...');

    // Clear startup timer
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    return new Promise<void>((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      const processToKill = this.process;

      // Setup exit handler
      const onExit = (): void => {
        this.logger?.debug('Dev server process stopped');
        this.process = null;
        resolve();
      };

      processToKill.once('exit', onExit);

      // Try graceful shutdown first
      processToKill.kill('SIGTERM');

      // Force kill after 3 seconds if still running
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logger?.warn('Dev server did not exit gracefully, forcing kill...');
          this.process.kill('SIGKILL');
        }
      }, 3000);
    });
  }

  /**
   * Gets the current status of the dev server
   *
   * @returns DevServerStatus object with current state
   */
  public getStatus(): DevServerStatus {
    // For explicit URL mode (no process), consider running if ready
    // For spawned process mode, check process state
    const running = this.isReady && (this.process === null || !this.process.killed);

    return {
      running,
      url: this.detectedUrl ?? undefined,
      pid: this.process?.pid,
    };
  }

  /**
   * Gets the detected or explicit URL of the dev server
   *
   * @returns The dev server URL, or null if not yet detected
   */
  public getUrl(): string | null {
    return this.detectedUrl;
  }

  /**
   * Initialize the logger (must be called before start)
   */
  private async initLogger(): Promise<void> {
    if (!this.logger) {
      // Logger respects SF_LOG_LEVEL environment variable
      this.logger = await Logger.child('DevServerManager');
    }
  }

  /**
   * Sets up event handlers for the spawned process
   *
   * Handles stdout/stderr for URL detection and logging,
   * exit events for cleanup and restart, and error events
   */
  private setupProcessHandlers(): void {
    if (!this.process) {
      return;
    }

    // Handle stdout - look for dev server URL
    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.handleProcessOutput(output, 'stdout');
    });

    // Handle stderr - log errors but also check for URLs (some servers use stderr)
    this.process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.handleProcessOutput(output, 'stderr');
    });

    // Handle process exit
    this.process.on('exit', (code: number | null, signal: string | null) => {
      this.handleProcessExit(code, signal);
    });

    // Handle process errors
    this.process.on('error', (error: Error) => {
      this.handleProcessError(error);
    });
  }

  /**
   * Handles output from the dev server process
   *
   * Attempts to detect the dev server URL from the output and
   * emits stdout/stderr events for consumers
   *
   * @param output The output string from the process
   * @param stream The stream type (stdout or stderr)
   */
  private handleProcessOutput(output: string, stream: 'stdout' | 'stderr'): void {
    // Emit output event for consumers
    this.emit(stream, output);

    // Capture stderr lines for error parsing
    if (stream === 'stderr') {
      const lines = output.split('\n').filter((line) => line.trim());
      this.stderrBuffer.push(...lines);

      // Keep only the last N lines to prevent memory issues
      if (this.stderrBuffer.length > this.maxStderrLines) {
        this.stderrBuffer = this.stderrBuffer.slice(-this.maxStderrLines);
      }
    }

    // Log dev server output (only visible when SF_LOG_LEVEL=debug)
    const lines = output.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      this.logger?.debug(`[Dev Server ${stream}] ${line}`);
    }

    // Try to detect URL if not yet ready
    if (!this.isReady) {
      const url = DevServerManager.detectUrlFromOutput(output);
      if (url) {
        this.handleUrlDetected(url);
      }
    }
  }

  /**
   * Handles successful URL detection
   *
   * Clears the startup timeout, marks server as ready,
   * and emits the ready event
   *
   * @param url The detected URL
   */
  private handleUrlDetected(url: string): void {
    this.detectedUrl = url;
    this.isReady = true;

    // Clear startup timeout
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    // Clear stderr buffer on successful start
    this.stderrBuffer = [];

    this.logger?.debug(`Dev server detected at: ${url}`);
    this.emit('ready', url);
  }

  /**
   * Handles process exit event
   *
   * Cleans up resources and optionally attempts restart
   * if the exit was unexpected and restart limit not reached
   *
   * @param code Exit code from the process
   * @param signal Signal that caused exit (if any)
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    this.logger?.debug(`Dev server process exited with code ${code ?? 'null'}, signal ${signal ?? 'null'}`);

    // Clear startup timeout
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }

    // Emit exit event
    this.emit('exit', code, signal);

    // Check if this was an error exit (non-zero code)
    const wasExpectedExit = signal === 'SIGTERM' || signal === 'SIGKILL' || signal === 'SIGINT';
    const wasErrorExit = code !== null && code !== 0 && !wasExpectedExit;

    // Parse stderr if there was an error and we have stderr content
    if (wasErrorExit && this.stderrBuffer.length > 0) {
      const stderrContent = this.stderrBuffer.join('\n');
      const parsedError = DevServerErrorParser.parseError(stderrContent, code, signal);

      this.logger?.error(`Dev server error: ${parsedError.title}`);
      this.logger?.debug(`Error type: ${parsedError.type}`);

      // Emit parsed error
      this.emit('error', parsedError);

      // Check if we should retry based on error type
      const shouldRetry = DevServerErrorParser.shouldRetry(parsedError);

      if (shouldRetry && this.restartCount < this.options.maxRestarts) {
        this.restartCount += 1;
        this.logger?.warn(
          `Dev server crashed, attempting restart (${this.restartCount}/${this.options.maxRestarts})...`
        );
        this.isReady = false;
        this.detectedUrl = null;
        this.stderrBuffer = []; // Clear buffer for next attempt

        // Restart after a short delay
        setTimeout(() => {
          this.start().catch((error: unknown) => {
            const sfError =
              error instanceof SfError
                ? error
                : new SfError(error instanceof Error ? error.message : String(error), 'DevServerRestartError');
            this.emit('error', sfError);
          });
        }, 2000);
      }

      // Don't retry if it's a permanent error - already emitted above
      return;
    }

    // Normal crash handling (no stderr or expected exit)
    if (!wasExpectedExit && this.isReady && this.restartCount < this.options.maxRestarts) {
      this.restartCount += 1;
      this.logger?.warn(`Dev server crashed, attempting restart (${this.restartCount}/${this.options.maxRestarts})...`);
      this.isReady = false;
      this.detectedUrl = null;
      this.stderrBuffer = []; // Clear buffer

      // Restart after a short delay
      setTimeout(() => {
        this.start().catch((error: unknown) => {
          const sfError =
            error instanceof SfError
              ? error
              : new SfError(error instanceof Error ? error.message : String(error), 'DevServerRestartError');
          this.emit('error', sfError);
        });
      }, 2000);
    } else if (!wasExpectedExit && this.restartCount >= this.options.maxRestarts) {
      this.logger?.error('Dev server restart limit reached');
      const error = new SfError(
        'Dev server crashed and exceeded maximum restart attempts',
        'DevServerMaxRestartsExceeded',
        [`The dev server has crashed ${this.restartCount} times`, 'Check the dev server logs for errors']
      );
      this.emit('error', error);
    }

    // Reset state
    this.process = null;
  }

  /**
   * Handles process error event
   *
   * Emits error event to consumers with appropriate context
   *
   * @param error The error from the process
   */
  private handleProcessError(error: Error): void {
    this.logger?.error(`Dev server process error: ${error.message}`);

    const sfError = new SfError(`Dev server process error: ${error.message}`, 'DevServerProcessError', [
      'Check that the command is correct in webapp.json',
      'Verify all dependencies are installed',
      'Try running the command manually to see the error',
    ]);

    this.emit('error', sfError);
  }

  /**
   * Handles startup timeout
   *
   * Called when dev server doesn't start within the timeout period
   * Kills the process and emits an error
   */
  private handleStartupTimeout(): void {
    this.logger?.error('Dev server failed to start within timeout period');

    const error = new SfError(
      `Dev server did not start within ${this.options.startupTimeout / 1000} seconds`,
      'DevServerStartupTimeout',
      [
        'The dev server may be taking longer than expected to start',
        'Check the dev server logs for errors',
        'Try running the command manually: ' + (this.options.command ?? 'Unknown command'),
        'Consider increasing the timeout if your dev server is slow to start',
      ]
    );

    // Kill the process if it's still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }

    this.emit('error', error);
  }
}
