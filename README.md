# plugin-app-dev

[![NPM](https://img.shields.io/npm/v/@salesforce/plugin-app-dev.svg?label=@salesforce/plugin-app-dev)](https://www.npmjs.com/package/@salesforce/plugin-app-dev) [![Downloads/week](https://img.shields.io/npm/dw/@salesforce/plugin-app-dev.svg)](https://npmjs.org/package/@salesforce/plugin-app-dev) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/license/apache-2-0)

# Salesforce CLI Webapp Plugin

A Salesforce CLI plugin for building web applications that integrate with Salesforce. This plugin provides tools for local development, packaging, and deployment of webapps with built-in Salesforce authentication.

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Key Features

- **Auto-Discovery**: Automatically finds webapps in `webapplications/` folder
- **Optional Manifest**: `webapplication.json` is optional - uses sensible defaults
- **Auto-Selection**: Automatically selects webapp when running from inside its folder
- **Interactive Selection**: Prompts with arrow-key navigation to select webapp at project root
- **Authentication Injection**: Automatically adds Salesforce auth headers to API calls
- **Intelligent Routing**: Routes requests to dev server or Salesforce based on URL patterns
- **Hot Module Replacement**: Full HMR support for Vite, Webpack, and other bundlers
- **Manifest Hot Reload**: Edit `webapplication.json` while running - changes apply automatically
- **Health Monitoring**: Displays helpful error pages when dev server is down with auto-refresh
- **Framework Agnostic**: Works with any web framework (React, Vue, Angular, etc.)

## Quick Start

1. **Install the plugin:**

   ```bash
   sf plugins install @salesforce/plugin-app-dev
   ```

2. **Authenticate with Salesforce:**

   ```bash
   sf org login web --alias myorg
   ```

3. **Create webapplication.json:**

   ```json
   {
     "name": "myapp",
     "label": "My Web App",
     "version": "1.0.0",
     "apiVersion": "60.0",
     "outputDir": "dist",
     "dev": {
       "command": "npm run dev"
     }
   }
   ```

4. **Start development:**
   ```bash
   sf webapp dev --name myapp --target-org myorg --open
   ```

## Documentation

📚 **[Complete Guide](SF_WEBAPP_DEV_GUIDE.md)** - Comprehensive documentation covering:

- Overview and architecture
- Getting started (5-minute quick start)
- Building the plugin
- Command usage and options
- File structure and components
- VSCode integration
- Advanced features (hot reload, error capture, etc.)
- Troubleshooting and FAQ

## Install

```bash
sf plugins install @salesforce/plugin-app-dev@x.y.z
```

---

## Quick Start

### 1. Create your webapp in the SFDX project structure

```
my-sfdx-project/
├── sfdx-project.json
└── force-app/main/default/webapplications/
    └── my-app/
        ├── my-app.webapplication-meta.xml   # Required: identifies as webapp
        ├── package.json
        ├── src/
        └── webapplication.json              # Optional: dev configuration
```

### 2. Run the command

```bash
sf webapp dev --target-org myOrg --open
```

### 3. Start developing

Browser opens with your app running and Salesforce authentication ready.

- **With Vite plugin**: Open `http://localhost:5173` (Vite handles proxy)
- **Without Vite plugin**: Open `http://localhost:4545` (standalone proxy)

> **Note**: `{name}.webapplication-meta.xml` is **required** to identify a valid webapp. The `webapplication.json` is optional - if not present, defaults to `npm run dev` command.

---

## Commands

### `sf webapp dev`

Start a local development proxy server for webapp development with Salesforce authentication.

```bash
sf webapp dev [OPTIONS]
```

#### Options

| Option         | Short | Description                                     | Default       |
| -------------- | ----- | ----------------------------------------------- | ------------- |
| `--target-org` | `-o`  | Salesforce org alias or username                | Required      |
| `--name`       | `-n`  | Web application name (from webapplication.json) | Auto-discover |
| `--url`        | `-u`  | Explicit dev server URL                         | Auto-detect   |
| `--port`       | `-p`  | Proxy server port                               | 4545          |
| `--open`       | `-b`  | Open browser automatically                      | false         |

#### Examples

```bash
# Simplest - auto-discovers webapp
sf webapp dev --target-org myOrg

# With browser auto-open
sf webapp dev --target-org myOrg --open

# Specify webapp by name (when multiple exist)
sf webapp dev --name myApp --target-org myOrg

# Custom proxy port
sf webapp dev --target-org myOrg --port 8080

# Connect to existing dev server (proxy-only mode)
sf webapp dev --target-org myOrg --url http://localhost:5173

# Debug mode
SF_LOG_LEVEL=debug sf webapp dev --target-org myOrg
```

---

## Configuration

### webapplication.json Schema

The `webapplication.json` file is **optional**. If not present, defaults are used.

| Field         | Type   | Description                               | Default       |
| ------------- | ------ | ----------------------------------------- | ------------- |
| `name`        | string | Unique identifier (used with --name flag) | Folder name   |
| `dev.command` | string | Command to start the dev server           | `npm run dev` |
| `dev.url`     | string | Dev server URL (skip starting server)     | Auto-detect   |

#### Examples

**No manifest (uses defaults):**
```
webapplications/my-app/
├── my-app.webapplication-meta.xml
├── package.json     # Has "scripts": { "dev": "vite" }
└── src/
```

**Custom dev command:**
```json
{
  "dev": {
    "command": "npm start"
  }
}
```

**Explicit URL (dev server already running):**
```json
{
  "dev": {
    "url": "http://localhost:5173"
  }
}
```

---

## Webapp Discovery

The command discovers webapps using a deterministic algorithm. Webapps are identified by the presence of a `{name}.webapplication-meta.xml` file (SFDX metadata format).

### Discovery Behavior

| Scenario                            | Behavior                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `--name myApp` provided             | Finds webapp by name, starts dev server                   |
| Running from inside webapp folder   | Auto-selects that webapp                                  |
| `--name` conflicts with current dir | Error: must match current webapp or run from project root |
| At SFDX project root                | Prompts for webapp selection                              |
| Outside SFDX project with meta.xml  | Uses current directory as standalone webapp               |
| No webapp found                     | Shows error with helpful message                          |

### Folder Structure

```
my-sfdx-project/
├── sfdx-project.json                      # SFDX project marker
└── force-app/main/default/
    └── webapplications/                   # Standard SFDX location
        ├── app-one/
        │   ├── app-one.webapplication-meta.xml  # Required
        │   ├── webapplication.json              # Optional
        │   ├── package.json
        │   └── src/
        └── app-two/
            ├── app-two.webapplication-meta.xml  # Required
            ├── package.json
            └── src/
```

### Interactive Selection

When at the SFDX project root, you'll see an interactive prompt to select a webapp:

```
? Select the webapp to run: (Use arrow keys)
❯ MyApp
  app-two
  CustomName
```

---

## Vite Integration (Recommended)

When using **Vite** as your bundler, the `@salesforce/vite-plugin-webapp-experimental` package provides built-in proxy functionality.

### Setup

**1. Install the Vite plugin**

```bash
npm install -D @salesforce/vite-plugin-webapp-experimental
```

**2. Configure vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import salesforce from '@salesforce/vite-plugin-webapp-experimental';

export default defineConfig({
  plugins: [
    react(),
    salesforce()  // No configuration needed
  ],
});
```

**3. Run the dev command**

```bash
sf webapp dev --target-org myOrg
```

### How It Works

The CLI automatically detects whether your Vite dev server has the Salesforce plugin by sending a health check request. If the plugin responds with `X-Salesforce-WebApp-Proxy: true`, the CLI skips starting its standalone proxy.

| Scenario                    | Proxy Behavior                                 |
|-----------------------------|------------------------------------------------|
| Vite plugin **present**     | Uses Vite's built-in proxy (open `:5173`)      |
| Vite plugin **not present** | CLI creates standalone proxy (open `:4545`)    |

### Benefits

| Feature                 | Vite Plugin        | Standalone Proxy          |
|-------------------------|--------------------|---------------------------|
| Single port to access   | ✅ (5173)          | ❌ (proxy 4545, dev 5173) |
| Simpler browser URL     | ✅ `localhost:5173`| `localhost:4545`          |
| HMR through same port   | ✅ Native          | ✅ Forwarded              |

---

## The `--url` Flag

The `--url` flag provides control over which dev server URL the proxy uses.

| Scenario                 | What Happens                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| `--url` is reachable     | **Proxy-only mode**: Skips starting dev server, only starts proxy |
| `--url` is NOT reachable | Starts dev server, warns if actual URL differs from `--url`       |
| No `--url` provided      | Starts dev server automatically, detects URL                      |

### Example: Connect to Existing Dev Server

```bash
# Terminal 1: Start your dev server manually
npm run dev
# Output: Local: http://localhost:5173/

# Terminal 2: Connect proxy to your running server
sf webapp dev --url http://localhost:5173 --target-org myOrg
```

---

## Troubleshooting

### "No webapp found" or "No valid webapps"

Ensure your webapp has the required `.webapplication-meta.xml` file:

```
webapplications/my-app/
├── my-app.webapplication-meta.xml   # Required!
├── package.json
└── webapplication.json              # Optional
```

### "You are inside webapp X but specified --name Y"

**Solutions:**
- Remove `--name` to use the current webapp
- Navigate to the project root and use `--name`

### "Dependencies Not Installed" / "command not found"

```bash
cd webapplications/my-app
npm install
```

### "Port 4545 already in use"

```bash
sf webapp dev --port 8080 --target-org myOrg
```

### "Authentication Failed"

```bash
sf org login web --alias myOrg
```

### Debug Mode

```bash
# Terminal 1: Tail logs
tail -f ~/.sf/sf-$(date +%Y-%m-%d).log | grep --line-buffered WebappDev

# Terminal 2: Run with debug
SF_LOG_LEVEL=debug sf webapp dev --target-org myOrg
```

---

## Architecture

### Request Flow

The command supports two proxy modes:

**With Vite Plugin:**
```
Browser → Vite Dev Server (:5173) → Salesforce (with auth)
              ↓
         Proxy handles:
         • /services/* → Salesforce
         • Everything else → Vite HMR
```

**Standalone Proxy:**
```
Browser → Proxy Server (:4545) → Salesforce (with auth)
              ↓
         Dev Server (:5173) for static assets
```

### Request Routing

| URL Path                    | Routed To           |
|-----------------------------|---------------------|
| `/services/*`, `/lwr/apex/*`| Salesforce (+ auth) |
| Everything else             | Dev Server          |

---

## VSCode Integration

The command integrates with the Salesforce VSCode UI Preview extension (`salesforcedx-vscode-ui-preview`):

1. Extension detects `webapplication.json` in workspace
2. User clicks "Preview" button
3. Extension executes: `sf webapp dev --target-org <org> --open`
4. Browser opens with the app running

---

## JSON Output

For scripting and CI/CD:

```bash
sf webapp dev --target-org myOrg --json
```

```json
{
  "status": 0,
  "result": {
    "url": "http://localhost:4545",
    "devServerUrl": "http://localhost:5173"
  }
}
```

---

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of what you are trying to add/fix.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done.

### CLA

External contributors will be required to sign a Contributor's License Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

```bash
# Clone the repository
git clone git@github.com:salesforcecli/plugin-webapp

# Install dependencies and compile
yarn && yarn build

# Run using local dev file
./bin/dev webapp dev --target-org myOrg

# Link to SF CLI for testing
sf plugins link .
sf plugins  # Verify

# After code changes, just rebuild
yarn build
```

### Project Structure

```
plugin-webapp/
├── src/
│   ├── commands/webapp/
│   │   └── dev.ts                # Main command implementation
│   ├── config/
│   │   ├── manifest.ts           # Manifest type definitions
│   │   ├── ManifestWatcher.ts    # File watching and hot reload
│   │   ├── webappDiscovery.ts    # Auto-discovery logic
│   │   └── types.ts              # Shared TypeScript types
│   ├── proxy/
│   │   └── ProxyServer.ts        # HTTP/WebSocket proxy server
│   ├── server/
│   │   └── DevServerManager.ts   # Dev server process management
│   ├── error/
│   │   └── DevServerErrorParser.ts # Parse dev server errors
│   └── templates/
│       ├── ErrorPageRenderer.ts  # Browser error page generation
│       └── error-page.html       # Error page HTML template
├── messages/
│   └── webapp.dev.md             # CLI messages and help text
└── schemas/
    └── webapp-dev.json           # JSON schema for output
```

<!-- commandsstop -->
