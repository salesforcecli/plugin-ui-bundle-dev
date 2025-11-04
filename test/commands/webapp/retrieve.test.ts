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
import WebappRetrieve from '../../../src/commands/webapp/retrieve.js';

describe('webapp retrieve', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('retrieves webapp with required name flag', async () => {
    const result = await WebappRetrieve.run(['--name', 'myWebApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.success).to.be.true;
  });

  it('runs with --json', async () => {
    const result = await WebappRetrieve.run(['--name', 'testApp']);
    expect(result.name).to.equal('testApp');
    expect(result.success).to.be.true;
  });

  it('outputs retrieval messages', async () => {
    await WebappRetrieve.run(['--name', 'myWebApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Retrieving web app: myWebApp');
    expect(output).to.include('Successfully retrieved myWebApp');
  });
});
