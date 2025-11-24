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

import { relative, isAbsolute } from 'node:path';
import type { StackFrame, FormattedStackTrace, StackTraceFormatterOptions } from './types.js';

/**
 * StackTraceFormatter parses and formats V8 stack traces into
 * developer-friendly, syntax-highlighted output for both HTML and terminal display.
 *
 * Features:
 * - Parses V8 stack trace format
 * - Filters node_modules and Node.js internals (configurable)
 * - Syntax highlighting (file paths, line numbers, function names)
 * - Relative path display from workspace root
 * - HTML and plain text output
 * - Smart truncation for long paths
 */
export class StackTraceFormatter {
  /**
   * Stack frame regex pattern for V8 stack traces
   * Matches patterns like:
   * - "at functionName (/path/to/file.ts:10:5)"
   * - "at /path/to/file.ts:10:5"
   * - "at async functionName (/path/to/file.ts:10:5)"
   */
  private static readonly STACK_FRAME_REGEX = /^\s*at\s+(?:(async)\s+)?(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;

  private readonly options: Required<StackTraceFormatterOptions>;

  public constructor(options: StackTraceFormatterOptions = {}) {
    this.options = {
      filterNodeModules: options.filterNodeModules ?? true,
      filterNodeInternals: options.filterNodeInternals ?? true,
      maxFrames: options.maxFrames ?? 50,
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
      enableHtmlFormatting: options.enableHtmlFormatting ?? true,
    };
  }

  /**
   * Create a formatted stack trace from an Error object
   *
   * @param error - Error object
   * @returns Formatted stack trace
   */
  public static formatError(error: Error, options?: StackTraceFormatterOptions): FormattedStackTrace {
    const formatter = new StackTraceFormatter(options);
    return formatter.format(error.stack ?? 'No stack trace available');
  }

  /**
   * Extract just the file location from an error for quick display
   *
   * @param error - Error object
   * @returns File location string (e.g., "file.ts:10:5")
   */
  public static extractErrorLocation(error: Error): string | null {
    if (!error.stack) return null;

    const formatter = new StackTraceFormatter();
    const lines = error.stack.split('\n');

    // Try to find the first non-internal frame
    for (const line of lines.slice(1)) {
      const frame = StackTraceFormatter.parseStackFrame(line);
      if (frame && !frame.isNodeInternal) {
        return `${formatter.getDisplayPath(frame.fileName)}:${frame.lineNumber}:${frame.columnNumber}`;
      }
    }

    return null;
  }

  /**
   * Parse a single stack frame line
   *
   * @param line - Stack frame line
   * @returns Parsed stack frame or null if invalid
   */
  private static parseStackFrame(line: string): StackFrame | null {
    const match = line.match(StackTraceFormatter.STACK_FRAME_REGEX);
    if (!match) return null;

    const [, , functionName, fileName, lineNumber, columnNumber] = match;

    const frame: StackFrame = {
      functionName: functionName?.trim() || 'anonymous',
      fileName: fileName.trim(),
      lineNumber: parseInt(lineNumber, 10),
      columnNumber: parseInt(columnNumber, 10),
      isNodeModule: fileName.includes('node_modules'),
      isNodeInternal: fileName.startsWith('node:') || fileName.startsWith('internal/'),
      raw: line,
    };

    return frame;
  }

  /**
   * Escape HTML special characters
   *
   * @param text - Text to escape
   * @returns Escaped HTML
   */
  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format a stack trace string into a structured, formatted output
   *
   * @param stackTrace - Raw stack trace string
   * @returns Formatted stack trace with HTML and text representations
   */
  public format(stackTrace: string): FormattedStackTrace {
    const lines = stackTrace.split('\n');
    const frames: StackFrame[] = [];
    let filteredCount = 0;

    // First line is usually the error message, skip it
    const stackLines = lines.slice(1);

    for (const line of stackLines) {
      const frame = StackTraceFormatter.parseStackFrame(line);
      if (!frame) continue;

      // Apply filters
      if (this.shouldFilterFrame(frame)) {
        filteredCount++;
        continue;
      }

      frames.push(frame);

      // Respect max frames limit
      if (frames.length >= this.options.maxFrames) {
        filteredCount += stackLines.length - frames.length - filteredCount;
        break;
      }
    }

    return {
      html: this.options.enableHtmlFormatting ? this.formatAsHtml(frames) : this.formatAsText(frames),
      text: this.formatAsText(frames),
      frames,
      filteredCount,
    };
  }

  /**
   * Determine if a frame should be filtered based on options
   *
   * @param frame - Stack frame to check
   * @returns True if frame should be filtered out
   */
  private shouldFilterFrame(frame: StackFrame): boolean {
    if (this.options.filterNodeModules && frame.isNodeModule) {
      return true;
    }
    if (this.options.filterNodeInternals && frame.isNodeInternal) {
      return true;
    }
    return false;
  }

  /**
   * Format frames as HTML with syntax highlighting
   *
   * @param frames - Stack frames to format
   * @returns HTML formatted stack trace
   */
  private formatAsHtml(frames: StackFrame[]): string {
    if (frames.length === 0) {
      return '<div class="stack-frame empty">No stack frames available</div>';
    }

    return frames
      .map((frame, index) => {
        const displayPath = this.getDisplayPath(frame.fileName);

        return `<div class="stack-frame" data-frame-index="${index}">
  <span class="frame-number">${index + 1}.</span>
  <span class="frame-function">${StackTraceFormatter.escapeHtml(frame.functionName)}</span>
  <span class="frame-at">at</span>
  <span class="frame-location">
    <span class="frame-file">${StackTraceFormatter.escapeHtml(
      displayPath
    )}</span><span class="frame-separator">:</span><span class="frame-line">${
          frame.lineNumber
        }</span><span class="frame-separator">:</span><span class="frame-column">${frame.columnNumber}</span>
  </span>
</div>`;
      })
      .join('\n');
  }

  /**
   * Format frames as plain text
   *
   * @param frames - Stack frames to format
   * @returns Plain text formatted stack trace
   */
  private formatAsText(frames: StackFrame[]): string {
    if (frames.length === 0) {
      return 'No stack frames available';
    }

    return frames
      .map((frame, index) => {
        const displayPath = this.getDisplayPath(frame.fileName);
        const padding = ' '.repeat(String(frames.length).length - String(index + 1).length);
        return `  ${padding}${index + 1}. ${frame.functionName} at ${displayPath}:${frame.lineNumber}:${
          frame.columnNumber
        }`;
      })
      .join('\n');
  }

  /**
   * Get display path for a file (relative to workspace if possible)
   *
   * @param filePath - Absolute file path
   * @returns Display path (relative or truncated)
   */
  private getDisplayPath(filePath: string): string {
    // Handle Node.js internals
    if (filePath.startsWith('node:') || filePath.startsWith('internal/')) {
      return filePath;
    }

    // Try to make relative to workspace root
    if (isAbsolute(filePath) && this.options.workspaceRoot) {
      try {
        const rel = relative(this.options.workspaceRoot, filePath);
        // Only use relative path if it doesn't start with .. (i.e., it's within workspace)
        if (!rel.startsWith('..')) {
          return rel;
        }
      } catch {
        // Fall through to absolute path
      }
    }

    // Truncate long absolute paths from the left
    if (filePath.length > 80) {
      return '...' + filePath.slice(-77);
    }

    return filePath;
  }
}
