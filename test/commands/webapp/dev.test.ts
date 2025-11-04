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

  it('runs dev server without name', async () => {
    const result = await WebappDev.run([]);
    expect(result.port).to.equal(3000);
    expect(result.success).to.be.true;
    expect(result.name).to.be.undefined;
  });

  it('runs dev server with name', async () => {
    const result = await WebappDev.run(['--name', 'myWebApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.port).to.equal(3000);
    expect(result.success).to.be.true;
  });

  it('runs dev server with custom port', async () => {
    const result = await WebappDev.run(['--port', '8080']);
    expect(result.port).to.equal(8080);
    expect(result.success).to.be.true;
  });

  it('outputs dev server messages', async () => {
    await WebappDev.run(['--name', 'testApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Starting development server for web app: testApp');
    expect(output).to.include('Preview server running on port: 3000');
  });
});
