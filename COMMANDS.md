# Commands

<!-- commands -->

- [`sf multi dev`](#sf-multi-dev)

## `sf multi dev`

Start a local development proxy server for multi-framework webapp development with Salesforce authentication.

```
USAGE
  $ sf multi dev -n <value> -o <value> [--json] [--flags-dir <value>] [-u <value>] [-p <value>] [--open]

REQUIRED FLAGS
  -n, --name=<value>         Name of the webapp (must match webapplication.json)
  -o, --target-org=<value>   Salesforce org to authenticate against

OPTIONAL FLAGS
  -u, --url=<value>   Dev server URL. Command mode: override default 5173. URL-only: required (server must be running)
  -p, --port=<value>  Proxy server port (default: 4545)
  --open              Open browser automatically

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Starts a local HTTP proxy that injects Salesforce authentication and routes
  requests between your dev server and Salesforce APIs. In command mode,
  spawns and monitors the dev server (default URL: localhost:5173). In
  URL-only mode, connects to an already-running dev server.

EXAMPLES
  Command mode (CLI starts dev server, default port 5173):

    $ sf multi dev --name myapp --target-org myorg --open

  URL-only mode (dev server already running):

    $ sf multi dev --name myapp --target-org myorg --url http://localhost:5173 --open

  Custom proxy port:

    $ sf multi dev --name myapp --target-org myorg --port 8080 --open
```

<!-- commandsstop -->
