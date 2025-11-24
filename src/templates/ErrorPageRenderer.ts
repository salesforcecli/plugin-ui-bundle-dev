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

export type ErrorPageData = {
  status: string;
  devServerUrl: string;
  workspaceScript: string;
  proxyUrl: string;
  orgTarget: string;
};

/**
 * Renders HTML error pages for browser display when dev server is unavailable
 */
export class ErrorPageRenderer {
  private template: string;

  public constructor() {
    // Load the HTML template
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const templatePath = join(currentDir, 'error-page.html');
    this.template = readFileSync(templatePath, 'utf-8');
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
}
