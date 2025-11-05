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
  rootDir?: string;
  port: number;
  host: string;
  noOpen: boolean;
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
      required: true,
    }),
    target: Flags.string({
      summary: messages.getMessage('flags.target.summary'),
      char: 't',
      required: false,
    }),
    'root-dir': Flags.string({
      summary: messages.getMessage('flags.root-dir.summary'),
      char: 'r',
      required: false,
    }),
    port: Flags.integer({
      summary: messages.getMessage('flags.port.summary'),
      char: 'p',
      default: 8080,
    }),
    host: Flags.string({
      summary: messages.getMessage('flags.host.summary'),
      default: 'localhost',
    }),
    'no-open': Flags.boolean({
      summary: messages.getMessage('flags.no-open.summary'),
      default: false,
    }),
  };

  public async run(): Promise<WebappDevResult> {
    const { flags } = await this.parse(WebappDev);

    this.log(`Starting development server for web app: ${flags.name}`);

    if (flags.target) {
      this.log(`Using target: ${flags.target}`);
    } else {
      this.log('Using default target from Web Application configuration');
    }

    if (flags['root-dir']) {
      this.log(`Root directory: ${flags['root-dir']}`);
    }

    this.log(`Server running on http://${flags.host}:${flags.port}`);

    if (!flags['no-open']) {
      this.log('Opening browser...');
    }

    // TODO: Implement local development server logic
    // This would typically involve:
    // 1. Resolving the Web Application metadata from CMS
    // 2. Reading configuration (targets, routes, etc.)
    // 3. Deriving or using the specified local path
    // 4. Starting a local development server on specified host:port
    // 5. Watching for file changes with hot reloading
    // 6. Opening browser automatically unless --no-open is set
    // 7. Proxying API calls to Salesforce org if needed

    return {
      name: flags.name,
      target: flags.target,
      rootDir: flags['root-dir'],
      port: flags.port,
      host: flags.host,
      noOpen: flags['no-open'],
      success: true,
    };
  }
}
