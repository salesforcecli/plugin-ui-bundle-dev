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
  name: string;
  target?: string;
  url: string;
};

export default class WebappDev extends SfCommand<WebappDevResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      char: 'n',
      required: true,
    }),
    target: Flags.string({
      summary: messages.getMessage('flags.target.summary'),
      char: 't',
      required: false,
    }),
    port: Flags.integer({
      summary: messages.getMessage('flags.port.summary'),
      char: 'p',
      default: 5173,
    }),
  };

  public async run(): Promise<WebappDevResult> {
    const { flags } = await this.parse(WebappDev);

    this.log(`Starting development server for web app: ${flags.name}`);
    if (flags.target) {
      this.log(`Using target: ${flags.target}`);
    }

    const url = `http://localhost:${flags.port}`;
    this.log(`Server running on ${url}`);
    this.log('Opening browser...');

    // TODO: Implement dev server logic
    // This would typically involve:
    // 1. Starting a local development server
    // 2. Watching for file changes
    // 3. Hot reloading
    // 4. Opening browser

    return {
      name: flags.name,
      target: flags.target,
      url,
    };
  }
}
