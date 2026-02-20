**NOTE: This template for sf plugins is not yet official. Please consult with the Platform CLI team before using this template.**

# plugin-webapp

[![NPM](https://img.shields.io/npm/v/@salesforce/plugin-webapp.svg?label=@salesforce/plugin-webapp)](https://www.npmjs.com/package/@salesforce/plugin-webapp) [![Downloads/week](https://img.shields.io/npm/dw/@salesforce/plugin-webapp.svg)](https://npmjs.org/package/@salesforce/plugin-webapp) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/license/apache-2-0)

## Using the template

This repository provides a template for creating a plugin for the Salesforce CLI. To convert this template to a working plugin:

1. Please get in touch with the Platform CLI team. We want to help you develop your plugin.
2. Generate your plugin:

   ```
   sf plugins install dev
   sf dev generate plugin

   git init -b main
   git add . && git commit -m "chore: initial commit"
   ```

3. Create your plugin's repo in the salesforcecli github org
4. When you're ready, replace the contents of this README with the information you want.

## Learn about `sf` plugins

Salesforce CLI plugins are based on the [oclif plugin framework](https://oclif.io/docs/introduction). Read the [plugin developer guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm) to learn about Salesforce CLI plugin development.

This repository contains a lot of additional scripts and tools to help with general Salesforce node development and enforce coding standards. You should familiarize yourself with some of the [node developer packages](#tooling) used by Salesforce. There is also a default circleci config using the [release management orb](https://github.com/forcedotcom/npm-release-management-orb) standards.

Additionally, there are some additional tests that the Salesforce CLI will enforce if this plugin is ever bundled with the CLI. These test are included by default under the `posttest` script and it is required to keep these tests active in your plugin if you plan to have it bundled.

### Tooling

- [@salesforce/core](https://github.com/forcedotcom/sfdx-core)
- [@salesforce/kit](https://github.com/forcedotcom/kit)
- [@salesforce/sf-plugins-core](https://github.com/salesforcecli/sf-plugins-core)
- [@salesforce/ts-types](https://github.com/forcedotcom/ts-types)
- [@salesforce/ts-sinon](https://github.com/forcedotcom/ts-sinon)
- [@salesforce/dev-config](https://github.com/forcedotcom/dev-config)
- [@salesforce/dev-scripts](https://github.com/forcedotcom/dev-scripts)

# Salesforce CLI Webapp Plugin

A Salesforce CLI plugin for building and deploying web applications that integrate with Salesforce. This plugin provides tools for local development, packaging, and deployment of webapps with built-in Salesforce authentication.

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Features

- 🔐 **Local Development Proxy** - Run webapps locally with automatic Salesforce authentication
- 🌐 **Intelligent Request Routing** - Automatically routes requests between Salesforce APIs and dev servers
- 🔄 **Dev Server Management** - Spawns and monitors dev servers (Vite, CRA, Next.js)
- 🎨 **Beautiful Error Handling** - HTML error pages with auto-refresh and diagnostics
- 💚 **Health Monitoring** - Periodic health checks with status updates
- 🔧 **Hot Config Reload** - Detects `webapplication.json` changes automatically

## Quick Start

1. **Install the plugin:**

   ```bash
   sf plugins install @salesforce/plugin-webapp
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
sf plugins install @salesforce/plugin-webapp@x.y.z
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
git clone git@github.com:salesforcecli/plugin-webapp

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

### `sf webapp dev`

Start a local development proxy server for webapp development with Salesforce authentication.

```bash
USAGE
  $ sf webapp dev --name <webapp-name> --target-org <org-alias> [options]

REQUIRED FLAGS
  -n, --name=<value>         Name of the webapp (must match webapplication.json)
  -o, --target-org=<value>   Salesforce org to authenticate against

OPTIONAL FLAGS
  -u, --url=<value>          Dev server URL (overrides webapplication.json)
  -p, --port=<value>         Proxy server port (default: 4545)
  --open                     Open browser automatically

GLOBAL FLAGS
  --flags-dir=<value>        Import flag values from a directory
  --json                     Format output as json

DESCRIPTION
  Start a local development proxy server for webapp development.

  This command starts a local HTTP proxy server that handles Salesforce
  authentication and routes requests between your local dev server and
  Salesforce APIs. It automatically spawns and monitors your dev server,
  detects the URL, and provides health monitoring.

EXAMPLES
  Start proxy with automatic dev server management:

    $ sf webapp dev --name myapp --target-org myorg --open

  Use existing dev server:

    $ sf webapp dev --name myapp --target-org myorg --url http://localhost:5173 --open

  Use custom proxy port:

    $ sf webapp dev --name myapp --target-org myorg --port 8080 --open

SUPPORTED DEV SERVERS
  - Vite
  - Create React App (Webpack)
  - Next.js
  - Any server that outputs http://localhost:PORT

FEATURES
  - Automatic Salesforce authentication injection
  - Intelligent request routing (Salesforce vs dev server)
  - WebSocket support for Hot Module Replacement (HMR)
  - Beautiful HTML error pages with auto-refresh
  - Periodic health monitoring (every 5s)
  - Configuration file watching (webapplication.json)
  - Graceful shutdown on Ctrl+C

SEE ALSO
  - Complete Guide: SF_WEBAPP_DEV_GUIDE.md
```

<!-- commandsstop -->
