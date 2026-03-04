# summary

Preview a web app locally without needing to deploy

# description

Starts a local development server for a Web Application, using the local project files. This enables rapid development with hot reloading and immediate feedback.

The command launches a local proxy server that sits between your web application and Salesforce, automatically injecting authentication headers from the CLI's stored tokens. This allows your web app to make authenticated API calls to Salesforce without exposing credentials.

# flags.name.summary

Identifies the Web Application (optional)

# flags.name.description

The unique name of the web application as defined in webapplication.json. If not provided, the command will automatically discover webapplication.json files in the current directory and subdirectories. If only one webapplication.json is found, it will be used automatically. If multiple are found, you will be prompted to select one.

# flags.url.summary

Dev server origin to forward UI/HMR/static requests

# flags.url.description

The URL where your dev server is running (e.g., http://localhost:5173). Required if webapplication.json does not contain a dev.command or dev.url configuration. All non-Salesforce API requests will be forwarded to this URL.

Dev server URL precedence: --url flag > manifest dev.url > URL from dev server process (started via manifest dev.command or default npm run dev).

# flags.port.summary

Local proxy port

# flags.port.description

The port on which the proxy server will listen. Your browser should connect to this port, not directly to the dev server. The proxy will forward authenticated requests to Salesforce and other requests to your dev server.

# flags.open.summary

Auto-open proxy URL in default browser

# flags.open.description

Automatically opens the proxy server URL in your default web browser when the server is ready. This saves you from manually copying and pasting the URL. The browser will open to the proxy URL (not the dev server URL directly), ensuring all requests are properly authenticated.

# examples

- Start the development server (auto-discovers webapplication.json):

  <%= config.bin %> <%= command.id %> --target-org myorg

- Start the development server with explicit webapp name:

  <%= config.bin %> <%= command.id %> --name myWebApp --target-org myorg

- Start the development server with explicit dev server URL:

  <%= config.bin %> <%= command.id %> --name myWebApp --url http://localhost:5173 --target-org myorg

- Start with custom port and auto-open browser:

  <%= config.bin %> <%= command.id %> --target-org myorg --port 4546 --open

- Start with debug logging (using SF_LOG_LEVEL environment variable):

  SF_LOG_LEVEL=debug <%= config.bin %> <%= command.id %> --target-org myorg

# info.manifest-changed

Manifest %s detected

# info.manifest-reloaded

✓ Manifest reloaded successfully

# info.dev-url-changed

Dev server URL updated to: %s

# info.dev-server-url

Dev server URL: %s

# info.proxy-url

Proxy URL: %s (open this URL in your browser)

# info.ready-for-development

✅ Ready for development!
  → %s (open this URL in your browser)

# info.ready-for-development-vite

✅ Ready for development!
  → %s (Vite proxy active - open this URL in your browser)

# info.press-ctrl-c

Press Ctrl+C to stop.

# info.press-ctrl-c-target

Press Ctrl+C to stop the %s.

# info.stopped-target

✅ Stopped %s.

# info.stop-target-dev

dev server

# info.stop-target-proxy

proxy server

# info.stop-target-both

dev and proxy servers

# info.server-running

Dev server is running. Stop it by running "SFDX: Close Live Preview" from the VS Code command palette.

# info.server-running-target-dev

Dev server is running. Stop it by running "SFDX: Close Live Preview" from the VS Code command palette.

# info.server-running-target-proxy

Proxy server is running. Stop it by running "SFDX: Close Live Preview" from the VS Code command palette.

# info.server-running-target-both

Dev and proxy servers are running. Stop them by running "SFDX: Close Live Preview" from the VS Code command palette.

# info.dev-server-healthy

✓ Dev server is responding at: %s

# info.dev-server-detected

✅ Dev server detected at %s

# info.start-dev-server-hint

Start your dev server to continue development

# warning.dev-server-not-responding

⚠ Dev server returned status %s from: %s

# warning.dev-server-unreachable

⚠ Dev server is not responding at: %s

# warning.dev-server-unreachable-status

⚠️ Dev server unreachable at %s

# warning.dev-server-start-hint

The proxy server is running, but the dev server may not be started yet.
Make sure to start your dev server (e.g., 'npm run dev') before opening the browser.

# warning.dev-command-changed

dev.command changed to "%s" - restart the command to apply this change.

# error.manifest-watch-failed

Failed to watch manifest: %s

# error.dev-url-unreachable

Dev server unreachable at %s.
Start your dev server manually at that URL, or add dev.command to webapplication.json to start it automatically.

# error.dev-url-unreachable-with-flag

Dev server unreachable at %s.
Remove --url to use dev.command to start the server automatically, or ensure your dev server is running at that URL.

# error.port-in-use

Port %s is already in use. Try specifying a different port with the --port flag or stopping the service that's using the port.

# error.dev-server-failed

%s

# info.multiple-webapps-found

Found %s webapps in project

# info.webapp-auto-selected

Auto-selected webapp "%s" (running from inside its folder)

# info.using-webapp

✅ Using webapp: %s (%s)

# info.starting-webapp

✅ Starting %s

# prompt.select-webapp

Select the webapp to run:

# info.no-manifest-defaults

No webapplication.json found. Using defaults: dev command=%s, proxy port=%s

Tip: See "sf webapp dev --help" for configuration options.

# warning.empty-manifest

No dev configuration in webapplication.json - using defaults (command: %s)

Tip: See "sf webapp dev --help" for configuration options.

# info.using-defaults

Using default dev command: %s

# info.url-already-available

✅ URL %s is already available, skipping dev server startup (proxy-only mode)

# warning.url-mismatch

⚠️ The --url flag (%s) does not match the actual dev server URL (%s).
The proxy will use the actual dev server URL.

# info.vite-proxy-detected

Vite WebApp proxy detected at %s - using Vite's built-in proxy (standalone proxy skipped)

