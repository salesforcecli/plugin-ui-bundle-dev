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

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuntimeErrorPageData } from '../error/types.js';
import { Logger } from '../utils/Logger.js';

export type ErrorPageData = {
  status: string;
  devServerUrl: string;
  workspaceScript: string;
  proxyUrl: string;
  orgTarget: string;
};

/**
 * Renders HTML error pages for browser display when dev server is unavailable
 * or when runtime errors occur
 */
export class ErrorPageRenderer {
  private template: string;
  private runtimeErrorTemplate: string;
  private logger: Logger;

  public constructor() {
    this.logger = new Logger(true); // Enable debug for template loading

    // Load the HTML templates
    const currentDir = dirname(fileURLToPath(import.meta.url));

    // Dev server error template
    const templatePath = join(currentDir, 'error-page.html');
    this.template = readFileSync(templatePath, 'utf-8');

    // Runtime error template
    const runtimeTemplatePath = join(currentDir, 'runtime-error-page.html');
    try {
      this.runtimeErrorTemplate = readFileSync(runtimeTemplatePath, 'utf-8');
      this.logger.debug('[ErrorPageRenderer] Runtime error template loaded successfully');
      this.logger.debug(`[ErrorPageRenderer] Template length: ${this.runtimeErrorTemplate.length} chars`);
    } catch (error) {
      // Fallback if runtime error template doesn't exist
      this.logger.error('[ErrorPageRenderer] WARNING: Failed to load runtime error template, using fallback!');
      this.logger.error(`[ErrorPageRenderer] Error: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`[ErrorPageRenderer] Path: ${runtimeTemplatePath}`);
      this.runtimeErrorTemplate = this.template;
    }
  }

  /**
   * Render a simple error page for when template loading fails
   *
   * @param devServerUrl - The dev server URL that's unreachable
   * @returns Simple HTML error page
   */
  public static renderFallback(devServerUrl: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dev Server Unavailable</title>
    <style>
        body { font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
        h1 { color: #c62828; }
        code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    </style>
    <script>setTimeout(() => window.location.reload(), 5000);</script>
</head>
<body>
    <h1>Dev Server Unavailable</h1>
    <p>Cannot connect to dev server at <code>${devServerUrl}</code></p>
    <p>Start your dev server and this page will auto-refresh.</p>
    <p><em>Refreshing in 5 seconds...</em></p>
</body>
</html>`;
  }

  /**
   * Render a fallback runtime error page when the template is unavailable
   *
   * @param errorType - Error type (e.g., TypeError)
   * @param errorMessage - Error message
   * @param stackTrace - Stack trace text
   * @returns Simple HTML error page
   */
  public static renderRuntimeErrorFallback(errorType: string, errorMessage: string, stackTrace: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Runtime Error</title>
    <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px; 
          max-width: 1200px; 
          margin: 0 auto;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        h1 { color: #c62828; margin-bottom: 20px; }
        .error-type {
          background: #ffebee;
          color: #c62828;
          padding: 8px 16px;
          border-radius: 6px;
          display: inline-block;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .error-message {
          background: #fff3e0;
          padding: 20px;
          border-left: 4px solid #ff9800;
          margin-bottom: 30px;
          border-radius: 4px;
        }
        .stack-trace { 
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 20px;
          border-radius: 8px;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
          line-height: 1.6;
        }
        h2 {
          color: #032d60;
          margin-top: 30px;
          margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
      <h1>⚠️ Runtime Error</h1>
      <div class="error-type">${errorType}</div>
      <div class="error-message">
        <strong>Message:</strong><br>
        ${errorMessage}
      </div>
      <h2>Stack Trace</h2>
      <div class="stack-trace">${stackTrace}</div>
      <p style="margin-top: 30px; color: #666;">
        Check the console and logs for more details.
      </p>
    </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters for safe display
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
   * Render the error page with provided data
   *
   * @param data - The data to inject into the template
   * @returns Rendered HTML string
   */
  public render(data: ErrorPageData): string {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    return this.template
      .replace(/\{\{STATUS\}\}/g, data.status)
      .replace(/\{\{DEV_SERVER_URL\}\}/g, data.devServerUrl)
      .replace(/\{\{WORKSPACE_SCRIPT\}\}/g, data.workspaceScript)
      .replace(/\{\{PROXY_URL\}\}/g, data.proxyUrl)
      .replace(/\{\{ORG_TARGET\}\}/g, data.orgTarget)
      .replace(/\{\{TIMESTAMP\}\}/g, timestamp);
  }

  /**
   * Render a runtime error page with comprehensive error details
   *
   * @param data - Runtime error data
   * @returns Rendered HTML string
   */
  public renderRuntimeError(data: RuntimeErrorPageData): string {
    try {
      this.logger.debug('[ErrorPageRenderer] Starting renderRuntimeError');
      this.logger.debug(`[ErrorPageRenderer] Template loaded: ${this.runtimeErrorTemplate ? 'YES' : 'NO'}`);
      this.logger.debug(`[ErrorPageRenderer] Template length: ${this.runtimeErrorTemplate?.length ?? 0} chars`);

      const severityLabel = data.severity.toUpperCase();
      const suggestions = data.suggestions
        .map((s) => `<li>${ErrorPageRenderer.escapeHtml(s)}</li>`)
        .join('\n              ');

      // Handle optional error code
      const errorCodeBadge = data.errorCode
        ? `<span class="error-type-badge">${ErrorPageRenderer.escapeHtml(data.errorCode)}</span>`
        : '';

      let html = this.runtimeErrorTemplate
        .replace(/\{\{ERROR_TYPE\}\}/g, ErrorPageRenderer.escapeHtml(data.errorType))
        .replace(/\{\{ERROR_MESSAGE\}\}/g, ErrorPageRenderer.escapeHtml(data.errorMessage))
        .replace(/\{\{FORMATTED_STACK_HTML\}\}/g, data.formattedStackHtml)
        .replace(/\{\{FORMATTED_STACK_TEXT\}\}/g, ErrorPageRenderer.escapeHtml(data.formattedStackText))
        .replace(/\{\{TIMESTAMP_FORMATTED\}\}/g, data.timestampFormatted)
        .replace(/\{\{SEVERITY\}\}/g, data.severity)
        .replace(/\{\{SEVERITY_LABEL\}\}/g, severityLabel)
        .replace(/\{\{NODE_VERSION\}\}/g, ErrorPageRenderer.escapeHtml(data.metadata.nodeVersion))
        .replace(/\{\{PLATFORM\}\}/g, ErrorPageRenderer.escapeHtml(data.metadata.platform))
        .replace(/\{\{PID\}\}/g, String(data.metadata.pid))
        .replace(/\{\{HEAP_USED_MB\}\}/g, String(data.metadata.heapUsedMB))
        .replace(/\{\{HEAP_TOTAL_MB\}\}/g, String(data.metadata.heapTotalMB))
        .replace(/\{\{RSS_MB\}\}/g, String(data.metadata.rssMB))
        .replace(/\{\{SUGGESTIONS\}\}/g, suggestions)
        .replace(/\{\{ERROR_REPORT_JSON\}\}/g, ErrorPageRenderer.escapeHtml(data.errorReportJson));

      // Remove conditional blocks for error code
      html = html.replace(/\{\{#ERROR_CODE\}\}[\s\S]*?\{\{\/ERROR_CODE\}\}/g, errorCodeBadge);

      this.logger.debug('[ErrorPageRenderer] Successfully rendered runtime error page');
      this.logger.debug(`[ErrorPageRenderer] Output length: ${html.length} chars`);

      return html;
    } catch (error) {
      this.logger.error('[ErrorPageRenderer] RENDER ERROR:');
      this.logger.error(String(error));
      throw error;
    }
  }
}
