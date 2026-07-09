# summary

Upload a UI Bundle to your org.

# description

Use this command to upload a React-based UI Bundle to your Salesforce org. The bundle source must be a compressed ZIP file. This can be used by both admin and non-admin users.

The upload is asynchronous. View the UI bundle in your org to verify completion.

# flags.zip-file.summary

Path to the UI Bundle source to upload.

# flags.zip-file.description

The path to a compressed ZIP file containing the UI Bundle source. The CLI doesn't validate the contents of the zip file — that's a server-side concern.

# flags.use-pages.summary

Toggle whether this UI Bundle should be uploaded to Salesforce Pages.

# flags.use-pages.description

When set, the UI Bundle is uploaded for use with Salesforce Pages.

# examples

- Upload a UI Bundle to Salesforce Pages using your default org:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle --use-pages

- Upload to a specific org by alias:

  <%= config.bin %> <%= command.id %> --zip-file my-compressed-bundle --use-pages --target-org my-org

# info.upload-queued

Upload queued successfully.

# info.job-id

Job ID: %s.

# error.upload-failed

Upload failed.

# error.auth-failed

Failed to authenticate with the target org: %s.

# error.network-failed

Network request to upload the UI Bundle failed: %s.

# error.validation-failed

The org rejected the upload request: %s.
