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

Proxy URL: %s (open this in your browser)

# info.ready-for-development

✅ Ready for development!
→ Proxy: %s (open this in your browser)
→ Dev server: %s

# info.press-ctrl-c

Press Ctrl+C to stop the server

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

# error.dev-server-failed

%s

# info.multiple-webapps-found

Found %s webapps in project

# info.webapp-auto-selected

Auto-selected webapp "%s" (running from inside its folder)

# info.using-webapp

✅ Using webapp: %s (%s)

# prompt.select-webapp

Select the webapp to run:

# warning.no-manifest

No webapplication.json found for webapp "%s"
Location: %s

Using defaults:
→ Name: "%s" (derived from folder)
→ Command: "%s"
→ Manifest watching: disabled

💡 To customize, create a webapplication.json file in your webapp directory.

# warning.empty-manifest

webapplication.json found for webapp "%s" but has no dev configuration
Location: %s

Using defaults:
→ Name: "%s" (derived from folder)
→ Command: "%s"
→ Manifest watching: enabled

💡 To customize, add dev configuration to your webapplication.json file.
Example:
{
"dev": {
"command": "npm run dev"
}
}

# info.using-defaults

Using default dev command: %s
