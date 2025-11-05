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
import WebappDeploy from '../../../src/commands/webapp/deploy.js';

describe('webapp deploy', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('deploys webapp with required name flag', async () => {
    const result = await WebappDeploy.run(['--name', 'myWebApp']);
    expect(result.name).to.equal('myWebApp');
    expect(result.options).to.equal('build');
    expect(result.success).to.be.true;
  });

  it('runs with --json and custom options', async () => {
    const result = await WebappDeploy.run(['--name', 'testApp', '--options', 'validate']);
    expect(result.name).to.equal('testApp');
    expect(result.options).to.equal('validate');
    expect(result.success).to.be.true;
  });

  it('outputs deployment messages', async () => {
    await WebappDeploy.run(['--name', 'myWebApp']);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('Deploying web app: myWebApp');
    expect(output).to.include('Successfully deployed myWebApp');
  });
});
