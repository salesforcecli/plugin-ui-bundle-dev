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
import WebappVersionCreate from '../../../../src/commands/webapp/version/create.js';

describe('webapp version create', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('creates version with name and version flags', async () => {
    const result = await WebappVersionCreate.run(['--name', 'myWebApp', '--version', '1.0.0']);
    expect(result.name).to.equal('myWebApp');
    expect(result.version).to.equal('1.0.0');
    expect(result.success).to.be.true;
  });

  it('creates version with only name flag', async () => {
    const result = await WebappVersionCreate.run(['--name', 'testApp']);
    expect(result.name).to.equal('testApp');
    expect(result.version).to.be.undefined;
    expect(result.success).to.be.true;
  });

  it('outputs version creation messages', async () => {
    await WebappVersionCreate.run(['--name', 'myApp', '--version', '2.0.0']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Creating version for web app: myApp');
    expect(output).to.include('Version: 2.0.0');
    expect(output).to.include('Version created successfully');
  });
});
