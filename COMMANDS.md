# Commands

<!-- commands -->

- [`sf webapp deploy`](#sf-webapp-deploy)
- [`sf webapp dev`](#sf-webapp-dev)
- [`sf webapp generate`](#sf-webapp-generate)
- [`sf webapp retrieve`](#sf-webapp-retrieve)
- [`sf webapp version create`](#sf-webapp-version-create)

## `sf webapp deploy`

Deploy the web app, its assets and associated metadata

```
USAGE
  $ sf webapp deploy -n <value> [--json] [--flags-dir <value>] [-o build|validate]

FLAGS
  -n, --name=<value>      (required) Name of your web app
  -o, --options=<option>  [default: build] Deployment options (build or validate)
                          <options: build|validate>

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Deploy the web app, its assets and associated metadata

  This command deploys your web app, its assets, and associated metadata to your Salesforce org. Use the build option
  to build and deploy, or the validate option to check deployment without making changes.

EXAMPLES
  Deploy a web app:

    $ sf webapp deploy --name myWebApp

  Deploy a web app with specific options:

    $ sf webapp deploy --name myWebApp --options build
```

## `sf webapp dev`

Preview a web app locally without needing to deploy

```
USAGE
  $ sf webapp dev -n <value> [--json] [--flags-dir <value>] [-t <value>] [-r <value>] [-p <value>]
    [--host <value>] [--no-open]

FLAGS
  -n, --name=<value>      (required) Identifies the Web Application
  -p, --port=<value>      [default: 8080] Port for the dev server
  -r, --root-dir=<value>  Optional override for the local project root of the given Web Application
  -t, --target=<value>    Selects which Web Application target to use for the preview (e.g., Lightning App, Site)
      --host=<value>      [default: localhost] Host to bind to
      --no-open           Do not automatically open the browser

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

  Start the development server on a custom port and host:

    $ sf webapp dev --name myWebApp --port 8080 --host 0.0.0.0

  Start the development server with custom root directory:

    $ sf webapp dev --name myWebApp --root-dir ./webapps/myWebApp

  Start the development server without opening the browser:

    $ sf webapp dev --name myWebApp --no-open
```

## `sf webapp generate`

Create a web app and associated metadata

```
USAGE
  $ sf webapp generate -n <value> -l <value> [--json] [--flags-dir <value>] [-t Site|Embed|Lightning]
    [-r <value>] [-w]

FLAGS
  -l, --label=<value>     (required) Human readable name of your web app
  -n, --name=<value>      (required) Name of your web app
  -r, --template=<value>  [default: empty] Template to use for web app generation (pulls from central solution)
  -t, --target=<option>   [default: empty] Target platform for the web app (Site, Embed, or Lightning)
                          <options: Site|Embed|Lightning>
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

  Create a web app with a specific target:

    $ sf webapp generate --name "myWebApp" --label "My Web App" --target Site

  Create a web app using the wizard:

    $ sf webapp generate --name "myWebApp" --label "My Web App" --wizard
```

## `sf webapp retrieve`

Retrieve the web app, its assets and associated metadata

```
USAGE
  $ sf webapp retrieve -n <value> [--json] [--flags-dir <value>] [--no-overwrite] [-i <value>]

FLAGS
  -i, --ignore=<value>  File pattern to ignore during retrieval (e.g., "dist/**")
  -n, --name=<value>    (required) Name of your web app to retrieve
      --no-overwrite    Prevent overwriting existing local files

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Retrieve the web app, its assets and associated metadata

  This command retrieves your web app, its assets, and associated metadata from your Salesforce org to your local
  environment. Useful for syncing remote changes or setting up a local development environment.

EXAMPLES
  Retrieve a web app:

    $ sf webapp retrieve --name myWebApp

  Retrieve a web app with overwrite protection:

    $ sf webapp retrieve --name myWebApp --no-overwrite

  Retrieve a web app while ignoring specific files:

    $ sf webapp retrieve --name myWebApp --ignore "dist/**"

  Retrieve with both options:

    $ sf webapp retrieve --name "myWebApp" --no-overwrite --ignore "dist/**"
```

## `sf webapp version create`

Create a version for a web app

```
USAGE
  $ sf webapp version create -n <value> [--json] [--flags-dir <value>] [-v <value>]

FLAGS
  -n, --name=<value>     (required) Name of your web app
  -v, --version=<value>  Version number (e.g., 1.0.0)

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Create a version for a web app

  Create a new version for your Salesforce web app. This command generates version metadata and tags the web app with
  the specified version number.

EXAMPLES
  Create a version for a web app:

    $ sf webapp version create --name "myWebApp" --version "1.0.0"

  Create a version without specifying version number:

    $ sf webapp version create --name "myWebApp"
```

<!-- commandsstop -->
