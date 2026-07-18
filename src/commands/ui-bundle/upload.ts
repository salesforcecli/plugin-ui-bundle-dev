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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import FormData from 'form-data';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import JSZip from 'jszip';
import type { UiBundleUploadResult } from '../../config/types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-ui-bundle-dev', 'ui-bundle.upload');

// Versions below this floor aren't supported by the UI Bundle deploy endpoint.
const MINIMUM_SUPPORTED_API_VERSION = 67;

// Bundle names must start with a letter and can contain other letters, digits, or underscores
const BUNDLE_DIR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Recursively collect absolute paths of every file under a directory. */
function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    // Skip dotfiles and dot-directories (e.g. .env, .git) — never bundled.
    if (name.startsWith('.')) continue;
    const full = join(root, name);
    // statSync follows symlinks to their target, so symlinked files/dirs are bundled correctly.
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...collectFiles(full));
    else if (stat.isFile()) files.push(full);
  }
  return files;
}

/**
 * Compress a source directory into a zip Buffer using jszip.
 *
 * Every entry is nested under a single top-level wrapper directory, since the Connect API's
 * ui-bundle deploy endpoint rejects zips whose entries live at the zip root — it requires all
 * entries to share one common top-level directory. The caller must supply a `wrapperDir` that
 * already satisfies the server's directory-name allowlist (UiBundleDeployService.validateZip);
 * this function doesn't validate it.
 */
async function compressDirectory(dir: string, wrapperDir: string): Promise<Buffer> {
  const zip = new JSZip();
  let fileCount = 0;
  for (const file of collectFiles(dir)) {
    // Entry paths inside a zip are always posix; normalize Windows separators.
    const entryPath = `${wrapperDir}/${relative(dir, file).split(sep).join('/')}`;
    zip.file(entryPath, readFileSync(file));
    fileCount++;
  }
  // An empty directory produces no zip entries; reject rather than POST an empty bundle.
  if (fileCount === 0) {
    throw messages.createError('error.uiBundleUploadError', [messages.getMessage('error.bundle-dir-empty')]);
  }
  // JSZip's generateAsync resolves with a Buffer or rejects; no silent-failure path exists.
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 3 } });
}

export default class UiBundleUpload extends SfCommand<UiBundleUploadResult> {
  public static readonly state = 'preview';
  public static readonly hidden = true;
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'zip-file': Flags.file({
      summary: messages.getMessage('flags.zip-file.summary'),
      char: 'z',
      exists: true,
      exactlyOne: ['zip-file', 'bundle-dir'],
    }),
    'bundle-dir': Flags.directory({
      summary: messages.getMessage('flags.bundle-dir.summary'),
      char: 'd',
      exists: true,
      exactlyOne: ['zip-file', 'bundle-dir'],
    }),
    'use-salesforce-pages': Flags.boolean({
      summary: messages.getMessage('flags.use-salesforce-pages.summary'),
      required: true,
    }),
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    'bundle-name': Flags.string({
      summary: messages.getMessage('flags.bundle-name.summary'),
      description: messages.getMessage('flags.bundle-name.description'),
    }),
  };

  public async run(): Promise<UiBundleUploadResult> {
    const { flags } = await this.parse(UiBundleUpload);

    // Step 1: Resolve the org connection.
    const orgConnection = flags['target-org'].getConnection(flags['api-version']);

    // Check the connection's resolved API version (explicit flag, org-config default, or auto-negotiated)
    // against the floor before doing any zip staging or network work.
    const apiVersion = parseInt(orgConnection.getApiVersion(), 10);
    if (apiVersion < MINIMUM_SUPPORTED_API_VERSION) {
      throw messages.createError('error.uiBundleUploadApiVersionError', [
        orgConnection.getApiVersion(),
        String(MINIMUM_SUPPORTED_API_VERSION),
      ]);
    }

    // Step 2: Stage the zip. Contents are never validated here; that's a server-side concern.
    // --bundle-dir is compressed on the fly; --zip-file is read and sent as-is.
    const bundleDir = flags['bundle-dir'];
    let zipBuffer: Buffer;
    let zipFilename: string;
    let bundleName: string;
    if (bundleDir) {
      bundleName = flags['bundle-name'] ?? basename(bundleDir);
      if (!BUNDLE_DIR_NAME_PATTERN.test(bundleName)) {
        throw messages.createError('error.uiBundleUploadError', [
          messages.getMessage('error.bundle-dir-name-invalid', [bundleName]),
        ]);
      }
      zipBuffer = await compressDirectory(bundleDir, bundleName);
      zipFilename = `${bundleName}.zip`;
    } else {
      const zipFile = flags['zip-file']!;
      zipBuffer = readFileSync(zipFile);
      zipFilename = basename(zipFile);
      // Defaults to the zip's base name (extension stripped) when --bundle-name is omitted.
      // Falls back to the unstripped filename if stripping would leave an empty string (e.g. a file literally named ".zip").
      const strippedZipFilename = zipFilename.replace(/\.zip$/i, '');
      bundleName = flags['bundle-name'] ?? (strippedZipFilename || zipFilename);
    }

    // Step 3: Build the multipart body and issue a single synchronous POST, no retry/poll loop.
    // We send form.getBuffer() (the fully-assembled multipart Buffer) since jsforce's instanceof FormData check fails across differing form-data module copies.
    const form = new FormData();
    form.append('deployRequest', JSON.stringify({ requestedName: bundleName }), { contentType: 'application/json' });
    form.append('bundle', zipBuffer, { filename: zipFilename });

    let response: { jobId: string; status: string; message?: string };
    try {
      response = await orgConnection.request<{ jobId: string; status: string; message?: string }>({
        method: 'POST',
        url: `${orgConnection.baseUrl()}/connect/ui-bundle/deployments`,
        body: form.getBuffer(),
        headers: form.getHeaders(),
      });
    } catch (error) {
      // jsforce marks a bad/expired session with these codes or this refresh-failure message; anything else with an errorCode is a server-side rejection, otherwise it never reached the server.
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode =
        error && typeof error === 'object' && 'errorCode' in error ? String(error.errorCode) : undefined;
      if (errorCode && ['INVALID_SESSION_ID', 'ERROR_HTTP_401', 'ERROR_HTTP_403'].includes(errorCode)) {
        throw messages.createError('error.uiBundleUploadAuthError', [errorMessage]);
      }
      if (errorMessage.startsWith('Unable to refresh session due to:')) {
        throw messages.createError('error.uiBundleUploadAuthError', [errorMessage]);
      }
      if (errorCode) {
        throw messages.createError('error.uiBundleUploadError', [errorMessage]);
      }
      throw messages.createError('error.uiBundleUploadNetworkError', [errorMessage]);
    }

    // Step 4: Map the response. The server is only expected to return `Queued`; `Failed` is handled defensively.
    if (response.status === 'Failed') {
      // logToStderr, like log, is a no-op under --json.
      this.logToStderr(messages.getMessage('error.upload-failed', [response.jobId, response.message ?? '']));
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
