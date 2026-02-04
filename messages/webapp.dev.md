# summary

Preview a web application locally and in real-time, without deploying it to your org.

# description

This command starts a local development server so you can preview a web application using the local metadata files in your DX project. Using a local preview helps you quickly develop web applications, because you don't have to continually deploy metadata to your org. It also provides hot reloading; because you don't have to manually refresh, you get immediate feedback about your code changes.

The command also launches a local proxy server that sits between your web application and Salesforce, automatically injecting authentication headers from Salesforce CLI's stored tokens. The proxy server allows your web app to make authenticated API calls to Salesforce without exposing credentials. When opening a browser to view the web application, you connect to the proxy server and not the development server.

Even though you're previewing the web application locally and not deploying anything to an org, you're still required to authorize and specify an org to use this command.

Salesforce web applications are represented by the WebApplication metadata type.

# flags.name.summary

Name of the web application to preview.

# flags.name.description

The unique name of the web application, as defined by the "name" property in the webapplication.json runtime configuration file. The webapplication.json file is located in the <package-dir>/webApplications/<web-app-name> directory of your DX project, such as force-app/main/default/webApplicatons/MyApp/webapplication.json.

If you don't specify this flag, the command automatically discovers the webapplication.json files in the current directory and subdirectories. If the command finds only one webapplication.json, it automatically uses it. If it finds multiple files, the command prompts you to select one.

# flags.url.summary

URL where your developer server runs, such as https://localhost:5173. All UI, static, and hot deployment requests are forwarded to this URL.

# flags.url.description

You must specify this flag if the web application's webapplication.json file doesn't contain a value for either the "dev.command" or "dev.url" configuration properties. All non-Salesforce API requests are forwarded to this URL.

If you specify this flag, it overrides the value in the webapplication.json file.

# flags.port.summary

Local port where the proxy server listens.

# flags.port.description

Be sure your browser connects to this port, and not directly to the development server. The proxy then forwards authenticated requests to Salesforce and other requests to your local development server.

# flags.open.summary

Automatically open the proxy server URL in your default browser when the development server is ready.

# flags.open.description

This flag saves you from manually copying and pasting the URL. The browser opens to the proxy URL, and not the development server URL directly, which ensures that all requests are property authenticated.

# examples

- Start the local development server by automatically discovering the web application's webapplication.json file; use the org with alias "myorg":

  <%= config.bin %> <%= command.id %> --target-org myorg

- Start the development server by explicitly specifying the web application's name:

  <%= config.bin %> <%= command.id %> --name myWebApp --target-org myorg

- Start at the specified development server URL:

  <%= config.bin %> <%= command.id %> --name myWebApp --url http://localhost:5173 --target-org myorg

- Start with a custom proxy port and automatically open the proxy server URL in your browser:

  <%= config.bin %> <%= command.id %> --target-org myorg --port 4546 --open

- Start with debug logging enabled by specifing the SF_LOG_LEVEL environment variable before running the command:

  SF_LOG_LEVEL=debug <%= config.bin %> <%= command.id %> --target-org myorg

# info.manifest-changed

Manifest %s detected.

# info.manifest-reloaded

✓ Manifest reloaded successfully.

# info.dev-url-changed

Development server URL updated to: %s.

# info.dev-server-url

Development server URL: %s.

# info.proxy-url

Proxy URL: %s (open this in your browser).

# info.ready-for-development

✓ Ready for development!

# info.press-ctrl-c

Press Ctrl+C to stop the server.

# info.dev-server-healthy

✓ Development server is responding at: %s.

# info.dev-server-detected

✅ Development server detected at %s.

# info.start-dev-server-hint

Start your development server to continue development.

# warning.dev-server-not-responding

⚠ Development server returned status %s from: %s.

# warning.dev-server-unreachable

⚠ Development server is not responding at: %s.

# warning.dev-server-unreachable-status

⚠️ Development server unreachable at %s.

# warning.dev-server-start-hint

The proxy server is running, but the development server may not have started yet.
Make sure to start your development server (such as 'npm run dev') before opening the browser.

# warning.dev-command-changed

dev.command changed to "%s" - restart the command to apply this change.

# error.manifest-watch-failed

Failed to watch manifest: %s.

# error.dev-server-failed

Development server failed to start: %s.

# info.multiple-webapps-found

Found %s webapplication.json files in this DX project.

# info.using-webapp

Using web application: %s (%s).

# prompt.select-webapp

Select the web application to run:
