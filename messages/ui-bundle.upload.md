# summary

Upload a UI Bundle to your org.

# description

Use this command to upload a React-based UI Bundle to your Salesforce org. Provide the bundle source as either a compressed ZIP file (--zip-file) or an uncompressed source directory (--bundle-dir). This command will compress it for you. This can be used by both admin and non-admin users.

The upload is asynchronous. View the UI bundle in your org to verify upload completion.

# flags.zip-file.summary

Path to the UI Bundle source to upload.

# flags.zip-file.description

The path to a compressed ZIP file containing the UI Bundle source.

# flags.bundle-dir.summary

Path to an uncompressed UI Bundle source directory. 

# flags.bundle-dir.description

The path to an uncompressed directory containing the UI Bundle source. This command compresses the directory into a ZIP file before uploading. 

# flags.as-salesforce-pages.summary

Toggle whether this UI Bundle should be uploaded to Salesforce Pages. Currently this is a required flag as only Salesforce Pages uploads are supported.

# flags.as-salesforce-pages.description

When specified, the UI Bundle is uploaded for use with Salesforce Pages.

# examples

- Upload a UI Bundle to Salesforce Pages using your default org:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle --as-salesforce-pages

- Upload an uncompressed source directory (auto-compressed by the CLI):

  <%= config.bin %> <%= command.id %> --bundle-dir ./my-bundle-src --as-salesforce-pages

- Upload to a specific org by alias:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle --as-salesforce-pages --target-org my-org

# info.upload-queued

Upload queued successfully.

# info.job-id

Job ID: %s.

# error.upload-failed

✗ Upload failed
  Job ID:   %s
  Message:  %s

# error.auth-failed

Failed to authenticate with the target org: %s.

# error.network-failed

Network request to upload the UI Bundle failed: %s.

# error.validation-failed

The org rejected the upload request: %s.

# error.bundle-dir-empty

The bundle source directory is empty.

# error.compression-failed

Failed to compress the bundle source directory.
