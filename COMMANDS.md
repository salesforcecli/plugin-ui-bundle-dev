# Commands

<!-- commands -->

- [`sf ui-bundle dev`](#sf-ui-bundle-dev)
- [`sf ui-bundle upload`](#sf-ui-bundle-upload)

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

## `sf ui-bundle upload`

Upload a UI Bundle to your org.

```
USAGE
  $ sf ui-bundle upload -z <value> --as-salesforce-pages -o <value> [--json] [--flags-dir <value>]

FLAGS
  -o, --target-org=<value>  (required) Username or alias of the target org. Not required if the `target-org`
                            configuration variable is already set.
  -z, --zip-file=<value>    (required) Path to the UI Bundle source to upload.
      --as-salesforce-pages (required) Toggle whether this UI Bundle should be uploaded to Salesforce Pages.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Upload a UI Bundle to your org.

  Use this command to upload a React-based UI Bundle to your Salesforce org. The bundle source must be a compressed ZIP
  file. This can be used by both admin and non-admin users.

  The upload is asynchronous. View the UI bundle in your org to verify completion.

EXAMPLES
  Upload a UI Bundle to Salesforce Pages using your default org:

    $ sf ui-bundle upload --zip-file my-compressed-bundle --as-salesforce-pages

  Upload to a specific org by alias:

    $ sf ui-bundle upload --zip-file my-compressed-bundle --as-salesforce-pages --target-org my-org

FLAG DESCRIPTIONS
  -z, --zip-file=<value>  Path to the UI Bundle source to upload.

    The path to a compressed ZIP file containing the UI Bundle source. The CLI doesn't validate the contents of the zip
    file — that's a server-side concern.

  --as-salesforce-pages  Toggle whether this UI Bundle should be uploaded to Salesforce Pages.

    When set, the UI Bundle is uploaded for use with Salesforce Pages.
```

<!-- commandsstop -->
