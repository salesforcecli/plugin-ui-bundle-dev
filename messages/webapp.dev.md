# summary

Preview a web app locally without needing to deploy

# description

Starts a local development server for a Web Application, using the local project files. This enables rapid development with hot reloading and immediate feedback.

The command launches a local proxy server that sits between your web application and Salesforce, automatically injecting authentication headers from the CLI's stored tokens. This allows your web app to make authenticated API calls to Salesforce without exposing credentials.

# flags.name.summary

Identifies the Web Application

# flags.name.description

The unique name of the web application as defined in webapp.json. This is used to load the appropriate configuration and settings.

# flags.target.summary

Selects which Web Application target to use for the preview (e.g., Lightning App, Site)

# flags.url.summary

Dev server origin to forward UI/HMR/static requests

# flags.url.description

The URL where your dev server is running (e.g., http://localhost:5173). Required if webapp.json does not contain a dev.command or dev.url configuration. All non-Salesforce API requests will be forwarded to this URL.

# flags.port.summary

Local proxy port

# flags.port.description

The port on which the proxy server will listen. Your browser should connect to this port, not directly to the dev server. The proxy will forward authenticated requests to Salesforce and other requests to your dev server.

# flags.target-org.summary

Org to use for auth

# flags.target-org.description

The Salesforce org alias or username to use for authentication. The proxy will use this org's credentials to authenticate API requests to Salesforce.

# flags.debug.summary

Enable verbose proxy logging

# flags.debug.description

When enabled, the proxy will log detailed information about each request including headers, routing decisions, and response status. Useful for debugging authentication or routing issues. Note: Access tokens are never logged even in debug mode.

# flags.open.summary

Auto-open proxy URL in default browser

# flags.open.description

When enabled, automatically opens the proxy URL in your default browser after the proxy server starts.

# examples

- Start the development server with explicit dev server URL:

  <%= config.bin %> <%= command.id %> --name myWebApp --url http://localhost:5173 --target-org myorg

- Start the development server using webapp.json configuration:

  <%= config.bin %> <%= command.id %> --name myWebApp --target-org myorg

- Start with custom port and auto-open browser:

  <%= config.bin %> <%= command.id %> --name myWebApp --target-org myorg --port 4546 --open

- Start with debug logging:

  <%= config.bin %> <%= command.id %> --name myWebApp --target-org myorg --debug

# info.loading-manifest

Loading webapp.json manifest...

# info.manifest-loaded

Manifest loaded: %s

# info.manifest-changed

Manifest %s detected

# info.using-explicit-url

Using explicit dev server URL: %s

# info.using-manifest-url

Using dev server URL from manifest: %s

# info.initializing-auth

Initializing authentication for org: %s

# info.starting-proxy

Starting proxy server on port %s...

# info.starting

Starting development server for web app: %s

# info.using-target-org

Using target org: %s

# info.proxy-running

✓ Proxy server running on %s

# info.dev-server-url

Dev server URL: %s

# info.proxy-url

Proxy URL: %s (open this in your browser)

# info.opening-browser

Opening browser...

# info.ready-for-development

✓ Ready for development!

# info.press-ctrl-c

Press Ctrl+C to stop the server

# info.shutting-down

Shutting down (%s)...

# info.dev-server-ready

✓ Dev server ready at: %s

# info.dev-server-exit

Dev server stopped

# info.dev-server-healthy

✓ Dev server is responding at: %s

# warning.dev-server-not-responding

⚠ Dev server returned status %s from: %s

# warning.dev-server-unreachable

⚠ Dev server is not responding at: %s

# warning.dev-server-start-hint

The proxy server is running, but the dev server may not be started yet.
Make sure to start your dev server (e.g., 'npm run dev') before opening the browser.

# info.starting-dev-server

Starting dev server with command: %s

# info.dev-server-started

Dev server started at: %s

# info.watching-manifest

Watching webapp.json for changes...

# info.manifest-reloaded

✓ Manifest reloaded successfully

# info.dev-url-changed

Dev server URL updated to: %s

# error.manifest-watch-failed

Failed to watch manifest: %s

# error.manifest-not-found

webapp.json not found in the current directory. Run 'sf webapp generate' to create a new web app.

# error.manifest-invalid

Invalid webapp.json: %s

# error.manifest-validation-failed

Manifest validation failed:
%s

# error.org-not-found

Org '%s' not found. Check available orgs with 'sf org list'.

# error.org-auth-failed

Failed to authenticate with org '%s'. Run 'sf org login web --alias %s' to re-authenticate.

# error.token-expired

Your org authentication has expired. Run 'sf org login web --alias %s' to re-authenticate.

# error.token-refresh-failed

Failed to refresh access token. Run 'sf org login web --alias %s' to re-authenticate.

# error.dev-server-failed

Dev server failed to start: %s

# error.dev-server-command-required

No dev server URL provided and webapp.json does not contain dev.command or dev.url. Please provide --url flag or configure dev settings in webapp.json.

# error.dev-server-timeout

Dev server did not start within 30 seconds. Check the command in webapp.json and ensure your dev server outputs its URL to stdout.

# error.port-in-use

Port %s is already in use. Try a different port with --port flag.

# error.proxy-start-failed

Failed to start proxy server: %s

# error.network-error

Network error: %s. Check your internet connection.

# error.request-failed

Request to %s failed: %s

# error.invalid-url

Invalid URL: %s

# error.connection-refused

Connection refused to %s. Ensure the dev server is running.

# warning.no-manifest-dev-config

webapp.json does not contain dev configuration. Using provided --url flag.

# warning.manifest-dev-command-override

webapp.json contains dev.command but --url flag provided. Using --url flag.

# warning.dev-command-changed

dev.command changed to "%s" - restart the command to apply this change.

# warning.dev-server-stderr

Dev server error: %s

# debug.request-received

[REQUEST] %s %s

# debug.routing-decision

[ROUTING] %s -> %s (auth: %s)

# debug.auth-headers-injected

[AUTH] Authorization headers injected

# debug.proxying-request

[PROXY] Forwarding to %s

# debug.response-received

[RESPONSE] %s %s

# debug.websocket-upgrade

[WEBSOCKET] Upgrading connection for %s

# debug.manifest-change-detected

[MANIFEST] Change detected, reloading...

# debug.token-refresh-attempt

[AUTH] Token expired, attempting refresh...

# debug.token-refresh-success

[AUTH] Token refresh successful
