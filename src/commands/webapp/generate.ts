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

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Messages } from '@salesforce/core';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-webapp', 'webapp.generate');

export type WebappGenerateResult = {
  name: string;
  label: string;
  template: string;
  wizard: boolean;
};

export default class WebappGenerate extends SfCommand<WebappGenerateResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    name: Flags.string({
      summary: messages.getMessage('flags.name.summary'),
      char: 'n',
      required: true,
    }),
    label: Flags.string({
      summary: messages.getMessage('flags.label.summary'),
      char: 'l',
      required: true,
    }),
    template: Flags.string({
      summary: messages.getMessage('flags.template.summary'),
      char: 't',
      default: 'empty',
    }),
    wizard: Flags.boolean({
      summary: messages.getMessage('flags.wizard.summary'),
      char: 'w',
      default: false,
    }),
  };

  public async run(): Promise<WebappGenerateResult> {
    const { flags } = await this.parse(WebappGenerate);

    this.log('Generating your web app, give us a moment...');
    this.log(`Name: ${flags.name}`);
    this.log(`Label: ${flags.label}`);
    this.log(`Template: ${flags.template}`);
    this.log(`Wizard mode: ${flags.wizard}`);

    const template = flags.template ?? 'empty';

    // Clone vibe-coding-starter repository if template is specified
    if (template === 'vibe-coding-starter') {
      const repoUrl = 'https://github.com/salesforce-experience-platform-emu/vibe-coding-starter';
      const directory = resolve(flags.name);
      this.cloneRepository(repoUrl, directory);
    } else {
      // TODO: Implement web app generation logic for other templates
      // This would typically involve:
      // 1. Creating webapp.json configuration
      // 2. Setting up SFDX project structure
      // 3. Generating metadata files
      // 4. Creating necessary bundle structure
    }

    this.log('Your Web App has been created, have fun!');

    return {
      name: flags.name,
      label: flags.label,
      template,
      wizard: flags.wizard,
    };
  }

  protected cloneRepository(repoUrl: string, directory: string): void {
    if (existsSync(directory)) {
      throw new Error(`Directory ${directory} already exists. Please choose a different name.`);
    }

    const templateRepo = `git clone ${repoUrl}`;
    this.log(`Cloning ${repoUrl} into ${directory}...`);
    try {
      execSync(`${templateRepo} "${directory}"`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      this.log(`Successfully cloned ${repoUrl} into ${directory}`);
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
