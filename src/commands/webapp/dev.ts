/*
 * Copyright 2025, Salesforce, Inc.
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

import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-webapp', 'webapp.dev');

export type WebappDevResult = {
  name?: string;
  port: number;
  success: boolean;
};

export default class WebappDev extends SfCommand<WebappDevResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      char: 'n',
      required: false,
    }),
    port: Flags.integer({
      summary: messages.getMessage('flags.port.summary'),
      char: 'p',
      default: 3000,
    }),
  };

  public async run(): Promise<WebappDevResult> {
    const { flags } = await this.parse(WebappDev);

    if (flags.name) {
      this.log(`Starting development server for web app: ${flags.name}`);
    } else {
      this.log('Starting development server for web app...');
    }

    this.log(`Preview server running on port: ${flags.port}`);
    this.log('Preview your web app locally without needing to deploy');

    // TODO: Implement local development server logic
    // This would typically involve:
    // 1. Starting a local development server
    // 2. Watching for file changes
    // 3. Hot reloading functionality
    // 4. Proxying API calls to Salesforce org if needed

    return {
      name: flags.name,
      port: flags.port,
      success: true,
    };
  }
}
