# Commands

<!-- commands -->

- [`sf ui-bundle dev`](#sf-ui-bundle-dev)

## `sf ui-bundle dev`

Start a local development proxy server for UI Bundle development with Salesforce authentication.

```
USAGE
  $ sf ui-bundle dev -o <value> [--json] [--flags-dir <value>] [-n <value>] [-u <value>] [-p <value>] [-b]

FLAGS
  -b, --open               Automatically open the proxy server URL in your default browser when the dev server is ready.
  -n, --name=<value>       Name of the UI bundle to preview.
  -o, --target-org=<value> (required) Username or alias of the target org. Not required if the `target-org`
                           configuration variable is already set.
  -p, --port=<value>       Local port where the proxy server listens.
  -u, --url=<value>        URL where your developer server runs, such as https://localhost:5173. All UI, static, and hot
                           deployment requests are forwarded to this URL.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Start a local development proxy server for UI Bundle development with Salesforce authentication.

  This command starts a local development (dev) server so you can preview a UI bundle using the local metadata files in
  your DX project. Using a local preview helps you quickly develop UI bundles, because you don't have to continually
  deploy metadata to your org.

  The command also launches a local proxy server that sits between your UI bundle and Salesforce, automatically
  injecting authentication headers from Salesforce CLI's stored tokens. The proxy allows your UI bundle to make
  authenticated API calls to Salesforce without exposing credentials.

  Even though you're previewing the UI bundle locally and not deploying anything to an org, you're still required to
  authorize and specify an org to use this command.

  Salesforce UI bundles are represented by the UiBundle metadata type.

EXAMPLES
  Start the local development (dev) server by automatically discovering the UI bundle's ui-bundle.json file; use the
  org with alias "myorg":

    $ sf ui-bundle dev --target-org myorg

  Start the dev server by explicitly specifying the UI bundle's name:

    $ sf ui-bundle dev --name myBundle --target-org myorg

  Start at the specified dev server URL:

    $ sf ui-bundle dev --name myBundle --url http://localhost:5173 --target-org myorg

  Start with a custom proxy port and automatically open the proxy server URL in your browser:

    $ sf ui-bundle dev --target-org myorg --port 4546 --open

  Start with debug logging enabled by specifying the SF_LOG_LEVEL environment variable before running the command:

    $ SF_LOG_LEVEL=debug sf ui-bundle dev --target-org myorg
```

<!-- commandsstop -->
