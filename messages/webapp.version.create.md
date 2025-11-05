# summary

Create a version for a web app

# description

Create a new version for your Salesforce web app. This command generates version metadata and tags the web app with the specified version number.

# flags.name.summary

Name of your web app

# flags.version.summary

Version number (e.g., 1.0.0)

# examples

- Create a version for a web app:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --version "1.0.0"

- Create a version without specifying version number:

  <%= config.bin %> <%= command.id %> --name "myWebApp"
