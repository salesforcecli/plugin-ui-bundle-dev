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

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import FormData from 'form-data';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import type { UiBundleUploadResult } from '../../config/types.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-ui-bundle-dev', 'ui-bundle.upload');

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
      required: true,
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

    // Step 2: Stage the zip. Zip contents are never validated here; that's a server-side concern.
    const zipBuffer = readFileSync(flags['zip-file']);

    // Step 3: Build the multipart body and issue a single synchronous POST, no retry/poll loop.
    const form = new FormData();
    form.append('bundle', zipBuffer, { filename: basename(flags['zip-file']) });
    // 'pages' is a placeholder field name pending the finalized server contract.
    form.append('pages', String(flags['as-salesforce-pages']));

    let response: { jobId: string; status: string; message?: string };
    try {
      response = await orgConnection.request<{ jobId: string; status: string; message?: string }>({
        method: 'POST',
        url: `${orgConnection.baseUrl()}/connect/uibundle/deploys`,
        body: form,
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
