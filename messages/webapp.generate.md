# summary

Create a web app and associated metadata.

# description

This command creates a new web app with the specified configuration, including the basic structure and metadata files.

# flags.name.summary

Name of your web app

# flags.label.summary

Human readable name of your web app

# flags.template.summary

Template to use for web app generation (pulls from central solution)

# flags.wizard.summary

Run in interactive wizard mode

# examples

- Create an empty web app:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My first Web App"

- Create a web app with a specific template:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My Web App" --template "React app starter"

- Create a web app using the wizard:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My Web App" --wizard
