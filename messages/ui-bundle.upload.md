# summary

Upload a UI Bundle to your org.

# description

Use this command to upload a React-based UI Bundle to your Salesforce org. Provide the bundle source as either a compressed ZIP file (--zip-file) or an uncompressed source directory (--bundle-dir). This command compresses the directory for you. This command can be used by both admin and non-admin users.

The upload is asynchronous. View the UI bundle in your org to verify upload completion.

# flags.zip-file.summary

Path to the compressed UI Bundle source to upload.

# flags.bundle-dir.summary

Path to an uncompressed UI Bundle source directory. This command compresses the directory into a ZIP file before uploading. 

# flags.use-salesforce-pages.summary

Upload UI Bundle to Salesforce Pages. This is a required flag as only Salesforce Pages uploads are currently supported.

# flags.bundle-name.summary

Name to associate with the uploaded UI Bundle.

# flags.bundle-name.description

A human-readable name for the UI Bundle. If not specified, defaults to the base name of --bundle-dir or --zip-file, with any .zip extension removed.

# examples

- Upload a UI Bundle to Salesforce Pages using your default org:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle.zip --use-salesforce-pages

- Upload an uncompressed source directory (auto-compressed by the CLI):

  <%= config.bin %> <%= command.id %> --bundle-dir ./my-bundle-src --use-salesforce-pages

- Upload to a specific org by alias:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle.zip --use-salesforce-pages --target-org my-org

# info.upload-queued

Upload queued successfully.

# info.job-id

Job ID: %s

# error.upload-failed

Upload failed
  Job ID:   %s
  Message:  %s

# error.bundle-dir-empty

The bundle source directory is empty.

# error.uiBundleUploadApiVersionError

API version %s isn't supported by this command; --api-version must be %s or later.

# error.uiBundleUploadAuthError

Authentication error: %s

# error.uiBundleUploadNetworkError

Network error: %s

# error.uiBundleUploadValidationError

Validation error: %s
