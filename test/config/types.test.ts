/*
 * Copyright 2026, Salesforce, Inc.
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

import { expect } from 'chai';
import { WebAppManifest, RoutingConfig } from '../../src/config/types.js';

describe('TypeScript Types', () => {
  it('should allow valid WebAppManifest', () => {
    const manifest: WebAppManifest = {
      name: 'testApp',
      label: 'Test Application',
      version: '1.0.0',
      outputDir: 'dist',
    };

    expect(manifest.name).to.equal('testApp');
    expect(manifest.version).to.equal('1.0.0');
  });

  it('should allow WebAppManifest with dev config', () => {
    const manifest: WebAppManifest = {
      name: 'testApp',
      label: 'Test Application',
      version: '1.0.0',
      outputDir: 'dist',
      dev: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
      },
    };

    expect(manifest.dev?.command).to.equal('npm run dev');
    expect(manifest.dev?.url).to.equal('http://localhost:5173');
  });

  it('should allow optional description', () => {
    const manifest: WebAppManifest = {
      name: 'testApp',
      label: 'Test Application',
      description: 'This is a test app',
      version: '1.0.0',
      outputDir: 'dist',
    };

    expect(manifest.description).to.equal('This is a test app');
  });

  it('should allow WebAppManifest with routing config', () => {
    const routing: RoutingConfig = {
      rewrites: [{ route: '/api/:id', target: 'api/handler' }],
      redirects: [{ route: '/old', target: '/new', statusCode: 301 }],
      trailingSlash: 'always',
      fallback: 'index.html',
    };

    const manifest: WebAppManifest = {
      name: 'testApp',
      label: 'Test Application',
      version: '1.0.0',
      outputDir: 'dist',
      routing,
    };

    expect(manifest.routing?.rewrites).to.have.length(1);
    expect(manifest.routing?.redirects).to.have.length(1);
    expect(manifest.routing?.trailingSlash).to.equal('always');
  });
});
