# summary

Preview a web app locally without needing to deploy

# description

Starts a local development server for a Web Application, using the local project files. This enables rapid development with hot reloading and immediate feedback.

# flags.name.summary

Identifies the Web Application

# flags.target.summary

Selects which Web Application target to use for the preview (e.g., Lightning App, Site)

# flags.port.summary

Port for the dev server

# examples

- Start the development server:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Start the development server with a specific target:

  <%= config.bin %> <%= command.id %> --name myWebApp --target "LightningApp"

- Start the development server on a custom port:

  <%= config.bin %> <%= command.id %> --name myWebApp --port 8080
