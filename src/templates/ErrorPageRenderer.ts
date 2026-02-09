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

// Use namespace import to avoid TS2305 when getErrorPageTemplate is not yet
// available in the published version.  The function is added by the W-21111977
// migration in @salesforce/webapp-experimental.  Once a version that includes
// it is published, the runtime check below will pick it up automatically.
import * as proxyExports from '@salesforce/webapp-experimental/proxy';
import type { DevServerError } from '../config/types.js';

/**
 * Load the error page template from @salesforce/webapp-experimental/proxy.
 * Returns null when the installed version does not yet export the function.
 */
function loadProxyTemplate(): string | null {
  try {
    const mod = proxyExports as unknown as Record<string, unknown>;
    const fn = mod['getErrorPageTemplate'];
    if (typeof fn === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = fn();
      if (typeof result === 'string') return result;
    }
  } catch {
    // Function not available in the installed version
  }
  return null;
}

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

  public constructor() {
    this.template = loadProxyTemplate() ?? ErrorPageRenderer.getMinimalFallbackTemplate();
  }

  /**
   * Minimal fallback template used when the main template file cannot be loaded.
   * This ensures the proxy can still display error pages even if the template is missing.
   */
  private static getMinimalFallbackTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{PAGE_TITLE}}</title>
  {{META_REFRESH}}
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 40px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #ff6b6b; }
    .status { color: #ffd93d; margin-bottom: 20px; }
    .info { background: #16213e; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .info p { margin: 8px 0; }
    code { background: #0f3460; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ERROR_TITLE}}</h1>
    <p class="status">{{ERROR_STATUS}}</p>
    <div class="info">
      {{MESSAGE_CONTENT}}
      <p><strong>Dev Server:</strong> <code>{{DEV_SERVER_URL}}</code></p>
      <p><strong>Proxy:</strong> <code>{{PROXY_URL}}</code> (port {{PROXY_PORT}})</p>
      <p><strong>Org:</strong> <code>{{ORG_TARGET}}</code></p>
      <p><strong>Script:</strong> <code>{{WORKSPACE_SCRIPT}}</code></p>
      <p><strong>Last Check:</strong> {{LAST_CHECK_TIME}}</p>
    </div>
    <p style="color:#888;font-size:14px;" class="{{AUTO_REFRESH_CLASS}}">{{AUTO_REFRESH_TEXT}}</p>
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
   * Render a dev server error page with stderr output and suggestions
   *
   * @param error - Parsed dev server error
   * @returns Rendered HTML string
   */
  public renderDevServerError(error: DevServerError): string {
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

    return html;
  }
}
