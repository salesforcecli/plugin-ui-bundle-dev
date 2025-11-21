# Commands

<!-- commands -->

- [`sf webapp dev`](#sf-webapp-dev)
- [`sf webapp generate`](#sf-webapp-generate)

## `sf webapp dev`

Preview a web app locally without needing to deploy

```
USAGE
  $ sf webapp dev -n <value> [--json] [--flags-dir <value>] [-t <value>] [-p <value>]

FLAGS
  -n, --name=<value>    (required) Identifies the Web Application
  -p, --port=<value>    [default: 5173] Port for the dev server
  -t, --target=<value>  Selects which Web Application target to use for the preview (e.g., Lightning App, Site)

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Preview a web app locally without needing to deploy

  Starts a local development server for a Web Application, using the local project files. This enables rapid
  development with hot reloading and immediate feedback.

EXAMPLES
  Start the development server:

    $ sf webapp dev --name myWebApp

  Start the development server with a specific target:

    $ sf webapp dev --name myWebApp --target "LightningApp"

  Start the development server on a custom port:

    $ sf webapp dev --name myWebApp --port 8080
```

## `sf webapp generate`

Create a web app and associated metadata.

```
USAGE
  $ sf webapp generate -n <value> -l <value> [--json] [--flags-dir <value>] [-t <value>] [-w]

FLAGS
  -l, --label=<value>     (required) Human readable name of your web app
  -n, --name=<value>      (required) Name of your web app
  -t, --template=<value>  [default: empty] Template to use for web app generation (pulls from central solution)
  -w, --wizard            Run in interactive wizard mode

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Create a web app and associated metadata.

  This command creates a new web app with the specified configuration, including the basic structure and metadata
  files.

EXAMPLES
  Create an empty web app:

    $ sf webapp generate --name "myWebApp" --label "My first Web App"

  Create a web app with a specific template:

    $ sf webapp generate --name "myWebApp" --label "My Web App" --template "React app starter"

  Create a web app using the wizard:

    $ sf webapp generate --name "myWebApp" --label "My Web App" --wizard
```

<!-- commandsstop -->
