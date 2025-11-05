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
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';

describe('webapp dev NUTs', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  it('should start dev server with name', () => {
    const command = 'webapp dev --name myWebApp';
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.contain('myWebApp');
    expect(output).to.contain('Server running on http://localhost:8080');
  });

  it('should start dev server with target', () => {
    const command = 'webapp dev --name myWebApp --target "LightningApp"';
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.contain('Using target: LightningApp');
  });

  it('should start dev server with custom port and host', () => {
    const command = 'webapp dev --name myWebApp --port 9000 --host 0.0.0.0';
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.contain('Server running on http://0.0.0.0:9000');
  });

  it('should start dev server with root-dir', () => {
    const command = 'webapp dev --name myWebApp --root-dir ./webapps/myWebApp';
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.contain('Root directory: ./webapps/myWebApp');
  });

  it('should start dev server with no-open flag', () => {
    const command = 'webapp dev --name myWebApp --no-open';
    const output = execCmd(command, { ensureExitCode: 0 }).shellOutput.stdout;
    expect(output).to.not.contain('Opening browser...');
  });
});
