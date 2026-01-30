# Commands

<!-- commands -->

- [`sf webapp dev`](#sf-webapp-dev)

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

<!-- commandsstop -->
