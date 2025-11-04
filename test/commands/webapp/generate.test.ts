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
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import WebappGenerate from '../../../src/commands/webapp/generate.js';

describe('webapp generate', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('generates webapp with required flags', async () => {
    const result = await WebappGenerate.run(['--name', 'myWebApp', '--label', 'My Web App']);
    expect(result.name).to.equal('myWebApp');
    expect(result.label).to.equal('My Web App');
    expect(result.target).to.equal('empty');
    expect(result.template).to.equal('empty');
    expect(result.wizard).to.be.false;
  });

  it('generates webapp with target and template', async () => {
    const result = await WebappGenerate.run([
      '--name',
      'testApp',
      '--label',
      'Test App',
      '--target',
      'Site',
      '--template',
      'default',
    ]);
    expect(result.name).to.equal('testApp');
    expect(result.label).to.equal('Test App');
    expect(result.target).to.equal('Site');
    expect(result.template).to.equal('default');
  });

  it('generates webapp with wizard mode', async () => {
    const result = await WebappGenerate.run(['--name', 'wizardApp', '--label', 'Wizard App', '--wizard']);
    expect(result.name).to.equal('wizardApp');
    expect(result.wizard).to.be.true;
  });

  it('outputs generation messages', async () => {
    await WebappGenerate.run(['--name', 'myApp', '--label', 'My App']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Generating your web app');
    expect(output).to.include('Your Web App has been created');
  });
});
