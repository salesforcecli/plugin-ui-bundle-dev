# summary

Create a web app and associated metadata

# description

Create a web app and associated metadata

# flags.name.summary

Name of your web app

# flags.label.summary

Human readable name of your web app

# flags.target.summary

Target platform for the web app (Site, Embed, or Lightning)

# flags.template.summary

Template to use for web app generation (pulls from central solution)

# flags.wizard.summary

Run in interactive wizard mode

# examples

- Create an empty web app:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My first Web App"

- Create a web app with a specific target:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My Web App" --target Site

- Create a web app using the wizard:

  <%= config.bin %> <%= command.id %> --name "myWebApp" --label "My Web App" --wizard
