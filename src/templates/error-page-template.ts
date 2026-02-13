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

/**
 * HTML template for dev server error pages.
 * Placeholders: {{PAGE_TITLE}}, {{META_REFRESH}}, {{ERROR_TITLE}}, {{STATUS_CLASS}},
 * {{ERROR_STATUS}}, {{MESSAGE_CONTENT}}, {{ERROR_MESSAGE_TEXT}}, {{STDERR_OUTPUT}},
 * {{SUGGESTIONS_TITLE}}, {{SUGGESTIONS_LIST}}, {{DEV_SERVER_URL}}, {{PROXY_URL}},
 * {{PROXY_PORT}}, {{ORG_TARGET}}, {{WORKSPACE_SCRIPT}}, {{LAST_CHECK_TIME}},
 * {{SIMPLE_SECTION_CLASS}}, {{RUNTIME_SECTION_CLASS}}, {{DEV_SERVER_SECTION_CLASS}},
 * {{SUGGESTIONS_SECTION_CLASS}}, {{AUTO_REFRESH_CLASS}}, {{AUTO_REFRESH_TEXT}}
 */
export const ERROR_PAGE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{PAGE_TITLE}} - Salesforce Local Dev Proxy</title>
    {{META_REFRESH}}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1e2a47 0%, #2d3e5f 100%); color: #333; min-height: 100vh; padding: 20px; }
      .main-container { max-width: 1400px; margin: 0 auto; background: #e8e8e8; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); overflow: hidden; }
      .top-header { background: #e8e8e8; padding: 30px 40px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ccc; }
      .header-left h1 { color: #1a1a1a; font-size: 2.2em; font-weight: 600; margin-bottom: 8px; }
      .header-left .subtitle { color: #666; font-size: 1.05em; }
      .status-badge { padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 0.95em; }
      .status-badge.warning { background: #fff3e0; color: #e65100; }
      .status-badge.error { background: #ffebee; color: #c62828; }
      .content-wrapper { display: grid; grid-template-columns: 1fr 308px; gap: 0; background: #e8e8e8; }
      .main-content { padding: 40px; background: white; border-right: 1px solid #ccc; }
      .diagnostics-panel { padding: 40px 20px; background: #f5f5f5; }
      .content-section { margin-bottom: 30px; }
      .content-section h2 { color: #1a1a1a; font-size: 1.4em; margin-bottom: 15px; font-weight: 600; }
      .content-section h3 { color: #1a1a1a; font-size: 1.1em; margin-bottom: 12px; font-weight: 600; }
      .content-section p { color: #555; line-height: 1.6; margin-bottom: 15px; }
      .content-section ul { list-style: disc; padding-left: 25px; color: #555; line-height: 1.8; }
      .message-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 20px; border-radius: 6px; margin-bottom: 25px; }
      .message-box p { color: #555; margin: 0; }
      .code-output { background: #1e1e1e; border-radius: 8px; padding: 20px; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 0.9em; line-height: 1.5; margin: 20px 0; }
      .code-output pre { color: #ff6b6b; margin: 0; white-space: pre-wrap; word-wrap: break-word; }
      .suggestions-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 20px; border-radius: 6px; margin: 20px 0; }
      .suggestions-box h3 { color: #1a1a1a; font-size: 1.1em; margin-bottom: 15px; }
      .suggestions-box ul { list-style: none; padding: 0; }
      .suggestions-box li { padding: 8px 0; color: #555; line-height: 1.6; }
      .diagnostics-panel h2 { color: #1a1a1a; font-size: 1.15em; margin-bottom: 18px; font-weight: 600; }
      .diagnostics-list { list-style: none; padding: 0; margin-bottom: 20px; }
      .diagnostics-list li { margin-bottom: 12px; color: #555; line-height: 1.4; font-size: 0.9em; }
      .diagnostics-list .label { display: block; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; font-size: 0.85em; }
      .diagnostics-list .value { font-family: monospace; font-size: 0.85em; color: #666; word-break: break-word; }
      .diagnostics-list .value code { background: #263238; color: #aed581; padding: 2px 5px; border-radius: 3px; font-size: 0.8em; }
      .emergency-commands { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin-top: 20px; }
      .emergency-commands h3 { color: #856404; font-size: 0.8em; margin: 0 0 8px 0; font-weight: 600; }
      .emergency-commands p { color: #856404; font-size: 0.75em; margin: 0 0 8px 0; }
      .command-box { background: #263238; color: #aed581; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 0.72em; word-break: break-all; }
      .footer-section { background: #e8e8e8; padding: 20px 40px; border-top: 1px solid #ccc; text-align: center; }
      .help-text { color: #666; font-size: 0.9em; line-height: 1.5; }
      .help-text strong { color: #333; }
      .hidden { display: none; }
      .auto-refresh-indicator { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px 16px; border-radius: 6px; margin: 20px 0; color: #2e7d32; font-size: 0.9em; }
      @media (max-width: 900px) { .content-wrapper { grid-template-columns: 1fr; } .main-content { border-right: none; border-bottom: 1px solid #ccc; } }
    </style>
  </head>
  <body>
    <div class="main-container">
      <div class="top-header">
        <div class="header-left">
          <h1>Local Dev Proxy</h1>
          <p class="subtitle">Salesforce preview → Proxy → Your dev server</p>
        </div>
        <div class="status-badge {{STATUS_CLASS}}">{{ERROR_STATUS}}</div>
      </div>
      <div class="content-wrapper">
        <div class="main-content">
          <div id="simple-error-section" class="{{SIMPLE_SECTION_CLASS}}">
            <div class="content-section">
              <h2>{{ERROR_TITLE}}</h2>
              {{MESSAGE_CONTENT}}
            </div>
            <div class="auto-refresh-indicator {{AUTO_REFRESH_CLASS}}">{{AUTO_REFRESH_TEXT}}</div>
            <div class="suggestions-box">
              <h3>What to do next</h3>
              <ul>
                <li>Start your dev server using: <code>npm run dev</code> or <code>yarn dev</code></li>
                <li>Verify your dev server is running on the correct port</li>
                <li>Check webapplication.json for the correct dev server URL</li>
                <li>This page will auto-refresh when the server is detected</li>
              </ul>
            </div>
          </div>
          <div id="runtime-error-section" class="{{RUNTIME_SECTION_CLASS}}"></div>
          <div id="dev-server-error-section" class="{{DEV_SERVER_SECTION_CLASS}}">
            <div class="content-section">
              <h2>⚠️ {{ERROR_TITLE}}</h2>
              <div class="message-box">
                <p>{{ERROR_MESSAGE_TEXT}}</p>
              </div>
            </div>
            <div class="content-section">
              <h3>Error Output</h3>
              <div class="code-output">
                <pre>{{STDERR_OUTPUT}}</pre>
              </div>
            </div>
            <div class="auto-refresh-indicator {{AUTO_REFRESH_CLASS}}">{{AUTO_REFRESH_TEXT}}</div>
            <div class="suggestions-box {{SUGGESTIONS_SECTION_CLASS}}">
              <h3>{{SUGGESTIONS_TITLE}}</h3>
              <ul>
                {{SUGGESTIONS_LIST}}
              </ul>
            </div>
          </div>
        </div>
        <div class="diagnostics-panel">
          <h2>Diagnostics</h2>
          <ul class="diagnostics-list">
            <li class="{{SIMPLE_SECTION_CLASS}}"><span class="label">Dev Server URL:</span><span class="value"><code>{{DEV_SERVER_URL}}</code></span></li>
            <li class="{{SIMPLE_SECTION_CLASS}}"><span class="label">Proxy URL:</span><span class="value"><code>{{PROXY_URL}}</code></span></li>
            <li class="{{SIMPLE_SECTION_CLASS}}"><span class="label">Workspace Script:</span><span class="value"><code>{{WORKSPACE_SCRIPT}}</code></span></li>
            <li class="{{SIMPLE_SECTION_CLASS}}"><span class="label">Target Org:</span><span class="value">{{ORG_TARGET}}</span></li>
            <li class="{{SIMPLE_SECTION_CLASS}}"><span class="label">Last Check:</span><span class="value">{{LAST_CHECK_TIME}}</span></li>
          </ul>
          <div class="emergency-commands">
            <h3>⚠️ If Ctrl+C doesn't work</h3>
            <p>Copy and run this command in a new terminal to force-stop the proxy:</p>
            <div class="command-box">lsof -ti:{{PROXY_PORT}} | xargs kill -9</div>
          </div>
        </div>
      </div>
      <div class="footer-section">
        <p class="help-text">Salesforce Web App Development Proxy &nbsp;•&nbsp; Press <strong>Ctrl+C</strong> in the terminal to stop the proxy</p>
      </div>
    </div>
  </body>
</html>`;
