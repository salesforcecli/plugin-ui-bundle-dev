# summary

Deploy the web app, its assets and associated metadata

# description

This command builds and deploys your web app and associated metadata to your Salesforce org. It packages all assets, applies configurations, and ensures proper deployment of all components. One Runtime in Agentforce Vibes goes from Code → Metadata/Files. The default "build" option will run the necessary commands to produce the bundle and metadata to deploy the One Runtime App.

# flags.name.summary

Name of your web app

# flags.options.summary

Deployment options (build or value)

# examples

- Deploy a web app:

  <%= config.bin %> <%= command.id %> --name myWebApp

- Deploy a web app with specific options:

  <%= config.bin %> <%= command.id %> --name myWebApp --options build
