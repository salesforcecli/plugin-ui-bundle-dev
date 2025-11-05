# summary

Preview a web app locally without needing to deploy

# description

Starts a local development server for a Web Application, using the local project files. This enables rapid development with hot reloading and immediate feedback.

# flags.name.summary

Identifies the Web Application

# flags.target.summary

Selects which Web Application target to use for the preview (e.g., Lightning App, Site)

# flags.root-dir.summary

Optional override for the local project root of this Web Application

# flags.port.summary

Port for the dev server

# flags.host.summary

Host to bind to

# flags.no-open.summary

Do not automatically open the browser

# examples

- Start the development server:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Start the development server with a specific target:

  <%= config.bin %> <%= command.id %> --name myWebApp --target "LightningApp"

- Start the development server on a custom port and host:

  <%= config.bin %> <%= command.id %> --name myWebApp --port 8080 --host 0.0.0.0

- Start the development server with custom root directory:

  <%= config.bin %> <%= command.id %> --name myWebApp --root-dir ./webapps/myWebApp

- Start the development server without opening the browser:

  <%= config.bin %> <%= command.id %> --name myWebApp --no-open
