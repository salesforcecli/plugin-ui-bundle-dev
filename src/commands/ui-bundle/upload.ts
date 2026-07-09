/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import FormData from 'form-data';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
// ZipWriter isn't re-exported from SDR's package root; import it from its module directly.
import { ZipWriter } from '@salesforce/source-deploy-retrieve/lib/src/convert/streams.js';
import type { UiBundleUploadResult } from '../../config/types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-ui-bundle-dev', 'ui-bundle.upload');

/** Recursively collect absolute paths of every file under a directory. */
function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/** Compress a source directory into a zip Buffer using SDR's ZipWriter. */
async function compressDirectory(dir: string): Promise<Buffer> {
  const writer = new ZipWriter();
  for (const file of collectFiles(dir)) {
    // Entry paths inside a zip are always posix; normalize Windows separators.
    const entryPath = relative(dir, file).split(sep).join('/');
    writer.addToZip(readFileSync(file), entryPath);
  }
  // An empty directory produces no zip entries; reject rather than POST an empty bundle.
  if (writer.fileCount === 0) {
    throw new SfError('The bundle source directory is empty.', 'UiBundleUploadValidationError');
  }
  // ZipWriter is a Writable; finalize via end() and read .buffer once it drains.
  await new Promise<void>((resolve, reject) => {
    writer.end((err?: Error) => (err ? reject(err) : resolve()));
  });
  if (!writer.buffer) {
    throw new SfError('Failed to compress the bundle source directory.', 'UiBundleUploadValidationError');
  }
  return writer.buffer;
}

export default class UiBundleUpload extends SfCommand<UiBundleUploadResult> {
  public static readonly state = 'preview';
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'zip-file': Flags.file({
      summary: messages.getMessage('flags.zip-file.summary'),
      description: messages.getMessage('flags.zip-file.description'),
      char: 'z',
      exists: true,
      exactlyOne: ['zip-file', 'bundle-dir'],
    }),
    'bundle-dir': Flags.directory({
      summary: messages.getMessage('flags.bundle-dir.summary'),
      description: messages.getMessage('flags.bundle-dir.description'),
      char: 'd',
      exists: true,
      exactlyOne: ['zip-file', 'bundle-dir'],
    }),
    'as-salesforce-pages': Flags.boolean({
      summary: messages.getMessage('flags.as-salesforce-pages.summary'),
      description: messages.getMessage('flags.as-salesforce-pages.description'),
      required: true,
    }),
    'target-org': Flags.requiredOrg(),
  };

  public async run(): Promise<UiBundleUploadResult> {
    const { flags } = await this.parse(UiBundleUpload);

    // Step 1: Resolve the org connection.
    let orgConnection: ReturnType<(typeof flags)['target-org']['getConnection']>;
    try {
      orgConnection = flags['target-org'].getConnection(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SfError(errorMessage, 'UiBundleUploadAuthError');
    }

    // Step 2: Stage the zip. Contents are never validated here; that's a server-side concern.
    // --bundle-dir is compressed on the fly; --zip-file is read and sent as-is.
    const bundleDir = flags['bundle-dir'];
    let zipBuffer: Buffer;
    let zipFilename: string;
    if (bundleDir) {
      zipBuffer = await compressDirectory(bundleDir);
      zipFilename = `${basename(bundleDir)}.zip`;
    } else {
      const zipFile = flags['zip-file']!;
      zipBuffer = readFileSync(zipFile);
      zipFilename = basename(zipFile);
    }

    // Step 3: Build the multipart body and issue a single synchronous POST, no retry/poll loop.
    // We send form.getBuffer() (the fully-assembled multipart Buffer) since jsforce's instanceof FormData check fails across differing form-data module copies.
    const form = new FormData();
    form.append('bundle', zipBuffer, { filename: zipFilename });
    // 'pages' is a placeholder field name pending the finalized server contract.
    form.append('pages', String(flags['as-salesforce-pages']));

    let response: { jobId: string; status: string; message?: string };
    try {
      response = await orgConnection.request<{ jobId: string; status: string; message?: string }>({
        method: 'POST',
        url: `${orgConnection.baseUrl()}/connect/uibundle/deploys`,
        body: form.getBuffer(),
        headers: form.getHeaders(),
      });
    } catch (error) {
      // jsforce HTTP errors carry an `errorCode`; anything else means the request never reached the server.
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (error && typeof error === 'object' && 'errorCode' in error) {
        throw new SfError(errorMessage, 'UiBundleUploadValidationError');
      }
      throw new SfError(errorMessage, 'UiBundleUploadNetworkError');
    }

    // Step 4: Map the response. The server is only expected to return `Queued`; `Failed` is handled defensively.
    if (response.status === 'Failed') {
      // logToStderr, like log, is a no-op under --json.
      this.logToStderr(
        ['✗ Upload failed', `  Job ID:   ${response.jobId}`, `  Message:  ${response.message ?? ''}`].join('\n')
      );
      // oclif has no built-in way to set a non-zero exit for a returned (non-thrown) result, so set it manually.
      process.exitCode = 1;
      return { jobId: response.jobId, status: 'Failed', message: response.message };
    }

    if (response.status === 'Queued') {
      this.log(messages.getMessage('info.upload-queued'));
      this.log(messages.getMessage('info.job-id', [response.jobId]));
      return { jobId: response.jobId, status: 'Queued' };
    }

    // Any other status (InProgress/Succeeded) isn't reachable from this single synchronous POST.
    return response as UiBundleUploadResult;
  }
}
