# summary

Preview a UI bundle locally and in real-time, without deploying it to your org.

# description

This command starts a local development (dev) server so you can preview a UI bundle using the local metadata files in your DX project. Using a local preview helps you quickly develop UI bundles, because you don't have to continually deploy metadata to your org.

The command also launches a local proxy server that sits between your UI bundle and Salesforce, automatically injecting authentication headers from Salesforce CLI's stored tokens. The proxy allows your UI bundle to make authenticated API calls to Salesforce without exposing credentials.

Even though you're previewing the UI bundle locally and not deploying anything to an org, you're still required to authorize and specify an org to use this command.

Salesforce UI bundles are represented by the UiBundle metadata type.

# flags.name.summary

Name of the UI bundle to preview.

# flags.name.description

The unique name of the UI bundle, as defined by the "name" property in the ui-bundle.json runtime configuration file.  The ui-bundle.json file is located in the "uiBundles" metadata directory of your DX project, such as force-app/main/default/uiBundles/MyApp/ui-bundle.json.

If you don't specify this flag, the command automatically discovers the ui-bundle.json files in the current directory and subdirectories. If the command finds only one ui-bundle.json, it automatically uses it. If it finds multiple files, the command prompts you to select one.

# flags.url.summary

URL where your developer server runs, such as https://localhost:5173. All UI, static, and hot deployment requests are forwarded to this URL.

# flags.url.description

You must specify this flag if the UI bundle's ui-bundle.json file doesn't contain a value for either the "dev.command" or "dev.url" configuration properties. All non-Salesforce API requests are forwarded to this URL.

If you specify this flag, it overrides the value in the ui-bundle.json file.

This is the order of precedence that the dev server uses for the URL:  --url flag > manifest dev.url > URL from the dev server process (which was started using either manifest dev.command or default npm run dev).

# flags.port.summary

Local port where the proxy server listens.

# flags.port.description

Be sure your browser connects to this port, and not directly to the dev server. The proxy then forwards authenticated requests to Salesforce and other requests to your local dev server.

# flags.open.summary

Automatically open the proxy server URL in your default browser when the dev server is ready.

# flags.open.description

This flag saves you from manually copying and pasting the URL. The browser opens to the proxy URL, and not the dev server URL directly, which ensures that all requests are property authenticated.

# examples

- Start the local development (dev) server by automatically discovering the UI bundle's ui-bundle.json file; use the org with alias "myorg":

  <%= config.bin %> <%= command.id %> --target-org myorg

- Start the dev server by explicitly specifying the UI bundle's name:

  <%= config.bin %> <%= command.id %> --name myUiBundle --target-org myorg

- Start at the specified dev server URL:

  <%= config.bin %> <%= command.id %> --name myUiBundle --url http://localhost:5173 --target-org myorg

- Start with a custom proxy port and automatically open the proxy server URL in your browser:

  <%= config.bin %> <%= command.id %> --target-org myorg --port 4546 --open

- Start with debug logging enabled by specifing the SF_LOG_LEVEL environment variable before running the command:

  SF_LOG_LEVEL=debug <%= config.bin %> <%= command.id %> --target-org myorg

# info.manifest-changed

Manifest %s detected.

# info.manifest-reloaded

✓ Manifest reloaded successfully.

# info.dev-url-changed

Dev server URL updated to: %s.

# info.dev-server-url

Dev server URL: %s.

# info.proxy-url

Proxy URL: %s (open this URL in your browser).

# info.ready-for-development

✅ Ready for development!
  → %s (open this URL in your browser).

# info.ready-for-development-vite

✅ Ready for development!
  → %s (Vite proxy active - open this URL in your browser).

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

✓ Dev server is responding at: %s.

# info.dev-server-detected

✅ Dev server detected at %s.

# info.start-dev-server-hint

Start your dev server to continue development.

# warning.dev-server-not-responding

⚠ Dev server returned status %s from: %s.

# warning.dev-server-unreachable

⚠ Dev server is not responding at: %s.

# warning.dev-server-unreachable-status

⚠️  Dev server unreachable at %s.

# warning.dev-server-start-hint

The proxy server is running, but the dev server may not be started yet.
Make sure to start your dev server (e.g., 'npm run dev') before opening the browser.

# warning.dev-command-changed

dev.command changed to "%s" - restart the command to apply this change.

# error.manifest-watch-failed

Failed to watch manifest: %s.

# error.dev-url-unreachable

Dev server unreachable at %s.
Start your dev server manually at that URL, or add dev.command to ui-bundle.json to start it automatically.

# error.dev-url-unreachable-with-flag

Dev server unreachable at %s.
Remove --url to use dev.command to start the server automatically, or ensure your dev server is running at that URL.

# error.port-in-use

Port %s is already in use. Try specifying a different port with the --port flag or stopping the service that's using the port.

# error.dev-server-failed

%s

# info.multiple-uiBundles-found

Found %s UI bundles in project.

# info.uiBundle-auto-selected

Auto-selected UI bundle "%s" (running from inside its folder).

# info.using-uiBundle

✅ Using UI bundle: %s (%s).

# info.starting-uiBundle

✅ Starting %s.

# prompt.select-uiBundle

Select the UI bundle to run:

# info.no-manifest-defaults

No ui-bundle.json found. Using defaults: dev command=%s, proxy port=%s.

Tip: See "sf ui-bundle dev --help" for configuration options.

# warning.empty-manifest

No dev configuration in ui-bundle.json - using defaults (command: %s).

Tip: See "sf ui-bundle dev --help" for configuration options.

# info.using-defaults

Using default dev command: %s.

# info.url-already-available

✅ URL %s is already available, skipping dev server startup (proxy-only mode).

# warning.url-mismatch

⚠️  The --url flag (%s) does not match the actual dev server URL (%s).
The proxy will use the actual dev server URL.

# info.vite-proxy-detected

Vite UI bundle proxy detected at %s - using Vite's built-in proxy (standalone proxy skipped).
