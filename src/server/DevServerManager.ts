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

import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { Logger, SfError } from '@salesforce/core';
import type { DevServerError, DevServerOptions } from '../config/types.js';
import { DevServerErrorParser } from '../error/DevServerErrorParser.js';

/**
 * Default configuration values for DevServerManager
 */
const DEFAULT_OPTIONS = {
  cwd: process.cwd(),
  startupTimeout: 30_000, // 30 seconds
} as const;

/**
 * Dev server manager configuration with defaults applied
 */
type DevServerConfig = {
  command?: string;
  url?: string;
  cwd: string;
  startupTimeout: number;
};

/**
 * DevServerManager handles the lifecycle of the local development server process
 *
 * This class:
 * - Spawns the dev server as a child process (e.g., "npm run dev")
 * - When url is set: no stdout URL parsing; URL comes from config
 * - Monitors process health and emits lifecycle events
 * - Handles process cleanup and graceful shutdown
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
  private readonly logger: Logger;
  private stderrBuffer: string[] = []; // Buffer to store stderr lines for error parsing
  private outputBuffer: string[] = []; // Combined stdout+stderr for timeout context (many servers use stdout)
  private readonly maxStderrLines = 100; // Keep last 100 lines
  private readonly maxOutputLines = 30; // Last N lines for timeout context

  /**
   * Creates a new DevServerManager instance
   *
   * @param options Configuration options for the dev server
   */
  public constructor(options: DevServerOptions) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = Logger.childFromRoot('DevServerManager');
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
   * Returns the buffered output (stdout + stderr) from the dev server process.
   * Useful for including failure context when the server times out or crashes.
   * Many dev servers (e.g. Vite) output to stdout, so we capture both streams.
   *
   * @returns Last N lines of combined output, or empty string
   */
  public getLastOutput(): string {
    return this.outputBuffer.slice(-15).join('\n');
  }

  /**
   * Starts the dev server process
   *
   * If url is provided without command, skips process spawning and immediately
   * emits the ready event. Otherwise, spawns the dev server command and
   * monitors its output for URL detection.
   *
   * @throws SfError if command is not provided and no url is set
   * @throws SfError if process fails to start
   * @throws SfError if URL is not detected within the timeout period
   */
  public start(): void {
    // If url provided without command, skip process spawning
    if (this.options.url && !this.options.command) {
      this.logger.debug(`Using dev server URL: ${this.options.url}`);
      this.detectedUrl = this.options.url;
      this.emit('ready', this.detectedUrl);
      return;
    }

    // Validate that command is provided
    if (!this.options.command) {
      throw new SfError('❌ Dev server command is required when url is not provided', 'DevServerCommandRequired', [
        'Provide a "command" in DevServerOptions',
        'Or provide a "url" to skip spawning',
      ]);
    }

    this.logger.debug(`Starting dev server with command: ${this.options.command}`);

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
      throw new SfError(`❌ Failed to spawn dev server process: ${sfError.message}`, 'DevServerSpawnError', [
        `Verify the command is correct: ${this.options.command}`,
        'Check that the executable exists in your PATH',
        'Ensure you have the necessary dependencies installed',
      ]);
    }

    // Setup process event handlers
    this.setupProcessHandlers();

    // Setup startup timeout only when not using url+command (caller verifies via polling)
    if (!(this.options.url && this.options.command)) {
      this.startupTimer = setTimeout(() => {
        this.handleStartupTimeout();
      }, this.options.startupTimeout);
    }
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

    this.logger.debug('Stopping dev server process...');

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

      // Force kill after 3 seconds if still running
      const forceKillTimeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.logger.warn('Dev server did not exit gracefully, forcing kill...');
          this.process.kill('SIGKILL');
        }
      }, 3000);

      // Setup exit handler - must clear timeout so process can exit immediately
      const onExit = (): void => {
        clearTimeout(forceKillTimeout);
        this.logger.debug('Dev server process stopped');
        this.process = null;
        resolve();
      };

      processToKill.once('exit', onExit);

      // Try graceful shutdown first
      processToKill.kill('SIGTERM');
    });
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

    // Split lines once and reuse for all operations
    const lines = output.split('\n').filter((line) => line.trim());

    // Capture stderr lines for error parsing
    if (stream === 'stderr') {
      this.stderrBuffer.push(...lines);

      // Keep only the last N lines to prevent memory issues
      if (this.stderrBuffer.length > this.maxStderrLines) {
        this.stderrBuffer = this.stderrBuffer.slice(-this.maxStderrLines);
      }
    }

    // Capture combined output for timeout/context (stdout + stderr)
    this.outputBuffer.push(...lines.map((line) => `[${stream}] ${line}`));
    if (this.outputBuffer.length > this.maxOutputLines) {
      this.outputBuffer = this.outputBuffer.slice(-this.maxOutputLines);
    }

    // Log dev server output (only visible when SF_LOG_LEVEL=debug)
    for (const line of lines) {
      this.logger.debug(`[Dev Server ${stream}] ${line}`);
    }
  }

  /**
   * Handles process exit event
   *
   * Cleans up resources and emits appropriate events
   *
   * @param code Exit code from the process
   * @param signal Signal that caused exit (if any)
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    this.logger.debug(`Dev server process exited with code ${code ?? 'null'}, signal ${signal ?? 'null'}`);

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

    // Parse and emit error if dev server crashed
    if (wasErrorExit && this.stderrBuffer.length > 0) {
      const stderrContent = this.stderrBuffer.join('\n');
      const parsedError = DevServerErrorParser.parseError(stderrContent, code, signal);

      this.logger.error(`Dev server error: ${parsedError.title}`);
      this.logger.debug(`Error type: ${parsedError.type}`);

      // Convert to SfError for proper error handling, attach parsed error for consumers
      const sfError = new SfError(`❌ ${parsedError.message}`, 'DevServerError', parsedError.suggestions) as SfError & {
        devServerError?: DevServerError;
      };
      sfError.devServerError = parsedError;

      this.emit('error', sfError);
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
    this.logger.error(`Dev server process error: ${error.message}`);

    const sfError = new SfError(`❌ Dev server process error: ${error.message}`, 'DevServerProcessError', [
      'Check that the command is correct in webapplication.json',
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
    this.logger.error('Dev server failed to start within timeout period');

    const error = new SfError(
      `❌ Dev server did not start within ${this.options.startupTimeout / 1000} seconds`,
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
