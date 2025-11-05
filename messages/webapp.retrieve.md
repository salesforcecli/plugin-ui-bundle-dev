# summary

Retrieve the web app, its assets and associated metadata

# description

This command retrieves your web app, its assets, and associated metadata from your Salesforce org to your local environment. Useful for syncing remote changes or setting up a local development environment.

# flags.name.summary

Name of your web app to retrieve

# flags.no-overwrite.summary

Prevent overwriting existing local files

# flags.ignore.summary

File pattern to ignore during retrieval (e.g., "dist/\*\*")

# examples

- Retrieve a web app:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Retrieve a web app with overwrite protection:

  <%= config.bin %> <%= command.id %> --name myWebApp --no-overwrite

- Retrieve a web app while ignoring specific files:

  <%= config.bin %> <%= command.id %> --name myWebApp --ignore "dist/\*\*"

- Retrieve with both options:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --no-overwrite --ignore "dist/\*\*"
