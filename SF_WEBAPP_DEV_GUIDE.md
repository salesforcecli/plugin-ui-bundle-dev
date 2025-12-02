# Salesforce Webapp Dev Command - Complete Guide

> **A comprehensive guide for developers building and deploying web applications with Salesforce integration**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [What We Built](#what-we-built)
3. [How It Works](#how-it-works)
4. [Getting Started](#getting-started)
5. [Building the Plugin](#building-the-plugin)
6. [Using the Command](#using-the-command)
7. [File Structure & Components](#file-structure--components)
8. [VSCode Integration](#vscode-integration)
9. [Advanced Features](#advanced-features)
10. [Troubleshooting](#troubleshooting)
11. [FAQ](#faq)

---

## Overview

### What Is This?

The `sf webapp dev` command is a CLI tool that lets you develop modern web applications (React, Vue, Angular, etc.) with seamless Salesforce integration. It handles all the complexity of authentication, routing, and hot module replacement, so you can focus on building your app.

### Why Do You Need This?

**Traditional Approach (Pain Points):**
- ❌ Manually configure authentication tokens
- ❌ Set up CORS proxies
- ❌ Restart server for every change
- ❌ Copy/paste session IDs
- ❌ Complex build and deploy workflows

**With `sf webapp dev`:**
- ✅ Automatic Salesforce authentication injection
- ✅ Intelligent request routing (dev server vs Salesforce)
- ✅ Hot module replacement (HMR) support
- ✅ Real-time error detection and display
- ✅ One command to start everything
- ✅ Works with any web framework

---

## What We Built

### Core Features

#### 1. **Authentication Manager**
Automatically handles Salesforce authentication so your app can make API calls without manual token management.

**What it does:**
- Retrieves and refreshes access tokens from Salesforce
- Injects authentication headers into API requests
- Handles token expiration gracefully
- Works with any Salesforce org

#### 2. **Intelligent Proxy Server**
Acts as a middleman between your dev server and Salesforce, routing requests to the right destination.

**What it does:**
- Routes static assets to your dev server (localhost:5173, etc.)
- Routes API calls (`/services/data/...`) to Salesforce
- Injects authentication headers automatically
- Supports WebSocket connections for HMR
- Monitors dev server health and shows status pages

#### 3. **Dev Server Manager**
Manages your local development server (npm run dev, yarn dev, etc.) lifecycle.

**What it does:**
- Spawns your dev server process
- Detects when the server is ready
- Auto-restarts on crashes (with configurable retry limits)
- Captures and displays server logs
- Handles graceful shutdown

#### 4. **Runtime Error Capture & Display**
Catches errors in your Node.js code and displays them in a beautiful, developer-friendly UI in the browser.

**What it does:**
- Captures uncaught exceptions and promise rejections
- Formats stack traces with file locations
- Shows error details in a clean browser UI
- Provides fix suggestions based on error type
- Auto-refreshes when errors are fixed

#### 5. **Manifest Hot Reload**
Watches your `webapp.json` configuration file and applies changes without restarting the command.

**What it does:**
- Detects when `webapp.json` changes
- Updates dev server URL on the fly
- Warns when changes require restart
- Validates new configuration

#### 6. **Request Router**
Intelligently decides where each HTTP request should go.

**What it does:**
- Routes based on URL patterns (`/services/*` → Salesforce)
- Routes based on file extensions (`.js`, `.css` → dev server)
- Handles WebSocket upgrades for HMR
- Configurable routing rules

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Browser                          │
│              http://localhost:4545                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ All requests go here
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Proxy Server (Port 4545)                    │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Request Router - Decides Where to Go       │    │
│  └─────────────────┬────────────────┬─────────────────┘    │
│                    │                 │                       │
│         Routes to Dev Server    Routes to Salesforce        │
└────────────────────┼─────────────────┼───────────────────────┘
                     │                 │
        ┌────────────▼────────┐       │
        │   Dev Server        │       │
        │  (Your Framework)   │       │
        │  localhost:5173     │       │
        │                     │       │
        │  - React/Vue/etc.   │       │
        │  - Hot Reload       │       │
        │  - Static Assets    │       │
        └─────────────────────┘       │
                                      │
                        ┌─────────────▼────────────┐
                        │   Salesforce Instance    │
                        │                          │
                        │  + Auth Headers Injected │
                        │  + API Calls             │
                        │  + Data Queries          │
                        └──────────────────────────┘
```

### Request Flow Example

**Example 1: Loading Your App's JavaScript**
```
1. Browser: GET http://localhost:4545/main.js
   ↓
2. Proxy Router: "This is a .js file → Route to Dev Server"
   ↓
3. Dev Server (localhost:5173): Returns main.js
   ↓
4. Proxy: Forwards response back to browser
   ↓
5. Browser: Executes JavaScript
```

**Example 2: Making a Salesforce API Call**
```
1. Browser: GET http://localhost:4545/services/data/v60.0/sobjects/Account
   ↓
2. Proxy Router: "This is /services/* → Route to Salesforce"
   ↓
3. Auth Manager: Adds headers { Authorization: "Bearer xyz..." }
   ↓
4. Salesforce: Processes authenticated request
   ↓
5. Proxy: Forwards Salesforce response to browser
   ↓
6. Browser: Receives Account data
```

### What Happens When You Run `sf webapp dev`

```
Step 1: Load webapp.json
        - Read configuration
        - Validate manifest structure
        - Start watching for changes

Step 2: Determine Dev Server
        - Option A: Use --url flag (explicit URL)
        - Option B: Use dev.url from webapp.json
        - Option C: Spawn dev.command (npm run dev, etc.)

Step 3: Initialize Authentication
        - Get Salesforce org connection
        - Retrieve access token
        - Set up auth manager

Step 4: Start Proxy Server
        - Listen on port 4545 (default)
        - Set up request routing
        - Start health checks

Step 5: Open Browser
        - Launch http://localhost:4545
        - Your app loads with Salesforce auth!

Step 6: Development Loop
        - Make changes to your code
        - Dev server hot-reloads
        - Proxy continues working
        - Errors caught and displayed
```

---

## Getting Started

### Prerequisites

Before you start, make sure you have:

1. **Node.js 18+** installed
2. **Salesforce CLI** installed (`sf` command available)
3. **A Salesforce org** authorized
4. **A web application** (React, Vue, Angular, vanilla JS, etc.)

### Quick Start (5 Minutes)

**1. Create your web app** (if you don't have one):
```bash
# React example
npm create vite@latest my-salesforce-app -- --template react
cd my-salesforce-app
npm install
```

**2. Create webapp.json** in your project root:
```json
{
  "name": "mySalesforceApp",
  "label": "My Salesforce App",
  "version": "1.0.0",
  "apiVersion": "60.0",
  "outputDir": "dist",
  "dev": {
    "command": "npm run dev"
  }
}
```

**3. Authorize a Salesforce org:**
```bash
sf org login web --alias myorg
sf org default --org myorg
```

**4. Start developing:**
```bash
sf webapp dev --name mySalesforceApp --target-org myorg --open
```

That's it! Your browser will open to `http://localhost:4545` with your app running and Salesforce authentication ready.

---

## Building the Plugin

### For Plugin Developers

If you're working on the plugin itself or want to build from source:

#### 1. Clone the Repository
```bash
git clone https://github.com/salesforcecli/plugin-webapp.git
cd plugin-webapp
```

#### 2. Install Dependencies
```bash
# Using yarn (recommended)
yarn install

# Or npm
npm install
```

#### 3. Build the Plugin
```bash
# Full build (compile + lint)
yarn build

# Just compile TypeScript
yarn compile

# Watch mode for development
yarn compile --watch
```

#### 4. Run Tests
```bash
# All tests
yarn test

# Unit tests only
yarn test:only

# With coverage
yarn test --coverage

# Watch mode
yarn test --watch
```

#### 5. Link for Local Development
```bash
# Link the plugin to your Salesforce CLI
sf plugins link .

# Verify it's linked
sf plugins --core
```

#### 6. Use Your Local Build
```bash
# Now you can use your local version
sf webapp dev --name myApp --target-org myOrg
```

### Build Scripts Explained

| Script | What It Does |
|--------|--------------|
| `yarn build` | Compiles TypeScript, copies templates/schemas, runs linting |
| `yarn compile` | Only compiles TypeScript to JavaScript |
| `yarn lint` | Runs ESLint on source and test files |
| `yarn format` | Formats code with Prettier |
| `yarn test` | Runs all tests (unit + integration) |
| `yarn clean` | Removes build artifacts |

### Build Artifacts

After building, these directories are created:

- **`lib/`** - Compiled JavaScript files
- **`lib/schemas/`** - JSON schema files for validation
- **`lib/templates/`** - HTML templates for error pages

---

## Using the Command

### Basic Usage

```bash
sf webapp dev --name <webapp-name> --target-org <org-alias>
```

### Command Options

#### Required Options

| Option | Description | Example |
|--------|-------------|---------|
| `--name` | Name of your webapp (from webapp.json) | `--name myApp` |
| `--target-org` | Salesforce org to connect to | `--target-org myOrg` |

#### Optional Options

| Option | Default | Description |
|--------|---------|-------------|
| `--url` | (auto-detect) | Explicit dev server URL | `--url http://localhost:3000` |
| `--port` | 4545 | Proxy server port | `--port 8080` |
| `--open` | false | Open browser automatically | `--open` |
| `--debug` | false | Enable debug logging | `--debug` |

### Common Usage Patterns

#### Pattern 1: React with Vite (Default)
```bash
# webapp.json
{
  "dev": {
    "command": "npm run dev"
  }
}

# Run
sf webapp dev --name myReactApp --target-org myOrg --open
```

#### Pattern 2: Explicit URL (Dev Server Already Running)
```bash
# Start your dev server first
npm run dev  # Running on localhost:5173

# Then run the proxy
sf webapp dev --name myApp --target-org myOrg --url http://localhost:5173
```

#### Pattern 3: Custom Port
```bash
# Useful in Code Builder or when 4545 is taken
sf webapp dev --name myApp --target-org myOrg --port 8080
```

#### Pattern 4: Vue with Vite
```bash
# webapp.json
{
  "dev": {
    "command": "npm run dev"
  }
}

# Run
sf webapp dev --name myVueApp --target-org myOrg
```

#### Pattern 5: Angular with Custom Port
```bash
# webapp.json
{
  "dev": {
    "url": "http://localhost:4200"
  }
}

# Run
sf webapp dev --name myNgApp --target-org myOrg
```

### What You'll See

**Console Output:**
```bash
$ sf webapp dev --name testApp --target-org myOrg --open

✅ Dev server detected at http://localhost:5173/
✓ Dev server is responding at: http://localhost:5173/

✓ Ready for development!

Proxy URL: http://localhost:4545 (open this in your browser)
Dev server URL: http://localhost:5173/

Press Ctrl+C to stop the server
```

**Browser:**
- Opens to `http://localhost:4545`
- Your app loads and runs normally
- Salesforce API calls work automatically
- Hot reload works (changes reflect immediately)

---

## File Structure & Components

### Directory Structure

```
plugin-webapp/
├── src/                          # Source code
│   ├── commands/                 # CLI command implementations
│   │   └── webapp/
│   │       └── dev.ts            # Main dev command
│   ├── auth/                     # Authentication management
│   │   └── AuthManager.ts        # Handles Salesforce auth
│   ├── proxy/                    # Proxy server
│   │   ├── ProxyServer.ts        # Main proxy logic
│   │   └── RequestRouter.ts      # Request routing logic
│   ├── server/                   # Dev server management
│   │   └── DevServerManager.ts  # Spawns and monitors dev server
│   ├── error/                    # Error handling
│   │   ├── GlobalErrorCapture.ts     # Catches Node.js errors
│   │   ├── StackTraceFormatter.ts    # Formats stack traces
│   │   └── ErrorPageRenderer.ts      # Renders error HTML
│   ├── config/                   # Configuration
│   │   ├── ManifestWatcher.ts    # Watches webapp.json
│   │   └── types.ts              # TypeScript types
│   ├── schemas/                  # JSON schemas
│   │   └── webapp-manifest.json  # webapp.json validation
│   └── templates/                # HTML templates
│       └── runtime-error-page.html   # Error page UI
├── messages/                     # User-facing messages
│   └── webapp.dev.md            # Command messages
├── test/                         # Test files
├── docs/                         # Documentation
└── package.json                  # Package configuration
```

### Key Files Explained

#### 1. **`src/commands/webapp/dev.ts`**
**What it does:** The main command entry point. Orchestrates everything.

**Responsibilities:**
- Parses command-line arguments
- Loads and validates `webapp.json`
- Coordinates all components (auth, proxy, dev server)
- Handles shutdown and cleanup
- Manages manifest hot reload

**When you run:** `sf webapp dev`, this file executes.

---

#### 2. **`src/auth/AuthManager.ts`**
**What it does:** Manages Salesforce authentication throughout the session.

**Responsibilities:**
- Retrieves access tokens from org connection
- Provides auth headers for each request
- Handles token refresh if needed
- Returns proper error responses for auth failures

**Why it matters:** Without this, your API calls to Salesforce would fail with 401 Unauthorized.

---

#### 3. **`src/proxy/ProxyServer.ts`**
**What it does:** The HTTP proxy that routes requests between browser, dev server, and Salesforce.

**Responsibilities:**
- Listens on port 4545 (by default)
- Routes requests using RequestRouter
- Injects authentication headers
- Handles WebSocket upgrades for HMR
- Monitors dev server health
- Displays error pages when dev server is down
- Manages graceful shutdown

**Why it matters:** This is the core component that makes everything work together seamlessly.

---

#### 4. **`src/proxy/RequestRouter.ts`**
**What it does:** Decides where each HTTP request should go.

**Routing Logic:**
- **Salesforce API patterns** → Salesforce
  - `/services/data/*`
  - `/services/apexrest/*`
  - `/lightning/*`
  
- **Dev server patterns** → Dev Server
  - `/@vite/*` (Vite HMR)
  - `/__vite_ping` (Vite health check)
  - `/src/*` (source files)
  - File extensions: `.js`, `.css`, `.html`, `.json`, etc.

- **Default** → Dev Server (for index.html and app routes)

**Why it matters:** Intelligent routing means you don't have to configure anything manually.

---

#### 5. **`src/server/DevServerManager.ts`**
**What it does:** Manages your local development server process.

**Responsibilities:**
- Spawns the dev server (`npm run dev`, etc.)
- Detects when server is ready by polling the URL
- Captures stdout/stderr logs
- Auto-restarts on crashes (up to 3 attempts)
- Handles intentional shutdowns (Ctrl+C)
- Cleans up process on exit

**Why it matters:** You don't have to manually start and stop your dev server in a separate terminal.

---

#### 6. **`src/error/GlobalErrorCapture.ts`**
**What it does:** Catches runtime errors in your Node.js process.

**Responsibilities:**
- Listens for uncaught exceptions
- Listens for unhandled promise rejections
- Formats error metadata (message, stack, timestamp, etc.)
- Filters out intentional exits (Ctrl+C)
- Emits events for error display
- Prevents process crashes

**Why it matters:** Instead of cryptic stack traces in the terminal, you see beautiful error pages in the browser.

---

#### 7. **`src/error/StackTraceFormatter.ts`**
**What it does:** Parses and formats V8 stack traces into readable information.

**Responsibilities:**
- Parses stack trace strings
- Extracts file paths and line numbers
- Converts absolute paths to relative paths
- Generates HTML for display
- Filters out internal Node.js frames

**Why it matters:** Makes error messages actually useful for debugging.

---

#### 8. **`src/error/ErrorPageRenderer.ts`**
**What it does:** Renders error information as HTML pages in the browser.

**Responsibilities:**
- Loads HTML templates
- Injects error data into templates
- Replaces placeholders with actual values
- Provides fix suggestions based on error type
- Generates full HTML pages

**Why it matters:** Beautiful, informative error pages instead of blank screens.

---

#### 9. **`src/config/ManifestWatcher.ts`**
**What it does:** Watches `webapp.json` for changes and reloads configuration.

**Responsibilities:**
- Monitors `webapp.json` for file changes
- Validates new configuration against schema
- Emits events when manifest changes
- Provides helpful error messages for invalid JSON
- Debounces rapid changes

**Why it matters:** Change your dev server port without restarting the command.

---

#### 10. **`src/schemas/webapp-manifest.json`**
**What it does:** JSON Schema that defines the structure of `webapp.json`.

**Validates:**
- Required fields (name, label, version, etc.)
- Field types and formats
- Version number patterns (semantic versioning)
- API version format
- URL patterns

**Why it matters:** Catches configuration errors early with helpful messages.

---

#### 11. **`src/templates/runtime-error-page.html`**
**What it does:** HTML template for displaying runtime errors in the browser.

**Features:**
- Clean, modern design
- Syntax-highlighted stack traces
- Scrollable code sections
- System diagnostics
- Fix suggestions
- Auto-refresh indicator

**Why it matters:** Makes debugging a pleasant experience.

---

#### 12. **`messages/webapp.dev.md`**
**What it does:** Contains all user-facing messages for the `webapp dev` command.

**Includes:**
- Success messages
- Info messages
- Warning messages
- Error messages with actions
- Debug messages

**Why it matters:** Consistent, clear, and helpful user feedback.

---

## VSCode Integration

### Overview

The `sf webapp dev` command is designed to integrate with **VSCode's Live Preview** feature, allowing you to start your webapp with a single button click.

### How VSCode Integration Works

```
┌──────────────────────────────────────────────┐
│          VSCode Extension                     │
│  (salesforcedx-vscode-ui-preview)            │
│                                               │
│  User clicks: "Preview" button               │
│         ↓                                     │
│  Extension detects: webapp.json exists       │
│         ↓                                     │
│  Extension reads: webapp name                │
│         ↓                                     │
│  Extension gets: default Salesforce org      │
│         ↓                                     │
│  Extension executes:                          │
│    sf webapp dev                              │
│      --name <from-webapp-json>                │
│      --target-org <default-org>               │
│      --open                                    │
└──────────────────┬───────────────────────────┘
                   │
                   │ Spawns CLI command
                   ▼
┌──────────────────────────────────────────────┐
│       sf webapp dev (This Plugin)            │
│                                               │
│  ✓ Starts dev server                         │
│  ✓ Starts proxy                               │
│  ✓ Opens browser                              │
│  ✓ Ready for development!                     │
└──────────────────────────────────────────────┘
```

### For End Users

**Current State (Manual):**
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run proxy
sf webapp dev --name myApp --target-org myOrg

# Terminal 3: Continue working
```

**With VSCode Integration (Future):**
```
1. Open your webapp project in VSCode
2. Click "Preview" button in sidebar
3. Done! Browser opens with everything running
```

### For VSCode Extension Developers

**Implementation needed in `salesforcedx-vscode-ui-preview`:**

1. **Detect webapp projects:**
   - Check for `webapp.json` in workspace root
   - Validate it has required fields (name, label, etc.)

2. **Get default org:**
   - Use existing VSCode context to get default org
   - Read from workspace settings or connection

3. **Execute command:**
   - Run: `sf webapp dev --name {name} --target-org {org} --open`
   - Show command output in integrated terminal
   - Handle errors gracefully

4. **User experience:**
   - Show preview button when webapp.json detected
   - Display notification when starting
   - Link to terminal output
   - Handle Ctrl+C gracefully

**Benefits:**
- ✅ One-click preview for all Salesforce web projects
- ✅ Consistent experience (LWC and non-LWC)
- ✅ No manual CLI commands needed
- ✅ Automatic org selection
- ✅ Terminal output visible in VSCode

### Configuration File (webapp.json)

VSCode extension reads this file to determine:
- **`name`**: Webapp identifier (required by CLI)
- **`label`**: Display name for UI
- **`dev.command`**: Which command to run (optional)
- **`dev.url`**: Explicit dev server URL (optional)

---

## Advanced Features

### 1. Manifest Hot Reload

**What it does:** Update your configuration without restarting.

**Supported changes:**
- ✅ **`dev.url`** - Changes apply immediately
  - Example: Change port from 5173 to 5174
  - Proxy updates and reconnects automatically
  
**Changes requiring restart:**
- ⚠️ **`dev.command`** - Cannot change running process
  - You'll see: "Restart required to apply this change"

**Example:**
```bash
# Start command
sf webapp dev --name myApp --target-org myOrg

# While running, edit webapp.json:
{
  "dev": {
    "url": "http://localhost:5174"  // Changed from 5173
  }
}

# Console output:
Manifest changed detected
✓ Manifest reloaded successfully
Dev server URL updated to: http://localhost:5174
✅ Dev server detected at http://localhost:5174/
```

---

### 2. Runtime Error Detection

**What it does:** Shows Node.js errors in a beautiful browser UI.

**Types of errors caught:**
- Uncaught exceptions
- Unhandled promise rejections
- Syntax errors
- Type errors
- Reference errors

**Error page features:**
- Clean, scrollable stack trace (limited to 10 lines)
- File locations with line numbers
- System diagnostics (memory, Node version, etc.)
- Fix suggestions based on error type
- Auto-refresh when error is fixed

**Example:**
```javascript
// Your code has an error:
const user = undefined;
console.log(user.name);  // TypeError!

// Instead of:
// ❌ Terminal: TypeError: Cannot read property 'name' of undefined
//    at Object.<anonymous> (/long/path/file.js:123:45)
//    ... 20 more lines of stack trace

// You see:
// ✅ Browser: Beautiful error page with:
//    - Error: TypeError: Cannot read property 'name' of undefined
//    - Location: src/user.js:123:45
//    - Stack trace (scrollable)
//    - Suggestion: "Check if user is defined before accessing properties"
```

---

### 3. Health Monitoring

**What it does:** Continuously checks if your dev server is running.

**Health check cycle:**
- Runs every 5 seconds
- Pings dev server URL
- Detects up/down state changes
- Shows status page when server is down

**User experience:**

**When dev server is down:**
```
┌─────────────────────────────────────────┐
│   ⚠️  No Dev Server Detected            │
│                                          │
│   We couldn't find a dev server at:     │
│   http://localhost:5173                 │
│                                          │
│   To fix this:                          │
│   1. Make sure your dev server is       │
│      running: npm run dev               │
│   2. Check the URL in webapp.json       │
│   3. Verify the port is correct         │
│                                          │
│   This page will auto-refresh when      │
│   the server is detected.               │
└─────────────────────────────────────────┘
```

**When dev server comes back:**
```
Console: ✅ Dev server detected at http://localhost:5173/
Browser: Page refreshes automatically
```

---

### 4. WebSocket Support

**What it does:** Enables Hot Module Replacement (HMR) for instant updates.

**How it works:**
- WebSocket connections are proxied through
- Vite/Webpack HMR works normally
- Code changes reflect instantly in browser
- No page refresh needed for most changes

**Supported dev tools:**
- Vite HMR (`/@vite/*`)
- Webpack HMR (`/__webpack_hmr`)
- Create React App
- Vue CLI
- Angular Dev Server

---

### 5. Code Builder Support

**What it does:** Automatically detects and adapts to Salesforce Code Builder environment.

**Automatic detection:**
- Checks for `SBQQ_STUDIO_WORKSPACE` environment variable
- Checks for `SALESFORCE_PROJECT_ID` environment variable
- Binds to `0.0.0.0` instead of `127.0.0.1`

**Why it matters:** In Code Builder, you need to bind to all interfaces for port forwarding to work.

**Console output in Code Builder:**
```bash
✓ Proxy server running on http://0.0.0.0:4545
(Code Builder environment detected)
```

---

### 6. Graceful Shutdown

**What it does:** Cleans up all resources when you press Ctrl+C.

**Shutdown sequence:**
1. Capture SIGINT signal
2. Stop health check interval
3. Stop manifest watcher
4. Close proxy server
5. Stop dev server process
6. Clean up global error handlers
7. Exit cleanly

**User experience:**
```bash
# Press Ctrl+C
^C
Shutting down...
✓ Proxy server stopped
✓ Dev server stopped
✓ Cleanup complete
```

---

## Troubleshooting

### Common Issues

#### Issue 1: "No Dev Server Detected"

**Symptoms:**
- Browser shows error page
- Console says: "Dev server unreachable"

**Solutions:**
1. **Check if dev server is running:**
   ```bash
   # In another terminal
   npm run dev
   # OR
   yarn dev
   ```

2. **Verify the URL:**
   - Check `webapp.json` has correct `dev.url`
   - Default ports: Vite (5173), CRA (3000), Angular (4200)

3. **Check the port:**
   ```bash
   # See what's running on the port
   lsof -i :5173
   ```

4. **Try explicit URL:**
   ```bash
   sf webapp dev --name myApp --target-org myOrg --url http://localhost:5173
   ```

---

#### Issue 2: "Port 4545 already in use"

**Symptoms:**
```
Error: Port 4545 is already in use
```

**Solutions:**
1. **Use a different port:**
   ```bash
   sf webapp dev --name myApp --target-org myOrg --port 8080
   ```

2. **Find what's using the port:**
   ```bash
   lsof -i :4545
   ```

3. **Kill the process:**
   ```bash
   kill -9 <PID>
   ```

---

#### Issue 3: "Authentication Failed"

**Symptoms:**
- API calls return 401 Unauthorized
- Console shows auth errors

**Solutions:**
1. **Re-authorize your org:**
   ```bash
   sf org login web --alias myOrg
   ```

2. **Set default org:**
   ```bash
   sf config set target-org myOrg
   ```

3. **Verify org:**
   ```bash
   sf org display --target-org myOrg
   ```

---

#### Issue 4: "Manifest Validation Failed"

**Symptoms:**
```
webapp.json validation failed:
  • name: required field missing
```

**Solutions:**
1. **Check required fields:**
   ```json
   {
     "name": "myApp",           // ✅ Required
     "label": "My App",         // ✅ Required
     "version": "1.0.0",        // ✅ Required
     "apiVersion": "60.0",      // ✅ Required
     "outputDir": "dist"        // ✅ Required
   }
   ```

2. **Validate JSON syntax:**
   - Check for trailing commas
   - Verify quotes are double quotes
   - Use a JSON validator

---

#### Issue 5: "Hot Reload Not Working"

**Symptoms:**
- Code changes don't reflect in browser
- Must manually refresh page

**Solutions:**
1. **Check WebSocket connection:**
   - Open browser DevTools → Network → WS tab
   - Should see WebSocket connection to proxy

2. **Verify HMR is enabled in your framework:**
   ```javascript
   // Vite - should be enabled by default
   // CRA - should work out of the box
   ```

3. **Try hard refresh:**
   - Press Ctrl+Shift+R (Windows/Linux)
   - Press Cmd+Shift+R (Mac)

---

#### Issue 6: "Command Hangs on Ctrl+C"

**Symptoms:**
- Press Ctrl+C but command doesn't exit
- Terminal becomes unresponsive

**Solutions:**
1. **Force kill:**
   - Press Ctrl+C multiple times
   - Press Ctrl+Z then `kill %1`

2. **Check for zombie processes:**
   ```bash
   ps aux | grep "sf webapp dev"
   kill -9 <PID>
   ```

3. **Ensure latest version:**
   ```bash
   sf plugins update @salesforce/plugin-webapp
   ```

---

## FAQ

### General Questions

**Q: What frameworks are supported?**  
A: Any framework that runs a local dev server: React, Vue, Angular, Svelte, Lit, vanilla JS, etc. If it runs on `localhost:PORT`, it works.

**Q: Can I use this with TypeScript?**  
A: Yes! The command doesn't care about your source code. It proxies your compiled JavaScript.

**Q: Does this work with monorepos?**  
A: Yes, just put `webapp.json` in the specific package directory and run the command from there.

**Q: Can I deploy with this?**  
A: No, this is for development only. Use `sf webapp deploy` for deployment.

---

### Authentication Questions

**Q: How does authentication work?**  
A: The proxy intercepts requests to Salesforce and injects authentication headers automatically using your connected org's session.

**Q: Do I need to log in every time?**  
A: No, as long as your Salesforce org is authorized, authentication is automatic.

**Q: Can I use different orgs for testing?**  
A: Yes, just specify different `--target-org` values.

---

### Performance Questions

**Q: Is the proxy slow?**  
A: No, it adds minimal latency (~5-10ms). Most delays come from your dev server or Salesforce API response times.

**Q: Can I use this in production?**  
A: No, this is strictly for local development. For production, deploy your built app.

---

### Debugging Questions

**Q: How do I see what's being proxied?**  
A: Use `--debug` flag to see all requests and routing decisions.

**Q: Can I see the dev server logs?**  
A: Yes, stdout/stderr from your dev server appears in the console.

**Q: Where are error logs stored?**  
A: Errors are displayed in-browser and in the console. No separate log files.

---

### VSCode Integration Questions

**Q: When will VSCode integration be available?**  
A: It requires updates to the `salesforcedx-vscode-ui-preview` extension. Timeline TBD.

**Q: Can I use this without VSCode?**  
A: Yes! The CLI works standalone in any terminal.

**Q: Will it work with other IDEs?**  
A: Yes, the CLI works in any terminal. IDE integration is just a convenience feature.

---

## Summary

The `sf webapp dev` command provides a complete development experience for building web applications with Salesforce integration. It handles authentication, routing, error handling, and hot module replacement automatically, so you can focus on building great apps.

**Key takeaways:**
- ✅ One command starts everything
- ✅ Works with any web framework
- ✅ Automatic Salesforce authentication
- ✅ Beautiful error pages
- ✅ Hot reload support
- ✅ Production-ready architecture

**Get started today:**
```bash
sf webapp dev --name myApp --target-org myOrg --open
```

---

**Need help?** 
- [GitHub Issues](https://github.com/salesforcecli/plugin-webapp/issues)
- [Salesforce Developer Community](https://developer.salesforce.com/forums)
- [Documentation](https://github.com/salesforcecli/plugin-webapp/blob/main/README.md)

**Last Updated:** 2025-12-02  
**Version:** 1.0.0  
**Status:** Production Ready

