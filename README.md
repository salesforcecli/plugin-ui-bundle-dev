# plugin-ui-bundle-dev

[![NPM](https://img.shields.io/npm/v/@salesforce/plugin-ui-bundle-dev.svg?label=@salesforce/plugin-ui-bundle-dev)](https://www.npmjs.com/package/@salesforce/plugin-ui-bundle-dev) [![Downloads/week](https://img.shields.io/npm/dw/@salesforce/plugin-ui-bundle-dev.svg)](https://npmjs.org/package/@salesforce/plugin-ui-bundle-dev) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/license/apache-2-0)

# Salesforce CLI UI Bundle Dev Plugin

A Salesforce CLI plugin for building UI bundles that integrate with Salesforce. This plugin provides tools for local development of UI bundles with built-in Salesforce authentication.

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Features

- 🔐 **Local Development Proxy** - Run UI bundles locally with automatic Salesforce authentication
- 🌐 **Intelligent Request Routing** - Automatically routes requests between Salesforce APIs and dev servers
- 🔄 **Dev Server Management** - Spawns and monitors dev servers (Vite, CRA, Next.js)
- 💚 **Health Monitoring** - Periodic health checks with status updates
- 🔧 **Hot Config Reload** - Detects `ui-bundle.json` changes automatically

## Quick Start

1. **Install the plugin:**

   ```bash
   sf plugins install @salesforce/plugin-ui-bundle-dev
   ```

2. **Authenticate with Salesforce:**

   ```bash
   sf org login web --alias myorg
   ```

3. **Create ui-bundle.json:**

   ```json
   {
     "name": "myBundle",
     "label": "My UI Bundle",
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
   sf ui-bundle dev --name myBundle --target-org myorg --open
   ```

## Documentation

📚 **[Complete Guide](SF_UI_BUNDLE_DEV_GUIDE.md)** - Comprehensive documentation covering:

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
sf plugins install @salesforce/plugin-ui-bundle-dev@x.y.z
```

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of
   what you are trying to add/fix. That way, we can also offer suggestions or
   let you know if there is already an effort in progress.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork. Note, this step is recommended but technically not required if contributing using a fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code. No pull request will be accepted without unit tests.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done. We'll review your code, suggest any needed changes, and merge it in.

### CLA

External contributors will be required to sign a Contributor's License
Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

To build the plugin locally, make sure to have yarn installed and run the following commands:

```bash
# Clone the repository
git clone git@github.com:salesforcecli/plugin-ui-bundle-dev

# Install the dependencies and compile
yarn && yarn build
```

To use your plugin, run using the local `./bin/dev` or `./bin/dev.cmd` file.

```bash
# Run using local run file.
./bin/dev hello world
```

There should be no differences when running via the Salesforce CLI or using the local run file. However, it can be useful to link the plugin to do some additional testing or run your commands from anywhere on your machine.

```bash
# Link your plugin to the sf cli
sf plugins link .
# To verify
sf plugins
```

## Commands

### `sf ui-bundle dev`

Start a local development proxy server for UI Bundle development with Salesforce authentication.

**Two operating modes:**

- **Command mode** (default): When `dev.command` is set in `ui-bundle.json` (or default `npm run dev`), the CLI starts the dev server. URL defaults to `http://localhost:5173`; override with `dev.url` or `--url` if needed.
- **URL-only mode**: When only `dev.url` or `--url` is provided (no command), the CLI assumes the dev server is already running and does not start it. Proxy only.

```bash
USAGE
  $ sf ui-bundle dev --target-org <org-alias> [options]

REQUIRED FLAGS
  -o, --target-org=<value>   Salesforce org to authenticate against

OPTIONAL FLAGS
  -n, --name=<value>         Name of the UI bundle (must match ui-bundle.json)
  -u, --url=<value>          Dev server URL. Command mode: override default 5173. URL-only: required (server must be running)
  -p, --port=<value>         Proxy server port (default: 4545)
  -b, --open                 Open browser automatically

DESCRIPTION
  Starts a local HTTP proxy that injects Salesforce authentication and routes
  requests between your dev server and Salesforce APIs. In command mode,
  spawns and monitors the dev server (default URL: localhost:5173). In
  URL-only mode, connects to an already-running dev server.

EXAMPLES
  Start dev server by auto-discovering the UI bundle:

    $ sf ui-bundle dev --target-org myorg --open

  Explicitly specify the UI bundle name:

    $ sf ui-bundle dev --name myBundle --target-org myorg --open

  URL-only mode (dev server already running):

    $ sf ui-bundle dev --name myBundle --target-org myorg --url http://localhost:5173 --open

  Custom proxy port:

    $ sf ui-bundle dev --target-org myorg --port 8080 --open

SEE ALSO
  - Complete Guide: SF_UI_BUNDLE_DEV_GUIDE.md
```

<!-- commandsstop -->
