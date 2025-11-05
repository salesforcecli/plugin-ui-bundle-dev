# summary

Deploy the web app, its assets and associated metadata

# description

This command builds and deploys your web app, its assets, and associated metadata to your Salesforce org. Use the build option to package and deploy, or the validate option to check deployment without making changes.

# flags.name.summary

Name of your web app

# flags.options.summary

Deployment options (build or validate)

# examples

- Deploy a web app:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Deploy a web app with build option:

  <%= config.bin %> <%= command.id %> --name myWebApp --options build

- Validate a web app deployment:

  <%= config.bin %> <%= command.id %> --name myWebApp --options validate
