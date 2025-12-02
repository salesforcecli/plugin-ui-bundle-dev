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
import type { DevServerError } from '../config/types.js';
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
 *
 * Uses a single template with conditional sections for all error types
 */
export class ErrorPageRenderer {
  private template: string;
  private logger: Logger;

  public constructor() {
    this.logger = new Logger(true); // Enable debug for template loading

    // Load the HTML template
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatePath = join(currentDir, 'error-page.html');

    try {
      this.template = readFileSync(templatePath, 'utf-8');
      this.logger.debug('[ErrorPageRenderer] Template loaded successfully');
      this.logger.debug(`[ErrorPageRenderer] Template length: ${this.template.length} chars`);
    } catch (error) {
      this.logger.error('[ErrorPageRenderer] CRITICAL: Failed to load template!');
      this.logger.error(`[ErrorPageRenderer] Error: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`[ErrorPageRenderer] Path: ${templatePath}`);
      throw new Error('Failed to load error template');
    }
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
   * Render a simple dev server down error page
   *
   * @param data - The data to inject into the template
   * @returns Rendered HTML string
   */
  public render(data: ErrorPageData): string {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Extract port from proxy URL (e.g., "http://localhost:4545" -> "4545")
    const proxyPort = new URL(data.proxyUrl).port || '4545';

    return (
      this.template
        // Page metadata
        .replace(/\{\{PAGE_TITLE\}\}/g, 'Dev Server Unavailable')
        .replace(/\{\{META_REFRESH\}\}/g, '<meta http-equiv="refresh" content="3" />')

        // Header
        .replace(/\{\{ERROR_TITLE\}\}/g, 'No Dev Server Detected')
        .replace(/\{\{STATUS_CLASS\}\}/g, 'warning')
        .replace(/\{\{ERROR_STATUS\}\}/g, ErrorPageRenderer.escapeHtml(data.status))

        // Message content
        .replace(
          /\{\{MESSAGE_CONTENT\}\}/g,
          `
          <p>The proxy cannot connect to your dev server. This usually means:</p>
          <ul>
            <li>Your dev server isn't running yet</li>
            <li>The dev server is starting up (please wait)</li>
            <li>The dev server crashed or exited</li>
          </ul>
        `
        )

        // Diagnostics data
        .replace(/\{\{DEV_SERVER_URL\}\}/g, ErrorPageRenderer.escapeHtml(data.devServerUrl))
        .replace(/\{\{PROXY_URL\}\}/g, ErrorPageRenderer.escapeHtml(data.proxyUrl))
        .replace(/\{\{PROXY_PORT\}\}/g, proxyPort)
        .replace(/\{\{ORG_TARGET\}\}/g, ErrorPageRenderer.escapeHtml(data.orgTarget))
        .replace(/\{\{WORKSPACE_SCRIPT\}\}/g, ErrorPageRenderer.escapeHtml(data.workspaceScript))
        .replace(/\{\{LAST_CHECK_TIME\}\}/g, timestamp)

        // Section visibility (show simple, hide others)
        .replace(/\{\{SIMPLE_SECTION_CLASS\}\}/g, '')
        .replace(/\{\{RUNTIME_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{DEV_SERVER_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{SUGGESTIONS_SECTION_CLASS\}\}/g, '')

        // Auto-refresh
        .replace(/\{\{AUTO_REFRESH_CLASS\}\}/g, '')
        .replace(/\{\{AUTO_REFRESH_TEXT\}\}/g, 'Auto-refreshing every 3 seconds...')
    );
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

      const severityLabel = data.severity.toUpperCase();

      // Build suggestions list (just the <li> items, not the wrapping structure)
      const suggestionsList =
        data.suggestions.length > 0
          ? data.suggestions.map((s) => `<li>${ErrorPageRenderer.escapeHtml(s)}</li>`).join('\n')
          : '<li>No specific suggestions available. Check the error details and stack trace above.</li>';

      // Build error code badge if present
      const errorCodeBadge = data.errorCode
        ? ` <span class="code">${ErrorPageRenderer.escapeHtml(data.errorCode)}</span>`
        : '';

      // Use default proxy port for emergency commands
      const proxyPort = '4545';

      const html = this.template
        // Page metadata
        .replace(/\{\{PAGE_TITLE\}\}/g, 'Runtime Error')
        .replace(/\{\{META_REFRESH\}\}/g, '')

        // Header
        .replace(/\{\{ERROR_TITLE\}\}/g, ErrorPageRenderer.escapeHtml(data.errorType))
        .replace(/\{\{STATUS_CLASS\}\}/g, data.severity)
        .replace(/\{\{ERROR_STATUS\}\}/g, `${severityLabel} Error`)

        // Message content
        .replace(/\{\{ERROR_MESSAGE_TEXT\}\}/g, ErrorPageRenderer.escapeHtml(data.errorMessage))

        // Runtime error data
        .replace(/\{\{FORMATTED_STACK_HTML\}\}/g, data.formattedStackHtml)
        .replace(/\{\{ERROR_TYPE\}\}/g, ErrorPageRenderer.escapeHtml(data.errorType))
        .replace(/\{\{ERROR_CODE_BADGE\}\}/g, errorCodeBadge)
        .replace(/\{\{SEVERITY_LABEL\}\}/g, severityLabel)
        .replace(/\{\{TIMESTAMP_FORMATTED\}\}/g, data.timestampFormatted)
        .replace(/\{\{NODE_VERSION\}\}/g, ErrorPageRenderer.escapeHtml(data.metadata.nodeVersion))
        .replace(/\{\{PLATFORM\}\}/g, ErrorPageRenderer.escapeHtml(data.metadata.platform))
        .replace(/\{\{HEAP_USED_MB\}\}/g, String(data.metadata.heapUsedMB))
        .replace(/\{\{HEAP_TOTAL_MB\}\}/g, String(data.metadata.heapTotalMB))
        .replace(/\{\{PID\}\}/g, String(data.metadata.pid))
        .replace(/\{\{PROXY_PORT\}\}/g, proxyPort)

        // Suggestions
        .replace(/\{\{SUGGESTIONS_TITLE\}\}/g, 'How to Fix')
        .replace(/\{\{SUGGESTIONS_LIST\}\}/g, suggestionsList)

        // Section visibility (show runtime, hide others)
        .replace(/\{\{SIMPLE_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{RUNTIME_SECTION_CLASS\}\}/g, '')
        .replace(/\{\{DEV_SERVER_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{SUGGESTIONS_SECTION_CLASS\}\}/g, '')
        .replace(/\{\{AUTO_REFRESH_CLASS\}\}/g, 'hidden');

      this.logger.debug('[ErrorPageRenderer] Successfully rendered runtime error page');
      this.logger.debug(`[ErrorPageRenderer] Output length: ${html.length} chars`);

      return html;
    } catch (error) {
      this.logger.error('[ErrorPageRenderer] RENDER ERROR:');
      this.logger.error(String(error));
      throw error;
    }
  }

  /**
   * Render a dev server error page with stderr output and suggestions
   *
   * @param error - Parsed dev server error
   * @returns Rendered HTML string
   */
  public renderDevServerError(error: DevServerError): string {
    try {
      this.logger.debug('[ErrorPageRenderer] Starting renderDevServerError');
      this.logger.debug(`[ErrorPageRenderer] Error type: ${error.type}`);

      // Format suggestions list (just the <li> items, structure is in template)
      const suggestionsList = error.suggestions.map((s) => `<li>${ErrorPageRenderer.escapeHtml(s)}</li>`).join('\n');

      // Format stderr lines with proper escaping (just the text content)
      const stderrOutput = error.stderrLines.map((line) => ErrorPageRenderer.escapeHtml(line)).join('\n');

      // Use default proxy port for emergency commands
      const proxyPort = '4545';

      const html = this.template
        // Page metadata
        .replace(/\{\{PAGE_TITLE\}\}/g, 'Dev Server Error')
        .replace(/\{\{META_REFRESH\}\}/g, '<meta http-equiv="refresh" content="5" />')

        // Header
        .replace(/\{\{ERROR_TITLE\}\}/g, ErrorPageRenderer.escapeHtml(error.title))
        .replace(/\{\{STATUS_CLASS\}\}/g, 'error')
        .replace(/\{\{ERROR_STATUS\}\}/g, 'Error Detected')

        // Message content
        .replace(/\{\{ERROR_MESSAGE_TEXT\}\}/g, ErrorPageRenderer.escapeHtml(error.message))

        // Dev server error data
        .replace(/\{\{STDERR_OUTPUT\}\}/g, stderrOutput)
        .replace(/\{\{PROXY_PORT\}\}/g, proxyPort)

        // Suggestions
        .replace(/\{\{SUGGESTIONS_TITLE\}\}/g, 'How to Fix This')
        .replace(/\{\{SUGGESTIONS_LIST\}\}/g, suggestionsList)

        // Section visibility (show dev server error, hide others)
        .replace(/\{\{SIMPLE_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{RUNTIME_SECTION_CLASS\}\}/g, 'hidden')
        .replace(/\{\{DEV_SERVER_SECTION_CLASS\}\}/g, '')
        .replace(/\{\{SUGGESTIONS_SECTION_CLASS\}\}/g, '')

        // Auto-refresh
        .replace(/\{\{AUTO_REFRESH_CLASS\}\}/g, '')
        .replace(
          /\{\{AUTO_REFRESH_TEXT\}\}/g,
          'This page will auto-refresh every 5 seconds until the dev server starts successfully'
        );

      this.logger.debug('[ErrorPageRenderer] Successfully rendered dev server error page');
      return html;
    } catch (renderError) {
      this.logger.error('[ErrorPageRenderer] DEV SERVER ERROR RENDER ERROR:');
      this.logger.error(String(renderError));
      throw renderError;
    }
  }
}
