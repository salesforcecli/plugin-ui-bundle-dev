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

  it('runs webapp dev with required flags', async () => {
    const result = await WebappDev.run(['--name', 'myApp']);
    expect(result.name).to.equal('myApp');
    expect(result.url).to.equal('http://localhost:5173');
  });

  it('runs webapp dev with target flag', async () => {
    const result = await WebappDev.run(['--name', 'myApp', '--target', 'LightningApp']);
    expect(result.name).to.equal('myApp');
    expect(result.target).to.equal('LightningApp');
    expect(result.url).to.equal('http://localhost:5173');
  });

  it('runs webapp dev with custom port', async () => {
    const result = await WebappDev.run(['--name', 'myApp', '--port', '8080']);
    expect(result.name).to.equal('myApp');
    expect(result.url).to.equal('http://localhost:8080');
  });

  it('outputs dev server messages', async () => {
    await WebappDev.run(['--name', 'myApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Starting development server');
    expect(output).to.include('Server running on');
  });
});
