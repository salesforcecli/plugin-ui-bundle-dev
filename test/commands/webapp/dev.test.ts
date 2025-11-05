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
import WebappDev from '../../../src/commands/webapp/dev.js';

describe('webapp dev', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs dev server with required name', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.port).to.equal(8080);
    expect(result.host).to.equal('localhost');
    expect(result.noOpen).to.be.false;
    expect(result.success).to.be.true;
  });

  it('runs dev server with custom port', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp', '--port', '3000']);
    expect(result.name).to.equal('myWebApp');
    expect(result.port).to.equal(3000);
    expect(result.success).to.be.true;
  });

  it('runs dev server with custom host', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp', '--host', '0.0.0.0']);
    expect(result.name).to.equal('myWebApp');
    expect(result.host).to.equal('0.0.0.0');
    expect(result.success).to.be.true;
  });

  it('runs dev server with target', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp', '--target', 'LightningApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.target).to.equal('LightningApp');
    expect(result.success).to.be.true;
  });

  it('runs dev server with root-dir', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp', '--root-dir', './webapps/myWebApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.rootDir).to.equal('./webapps/myWebApp');
    expect(result.success).to.be.true;
  });

  it('runs dev server with no-open flag', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp', '--no-open']);
    expect(result.name).to.equal('myWebApp');
    expect(result.noOpen).to.be.true;
    expect(result.success).to.be.true;
  });

  it('runs dev server with all flags', async () => {
    const result = await WebappDev.run([
      '--name',
      'myWebApp',
      '--target',
      'Site',
      '--root-dir',
      './webapps/test',
      '--port',
      '9000',
      '--host',
      '127.0.0.1',
      '--no-open',
    ]);
    expect(result.name).to.equal('myWebApp');
    expect(result.target).to.equal('Site');
    expect(result.rootDir).to.equal('./webapps/test');
    expect(result.port).to.equal(9000);
    expect(result.host).to.equal('127.0.0.1');
    expect(result.noOpen).to.be.true;
    expect(result.success).to.be.true;
  });

  it('outputs dev server messages', async () => {
    await WebappDev.run(['--name', 'testApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Starting development server for web app: testApp');
    expect(output).to.include('Server running on http://localhost:8080');
    expect(output).to.include('Opening browser...');
  });

  it('outputs target message when specified', async () => {
    await WebappDev.run(['--name', 'testApp', '--target', 'LightningApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Using target: LightningApp');
  });

  it('outputs default target message when not specified', async () => {
    await WebappDev.run(['--name', 'testApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Using default target from Web Application configuration');
  });

  it('does not output browser message with no-open', async () => {
    await WebappDev.run(['--name', 'testApp', '--no-open']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.not.include('Opening browser...');
  });
});
