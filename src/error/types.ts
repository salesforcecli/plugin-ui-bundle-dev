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
 * Represents a parsed stack frame from a V8 stack trace
 */
export type StackFrame = {
  /**
   * Function name (e.g., "myFunction" or "anonymous")
   */
  functionName: string;
  /**
   * File path where the error occurred
   */
  fileName: string;
  /**
   * Line number in the file
   */
  lineNumber: number;
  /**
   * Column number in the line
   */
  columnNumber: number;
  /**
   * Whether this frame is from node_modules
   */
  isNodeModule: boolean;
  /**
   * Whether this frame is from Node.js internals
   */
  isNodeInternal: boolean;
  /**
   * Original raw stack line
   */
  raw: string;
};

/**
 * Formatted stack trace with both HTML and plain text representations
 */
export type FormattedStackTrace = {
  /**
   * HTML formatted stack trace with syntax highlighting
   */
  html: string;
  /**
   * Plain text formatted stack trace
   */
  text: string;
  /**
   * Parsed stack frames
   */
  frames: StackFrame[];
  /**
   * Number of filtered frames (node_modules, internals)
   */
  filteredCount: number;
};

/**
 * Error severity levels
 */
export type ErrorSeverity = 'critical' | 'error' | 'warning';

/**
 * Comprehensive error metadata captured from runtime errors
 */
export type ErrorMetadata = {
  /**
   * Error type/name (e.g., "TypeError", "ReferenceError")
   */
  type: string;
  /**
   * Error message
   */
  message: string;
  /**
   * Raw stack trace string
   */
  stack: string;
  /**
   * Formatted stack trace
   */
  formattedStack: FormattedStackTrace;
  /**
   * ISO timestamp when error occurred
   */
  timestamp: string;
  /**
   * Error severity level
   */
  severity: ErrorSeverity;
  /**
   * Node.js version
   */
  nodeVersion: string;
  /**
   * Operating system platform
   */
  platform: string;
  /**
   * Process ID
   */
  pid: number;
  /**
   * Memory usage at time of error
   */
  memoryUsage: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
  };
  /**
   * Error code if available
   */
  code?: string;
  /**
   * Context about where error occurred
   */
  context?: string;
  /**
   * Whether this was an unhandled rejection
   */
  isUnhandledRejection: boolean;
  /**
   * Original error object (for debugging)
   */
  originalError?: unknown;
};

/**
 * Data structure for rendering runtime error pages
 */
export type RuntimeErrorPageData = {
  /**
   * Error type/name
   */
  errorType: string;
  /**
   * Error message
   */
  errorMessage: string;
  /**
   * HTML formatted stack trace
   */
  formattedStackHtml: string;
  /**
   * Plain text stack trace for copying
   */
  formattedStackText: string;
  /**
   * ISO timestamp
   */
  timestamp: string;
  /**
   * Human-readable timestamp
   */
  timestampFormatted: string;
  /**
   * Error severity
   */
  severity: ErrorSeverity;
  /**
   * System metadata
   */
  metadata: {
    nodeVersion: string;
    platform: string;
    pid: number;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  /**
   * Contextual help suggestions
   */
  suggestions: string[];
  /**
   * Error code if available
   */
  errorCode?: string;
  /**
   * Full error report as JSON string (for export)
   */
  errorReportJson: string;
};

/**
 * Options for configuring global error capture
 */
export type GlobalErrorCaptureOptions = {
  /**
   * Whether to capture uncaught exceptions
   */
  captureExceptions?: boolean;
  /**
   * Whether to capture unhandled promise rejections
   */
  captureRejections?: boolean;
  /**
   * Whether to filter node_modules from stack traces
   */
  filterNodeModules?: boolean;
  /**
   * Whether to filter Node.js internals from stack traces
   */
  filterNodeInternals?: boolean;
  /**
   * Whether to exit process on critical errors
   */
  exitOnCritical?: boolean;
  /**
   * Custom error handler callback
   */
  onError?: ((metadata: ErrorMetadata) => void) | undefined;
  /**
   * Workspace root path for relative path display
   */
  workspaceRoot?: string;
};

/**
 * Options for stack trace formatting
 */
export type StackTraceFormatterOptions = {
  /**
   * Filter out node_modules frames
   */
  filterNodeModules?: boolean;
  /**
   * Filter out Node.js internal frames
   */
  filterNodeInternals?: boolean;
  /**
   * Maximum number of frames to display
   */
  maxFrames?: number;
  /**
   * Workspace root for relative path display
   */
  workspaceRoot?: string;
  /**
   * Enable HTML syntax highlighting
   */
  enableHtmlFormatting?: boolean;
};
