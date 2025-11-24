# sf webapp dev - Command Documentation

## Overview

The `sf webapp dev` command provides a local development proxy server for Salesforce webapps. It handles authentication, request routing, and dev server lifecycle management, enabling seamless development with Salesforce APIs.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Command Usage](#command-usage)
3. [Features](#features)
4. [Configuration](#configuration)
5. [Architecture](#architecture)
6. [How It Works](#how-it-works)
7. [Troubleshooting](#troubleshooting)
8. [Developer Guide](#developer-guide)
9. [API Reference](#api-reference)

---

## Quick Start

### Prerequisites

1. **Authenticated Salesforce Org**
   ```bash
   sf org login web --alias myorg
   ```

2. **webapp.json Configuration**
   Create a `webapp.json` file in your project root:
   ```json
   {
     "name": "myapp",
     "label": "My Web App",
     "version": "1.0.0",
     "apiVersion": "60.0",
     "outputDir": "dist",
     "dev": {
       "command": "npm run dev",
       "url": "http://localhost:5173"
     }
   }
   ```

### Basic Usage

```bash
# Start proxy with automatic dev server management
sf webapp dev --name myapp --target-org myorg --open

# Use existing dev server
sf webapp dev --name myapp --target-org myorg --url http://localhost:5173 --open

# Custom proxy port
sf webapp dev --name myapp --target-org myorg --port 8080 --open
```

---

## Command Usage

### Syntax

```bash
sf webapp dev --name <webapp-name> --target-org <org-alias> [options]
```

### Required Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--name` | `-n` | Name of the webapp (must match `webapp.json`) |
| `--target-org` | `-o` | Salesforce org to authenticate against |

### Optional Flags

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--url` | `-u` | From `webapp.json` | Override dev server URL |
| `--port` | `-p` | `4545` | Proxy server port |
| `--open` | | `false` | Open browser automatically |

### Flag Priority

The command resolves the dev server URL in this order:
1. `--url` flag (highest priority)
2. `dev.url` in `webapp.json`
3. `dev.command` in `webapp.json` (spawns and detects URL)

### Examples

**Example 1: Development with Vite**
```bash
# webapp.json has "dev.command": "npm run dev"
sf webapp dev --name myapp --target-org myorg --open
```

**Example 2: Using Existing Dev Server**
```bash
# Start your dev server manually
npm run dev

# In another terminal
sf webapp dev --name myapp --target-org myorg --url http://localhost:5173 --open
```

**Example 3: Custom Port**
```bash
sf webapp dev --name myapp --target-org myorg --port 8080 --open
```

**Example 4: Code Builder Environment**
```bash
# Automatically detects Code Builder and adjusts network interface
sf webapp dev --name myapp --target-org myorg --open
```

---

## Features

### 🔐 Authentication

- **Automatic Token Injection**: CLI tokens are automatically injected into requests as `Authorization: Bearer <token>`
- **Token Refresh**: Expired tokens are automatically refreshed
- **Org Support**: Works with both user orgs and scratch orgs

### 🌐 Request Routing

**Routes to Salesforce:**
- `/services/*` - All Salesforce services (REST, SOAP, Tooling, etc.)
- `/aura` - Aura framework
- `/lightning/*` - Lightning Web Components
- `/apexremote` - Apex Remote Actions

**Routes to Dev Server:**
- `/__vite_ping` - Vite health check
- `/@vite/*`, `/@fs/*`, `/@id/*` - Vite special paths
- `/__webpack_hmr`, `/sockjs-node/*` - Webpack HMR
- `/_next/*` - Next.js
- Static assets (`.js`, `.css`, `.html`, `.svg`, `.png`, etc.)
- WebSocket upgrades for HMR

### 🔄 Dev Server Management

**Supported Dev Servers:**
- ✅ **Vite** - Full support with Unicode arrow detection
- ✅ **Create React App** - Webpack-based
- ✅ **Next.js** - SSR and static
- ✅ **Custom** - Any server outputting `http://localhost:PORT`

**Lifecycle Management:**
- Automatic spawning from `dev.command`
- URL detection from stdout (strips ANSI color codes)
- Process monitoring and health checks
- Automatic restart on crash (up to 3 times)
- Graceful shutdown on Ctrl+C

**URL Detection Patterns:**

| Server | Pattern Example |
|--------|----------------|
| Vite | `➜  Local:   http://localhost:5173/` |
| CRA | `On Your Network:  http://192.168.1.1:3000` |
| Next.js | `ready - started server on 0.0.0.0:3000, url: http://localhost:3000` |
| Generic | `Server running at http://localhost:8080` |

### 🎨 Error Handling & UX

**HTML Error Page:**
- Beautiful, informative error page when dev server is unreachable
- Shows current status, URLs, and workspace script
- Auto-refreshes every 5 seconds until dev server is detected
- Provides actionable troubleshooting steps

**Terminal Output:**
- Minimal, clean status updates
- `✅ Dev server detected at http://localhost:5173/`
- `⚠️  Dev server unreachable at http://localhost:5173/`
- Error messages with suggestions

**Health Monitoring:**
- Checks dev server health every 5 seconds
- Emits status change events
- Updates both terminal and browser

### 🔧 Configuration Management

**webapp.json Validation:**
- JSON schema validation on load
- Detailed validation error messages
- File watching with auto-reload (300ms debounce)

**Hot Configuration Reload:**
- Changes to `webapp.json` are detected automatically
- Proxy reloads configuration without restart
- Dev server restarts if command changes

---

## Configuration

### webapp.json Schema

```json
{
  "name": "myapp",
  "label": "My Web App",
  "version": "1.0.0",
  "apiVersion": "60.0",
  "outputDir": "dist",
  "dev": {
    "command": "npm run dev",
    "url": "http://localhost:5173",
    "port": 5173
  },
  "proxy": {
    "customPaths": ["/api/*", "/custom/*"]
  }
}
```

### Configuration Options

#### Root Level

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for the webapp |
| `label` | string | Yes | Display name |
| `version` | string | Yes | Webapp version (semver) |
| `apiVersion` | string | Yes | Salesforce API version |
| `outputDir` | string | Yes | Build output directory |

#### dev Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string | No | Command to start dev server |
| `url` | string | No | Dev server URL (if already running) |
| `port` | number | No | Expected dev server port |

**Note:** Either `command` or `url` should be specified. If both are present, `url` takes precedence.

#### proxy Object

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `customPaths` | string[] | No | Additional paths to route to dev server |

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    sf webapp dev Command                     │
│                  (src/commands/webapp/dev.ts)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
┌────────────┐  ┌─────────────┐  ┌────────────────┐
│ManifestWtch│  │AuthManager  │  │DevServerManager│
│            │  │             │  │                │
│Loads &     │  │CLI Token    │  │Spawns & Detects│
│Watches     │  │Management   │  │Dev Server URL  │
│webapp.json │  │             │  │                │
└────────────┘  └─────────────┘  └────────────────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │     ProxyServer         │
         │  (HTTP Proxy + HMR)     │
         └─────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
┌────────────┐  ┌─────────────┐  ┌────────────┐
│RequestRouter│  │ErrorHandler │  │Logger      │
│            │  │             │  │            │
│Routes to SF│  │Standardized │  │Debug &     │
│or DevServer│  │Errors       │  │Info Logs   │
└────────────┘  └─────────────┘  └────────────┘
```

### Module Descriptions

#### 1. **ManifestWatcher** (`src/config/ManifestWatcher.ts`)

**Purpose:** Loads, validates, and watches `webapp.json` for changes.

**Responsibilities:**
- Load and parse `webapp.json`
- Validate against JSON schema
- Watch for file changes (chokidar)
- Emit events: `ready`, `change`, `error`

**Key Methods:**
- `initialize()`: Load and start watching
- `stop()`: Stop watching
- `getManifest()`: Get current manifest

#### 2. **AuthManager** (`src/auth/AuthManager.ts`)

**Purpose:** Manages Salesforce authentication and token injection.

**Responsibilities:**
- Retrieve org connection from CLI
- Extract access tokens
- Refresh expired tokens
- Provide auth headers

**Key Methods:**
- `getAuthHeaders()`: Get `Authorization` header
- `getConnection()`: Get org connection

#### 3. **DevServerManager** (`src/server/DevServerManager.ts`)

**Purpose:** Manages dev server lifecycle and URL detection.

**Responsibilities:**
- Spawn dev server process
- Detect URL from stdout
- Monitor health
- Handle crashes and restarts
- Graceful shutdown

**Key Methods:**
- `start()`: Start dev server
- `stop()`: Stop dev server
- `getStatus()`: Get current status
- `getUrl()`: Get detected URL

**URL Detection:**
- Strips ANSI color codes
- Processes output line-by-line
- Supports multiple patterns (Vite, CRA, Next.js)
- Handles Unicode characters (➜)

#### 4. **ProxyServer** (`src/proxy/ProxyServer.ts`)

**Purpose:** Core HTTP proxy with authentication and routing.

**Responsibilities:**
- HTTP/HTTPS proxying
- Auth header injection
- WebSocket upgrade handling
- Health monitoring
- Error page serving
- Statistics tracking

**Key Methods:**
- `start()`: Start proxy server
- `stop()`: Stop proxy server
- `getStats()`: Get proxy statistics
- `setupGracefulShutdown()`: Handle SIGINT/SIGTERM

**Features:**
- Code Builder detection
- Network interface selection
- Port conflict detection
- Periodic health checks (every 5s)

#### 5. **RequestRouter** (`src/proxy/RequestRouter.ts`)

**Purpose:** Analyze requests and determine routing target.

**Responsibilities:**
- Detect Salesforce API patterns
- Detect dev server patterns
- Handle custom paths
- Detect WebSocket upgrades

**Key Methods:**
- `analyzeRequest()`: Determine route target

**Routing Logic:**
- Salesforce paths → Salesforce org
- Dev server paths → Local dev server
- Custom paths → Configurable
- WebSocket upgrades → Preserve connection

#### 6. **ErrorHandler** (`src/error/ErrorHandler.ts`)

**Purpose:** Standardized error creation with suggestions.

**Responsibilities:**
- Create `SfError` instances
- Provide actionable error messages
- Sanitize sensitive data

**Error Codes:**
- `ManifestNotFoundError`
- `ManifestValidationError`
- `DevServerStartupTimeout`
- `DevServerSpawnError`
- `PortInUseError`
- `AuthenticationError`
- `TargetUnreachableError`

#### 7. **Logger** (`src/utils/Logger.ts`)

**Purpose:** Simple logging utility with debug mode.

**Responsibilities:**
- Log info, warn, error messages
- Debug mode for verbose output

---

## How It Works

### Startup Sequence

1. **Load Configuration**
   - Parse `webapp.json`
   - Validate against schema
   - Start file watcher

2. **Initialize Authentication**
   - Retrieve org from CLI
   - Get access token
   - Set up refresh logic

3. **Start Dev Server (if needed)**
   - Spawn process from `dev.command`
   - Monitor stdout for URL
   - Strip ANSI codes and detect URL
   - Wait for server to be ready (30s timeout)

4. **Start Proxy Server**
   - Create HTTP server on specified port
   - Set up request handlers
   - Configure error handlers
   - Start health monitoring

5. **Open Browser (if --open)**
   - Launch browser to `http://localhost:4545`
   - User sees beautiful error page if dev server not ready
   - Auto-refreshes when dev server comes up

### Request Flow

```
Browser Request
      │
      ▼
┌─────────────────┐
│  Proxy Server   │ (localhost:4545)
│  (Port 4545)    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Router   │
    └────┬─────┘
         │
    ┌────┴───────┐
    │            │
    ▼            ▼
┌─────────┐  ┌────────────┐
│Salesforce│  │Dev Server  │
│  APIs   │  │(Port 5173) │
└─────────┘  └────────────┘
```

**Salesforce Request:**
1. Browser → Proxy (`:4545/services/data/v60.0/sobjects`)
2. Proxy injects `Authorization: Bearer <token>`
3. Proxy forwards to Salesforce
4. Response returned to browser

**Dev Server Request:**
1. Browser → Proxy (`:4545/src/App.tsx`)
2. Proxy forwards to dev server (`:5173/src/App.tsx`)
3. Response returned to browser

**WebSocket Request (HMR):**
1. Browser initiates WebSocket upgrade
2. Proxy detects upgrade headers
3. Proxy establishes WebSocket tunnel
4. HMR messages flow bidirectionally

### Health Monitoring

```
Every 5 seconds:
┌────────────────────────┐
│  Check Dev Server      │
│  (HEAD request)        │
└───────────┬────────────┘
            │
    ┌───────┴────────┐
    │                │
    ▼                ▼
┌─────────┐    ┌──────────┐
│ Success │    │  Failure │
└────┬────┘    └─────┬────┘
     │               │
     ▼               ▼
  Emit           Emit
  'up'          'down'
  event         event
     │               │
     ▼               ▼
Update CLI      Update CLI
& Browser       & Browser
  Status          Status
```

### Configuration Reload

```
webapp.json changes
      │
      ▼
File watcher triggers
      │
      ▼
Debounce (300ms)
      │
      ▼
Reload & Validate
      │
   ┌──┴───┐
   │      │
   ▼      ▼
Changed  Valid?
   │      │
   │    ┌─┴─┐
   │    Y   N
   │    │   │
   │    │   ▼
   │    │  Emit
   │    │  Error
   │    │
   │    ▼
   │  Emit
   │  'change'
   │
   ▼
Restart
Dev Server
(if command
 changed)
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use

**Error:**
```
Error (PortInUseError): Port 4545 is already in use
```

**Solution:**
```bash
# Use a different port
sf webapp dev --name myapp --target-org myorg --port 8080

# Or kill the process using 4545
lsof -ti:4545 | xargs kill -9
```

#### 2. Dev Server Not Detected

**Error:**
```
Error (DevServerStartupTimeout): Dev server did not start within 30 seconds
```

**Possible Causes:**
- Dev server command is incorrect
- Dev server is failing to start
- URL pattern not recognized

**Solution:**
```bash
# Test dev server manually
npm run dev

# Check output format - does it show a URL?
# If URL format is different, report it as an issue

# Use explicit URL instead
sf webapp dev --name myapp --target-org myorg --url http://localhost:5173
```

#### 3. Authentication Failed

**Error:**
```
Error (AuthenticationError): Failed to authenticate with org 'myorg'
```

**Solution:**
```bash
# Re-authenticate
sf org login web --alias myorg

# Verify authentication
sf org list
```

#### 4. Manifest Not Found

**Error:**
```
Error (ManifestNotFoundError): webapp.json not found
```

**Solution:**
- Ensure `webapp.json` exists in the current directory
- Run command from the project root
- Check file name and case sensitivity

#### 5. Dev Server Crashes

**Behavior:**
- Terminal shows "Dev server process exited with code 1"
- Error page appears in browser

**Solution:**
```bash
# Check dev server logs for errors
npm run dev

# Common issues:
# - Missing dependencies: npm install
# - Port conflict: Change port in vite.config.ts
# - TypeScript errors: Fix compilation errors
```

#### 6. HTML Error Page Not Loading

**Error:**
```
Error (UnexpectedError): Failed to start webapp dev command: ENOENT
```

**Solution:**
```bash
# Rebuild the plugin
yarn build

# Verify templates are copied
ls lib/templates/error-page.html
```

### Debug Mode

Enable verbose logging:

```bash
# Set debug environment variable
DEBUG=* sf webapp dev --name myapp --target-org myorg

# Or use CLI debug flag
sf webapp dev --name myapp --target-org myorg --debug
```

### Health Check Issues

If health checks are failing but dev server is running:

1. **Check firewall settings**
   - Allow local connections
   - Disable VPN if interfering

2. **Check dev server CORS**
   - Some servers may block HEAD requests
   - Configure CORS to allow proxy origin

3. **Check network interface**
   - Dev server must listen on `0.0.0.0` or `localhost`
   - Not `127.0.0.1` only

---

## Developer Guide

### Adding Support for New Dev Servers

To add support for a new dev server type, update `src/server/DevServerManager.ts`:

```typescript
// 1. Add new pattern constant
const MY_SERVER_PATTERNS = [
  /My Server is ready at:\s+(https?:\/\/[^\s]+)/i,
  // Add more patterns as needed
];

// 2. Add to URL_PATTERNS array
const URL_PATTERNS = [
  ...VITE_PATTERNS,
  ...CRA_PATTERNS,
  ...NEXTJS_PATTERNS,
  ...MY_SERVER_PATTERNS, // Add here
  ...GENERIC_PATTERNS,
];
```

**Pattern Guidelines:**
- Use regex to capture URL in group 1: `(...)`
- Use case-insensitive flag: `/i`
- Use Unicode flag if needed: `/iu`
- Test with actual dev server output
- Add comments with example output

### Adding Custom Request Routing

To route custom paths, update `webapp.json`:

```json
{
  "proxy": {
    "customPaths": [
      "/api/*",
      "/graphql",
      "/custom/*"
    ]
  }
}
```

Or modify `src/proxy/RequestRouter.ts`:

```typescript
private static readonly CUSTOM_PATTERNS = [
  /^\/api\//,
  /^\/graphql/,
  /^\/custom\//,
];
```

### Extending Error Messages

Add new error codes in `src/error/ErrorHandler.ts`:

```typescript
export enum WebAppErrorCode {
  // ... existing codes
  MY_NEW_ERROR = 'MyNewError',
}

public static createMyNewError(details: string): SfError<AnyJson> {
  return new SfError(
    `My error message: ${details}`,
    WebAppErrorCode.MY_NEW_ERROR,
    [
      'Suggestion 1',
      'Suggestion 2',
    ]
  );
}
```

### Testing

**Unit Tests:**
```bash
# Run all tests
yarn test

# Run specific test file
yarn test test/server/DevServerManager.test.ts

# Run with coverage
yarn test:coverage
```

**Manual Testing:**
```bash
# Build plugin
yarn build

# Test command
sf webapp dev --name myapp --target-org myorg --open --debug
```

**NUT Tests:**
```bash
# Run non-unit tests
yarn test:nuts
```

---

## API Reference

### Command Flags

#### --name (-n)

**Type:** `string`  
**Required:** Yes  
**Description:** Name of the webapp, must match the `name` field in `webapp.json`

#### --target-org (-o)

**Type:** `org`  
**Required:** Yes  
**Description:** Salesforce org to authenticate against

#### --url (-u)

**Type:** `string`  
**Required:** No  
**Description:** Dev server URL (overrides `webapp.json`)  
**Example:** `http://localhost:5173`

#### --port (-p)

**Type:** `integer`  
**Required:** No  
**Default:** `4545`  
**Description:** Port for the proxy server

#### --open

**Type:** `boolean`  
**Required:** No  
**Default:** `false`  
**Description:** Open browser automatically

### Environment Variables

#### SF_AUTOUPDATE_DISABLE

**Type:** `boolean`  
**Description:** Disable CLI update check for faster startup  
**Usage:** `SF_AUTOUPDATE_DISABLE=1 sf webapp dev ...`

#### DEBUG

**Type:** `string`  
**Description:** Enable verbose debug logging  
**Usage:** `DEBUG=* sf webapp dev ...`

### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success (manual stop with Ctrl+C) |
| 1 | General error |
| 130 | Interrupted (SIGINT) |

---

## Best Practices

### 1. Use --open Flag

Always use `--open` to automatically launch the browser:
```bash
sf webapp dev --name myapp --target-org myorg --open
```

### 2. Specify Explicit URL for Faster Startup

If your dev server is already running:
```bash
sf webapp dev --name myapp --target-org myorg --url http://localhost:5173 --open
```

### 3. Use Aliases for Long Commands

Add to your shell profile (`.bashrc`, `.zshrc`):
```bash
alias webapp-dev='sf webapp dev --name myapp --target-org myorg --open'
```

### 4. Keep webapp.json Up to Date

Ensure `dev.command` and `dev.url` match your actual dev server configuration.

### 5. Use Debug Mode for Troubleshooting

```bash
sf webapp dev --name myapp --target-org myorg --debug
```

### 6. Monitor Terminal Output

Watch for:
- ✅ Dev server detected
- ⚠️  Dev server unreachable
- Validation errors

---

## Known Limitations

1. **WebSocket Reconnection**: HMR WebSockets may not reconnect automatically if proxy restarts
2. **Dev Server Types**: Only tested with Vite, CRA, and Next.js
3. **HTTPS Dev Servers**: Not yet supported (use HTTP)
4. **Multiple Dev Servers**: Only one dev server per webapp
5. **Binary Responses**: Large binary files may have performance issues

---

## Support

For issues, questions, or feature requests:
- **Work Item:** W-20242483
- **Repository:** salesforcecli/plugin-webapp
- **Documentation:** This file

---

## Changelog

### Version 1.0.0 (Initial Release)

**Features:**
- HTTP proxy server with authentication
- Dev server lifecycle management
- Support for Vite, CRA, Next.js
- HTML error pages with auto-refresh
- Health monitoring
- Configuration file watching
- WebSocket support for HMR

**Technical:**
- ANSI color code stripping for URL detection
- Organized URL patterns by server type
- Graceful shutdown handling
- Comprehensive error messages

---

**Last Updated:** November 2025  
**Work Item:** @W-20242483@

