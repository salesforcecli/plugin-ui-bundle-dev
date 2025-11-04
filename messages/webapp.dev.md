# summary

Preview a web app locally without needing to deploy

# description

Start a local development server to preview your web app without deploying to Salesforce. This enables rapid development with hot reloading and immediate feedback.

# flags.name.summary

Name of your web app

# flags.port.summary

Port number for the development server

# examples

- Start the development server:

  <%= config.bin %> <%= command.id %>

- Start the development server for a specific web app:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Start the development server on a custom port:

  <%= config.bin %> <%= command.id %> --name myWebApp --port 8080
