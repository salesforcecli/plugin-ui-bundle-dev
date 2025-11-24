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

import type { IncomingMessage } from 'node:http';
import { expect } from 'chai';
import { RequestRouter } from '../../src/proxy/RequestRouter.js';

describe('RequestRouter', () => {
  let router: RequestRouter;

  beforeEach(() => {
    router = new RequestRouter();
  });

  /**
   * Helper to create a mock HTTP request
   */
  function createMockRequest(url: string, method = 'GET', headers = {}): IncomingMessage {
    return {
      url,
      method,
      headers,
    } as IncomingMessage;
  }

  describe('Salesforce API Routes', () => {
    it('should route /services/data requests to Salesforce', () => {
      const req = createMockRequest('/services/data/v60.0/sobjects');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/data');
    });

    it('should route /services/apexrest requests to Salesforce', () => {
      const req = createMockRequest('/services/apexrest/MyAPI/endpoint');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/apexrest');
    });

    it('should route /services/Soap requests to Salesforce', () => {
      const req = createMockRequest('/services/Soap/u/60.0');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/Soap');
    });

    it('should route /services/Metadata requests to Salesforce', () => {
      const req = createMockRequest('/services/Metadata/v60.0');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/Metadata');
    });

    it('should route /services/async requests to Salesforce', () => {
      const req = createMockRequest('/services/async/60.0');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/async');
    });

    it('should route /services/oauth requests to Salesforce', () => {
      const req = createMockRequest('/services/oauth/token');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('/services/oauth');
    });

    it('should route /__sf__ internal paths to Salesforce', () => {
      const req = createMockRequest('/__sf__/internal/endpoint');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
      expect(decision.reason).to.include('__sf__');
    });

    it('should handle query parameters in Salesforce requests', () => {
      const req = createMockRequest('/services/data/v60.0/query?q=SELECT+Id+FROM+Account');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
    });
  });

  describe('Dev Server Routes', () => {
    it('should route root path to dev server', () => {
      const req = createMockRequest('/');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should route HTML files to dev server', () => {
      const req = createMockRequest('/index.html');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.html');
    });

    it('should route JavaScript files to dev server', () => {
      const req = createMockRequest('/src/main.js');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.js');
    });

    it('should route TypeScript files to dev server', () => {
      const req = createMockRequest('/src/App.tsx');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.tsx');
    });

    it('should route CSS files to dev server', () => {
      const req = createMockRequest('/styles/main.css');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.css');
    });

    it('should route image files to dev server', () => {
      const images = ['/logo.png', '/icon.svg', '/photo.jpg', '/banner.webp'];

      for (const img of images) {
        const req = createMockRequest(img);
        const decision = router.route(req);
        expect(decision.target).to.equal('devserver');
      }
    });

    it('should route font files to dev server', () => {
      const fonts = ['/fonts/roboto.woff2', '/fonts/icon.ttf'];

      for (const font of fonts) {
        const req = createMockRequest(font);
        const decision = router.route(req);
        expect(decision.target).to.equal('devserver');
      }
    });

    it('should route source maps to dev server', () => {
      const req = createMockRequest('/src/main.js.map');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.map');
    });

    it('should route app routes to dev server', () => {
      const routes = ['/dashboard', '/users/123', '/settings'];

      for (const route of routes) {
        const req = createMockRequest(route);
        const decision = router.route(req);
        expect(decision.target).to.equal('devserver');
      }
    });
  });

  describe('HMR and Dev Server Special Paths', () => {
    it('should route Vite HMR paths to dev server', () => {
      const req = createMockRequest('/__vite__/hmr');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('__vite__');
    });

    it('should route Vite internal paths to dev server', () => {
      const req = createMockRequest('/@vite/client');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('@vite/');
    });

    it('should route React Fast Refresh to dev server', () => {
      const req = createMockRequest('/@react-refresh');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('@react-refresh');
    });

    it('should route Webpack HMR to dev server', () => {
      const req = createMockRequest('/__webpack_hmr');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('__webpack_hmr');
    });

    it('should route Webpack dev server sockjs to dev server', () => {
      const req = createMockRequest('/sockjs-node/info');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('sockjs-node');
    });

    it('should route Webpack hot updates to dev server', () => {
      const req = createMockRequest('/main.hot-update.json');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('hot-update.');
    });

    it('should route node_modules to dev server', () => {
      const req = createMockRequest('/node_modules/react/index.js');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('node_modules');
    });
  });

  describe('Custom Path Configuration', () => {
    it('should support custom Salesforce paths', () => {
      const customRouter = new RequestRouter({
        customSalesforcePaths: ['/api/custom', '/internal/sf'],
      });

      const req1 = createMockRequest('/api/custom/endpoint');
      expect(customRouter.route(req1).target).to.equal('salesforce');

      const req2 = createMockRequest('/internal/sf/data');
      expect(customRouter.route(req2).target).to.equal('salesforce');
    });

    it('should support custom dev server paths', () => {
      const customRouter = new RequestRouter({
        customDevServerPaths: ['/custom-hmr', '/dev-only'],
      });

      const req1 = createMockRequest('/custom-hmr');
      expect(customRouter.route(req1).target).to.equal('devserver');

      const req2 = createMockRequest('/dev-only/endpoint');
      expect(customRouter.route(req2).target).to.equal('devserver');
    });

    it('should prioritize custom dev server paths over Salesforce paths', () => {
      const customRouter = new RequestRouter({
        customDevServerPaths: ['/services/mock'], // Override Salesforce pattern
      });

      const req = createMockRequest('/services/mock/data');
      expect(customRouter.route(req).target).to.equal('devserver');
    });
  });

  describe('Runtime Path Management', () => {
    it('should allow adding Salesforce paths at runtime', () => {
      router.addSalesforcePath('/runtime/api');

      const req = createMockRequest('/runtime/api/endpoint');
      expect(router.route(req).target).to.equal('salesforce');
    });

    it('should allow adding dev server paths at runtime', () => {
      router.addDevServerPath('/runtime/dev');

      const req = createMockRequest('/runtime/dev/endpoint');
      expect(router.route(req).target).to.equal('devserver');
    });

    it('should not add duplicate Salesforce paths', () => {
      const initialPaths = router.getSalesforcePaths();
      router.addSalesforcePath('/services/data'); // Already exists

      expect(router.getSalesforcePaths()).to.have.lengthOf(initialPaths.length);
    });

    it('should not add duplicate dev server paths', () => {
      const initialPaths = router.getDevServerPaths();
      router.addDevServerPath('/__vite__'); // Already exists

      expect(router.getDevServerPaths()).to.have.lengthOf(initialPaths.length);
    });
  });

  describe('Helper Methods', () => {
    it('isSalesforceRequest should return true for SF paths', () => {
      const req = createMockRequest('/services/data/v60.0/sobjects');
      expect(router.isSalesforceRequest(req)).to.be.true;
    });

    it('isSalesforceRequest should return false for dev server paths', () => {
      const req = createMockRequest('/index.html');
      expect(router.isSalesforceRequest(req)).to.be.false;
    });

    it('isDevServerRequest should return true for dev server paths', () => {
      const req = createMockRequest('/src/main.js');
      expect(router.isDevServerRequest(req)).to.be.true;
    });

    it('isDevServerRequest should return false for SF paths', () => {
      const req = createMockRequest('/services/apexrest/MyAPI');
      expect(router.isDevServerRequest(req)).to.be.false;
    });

    it('getSalesforcePaths should return a copy of paths', () => {
      const paths = router.getSalesforcePaths();
      paths.push('/should-not-affect-router');

      expect(router.getSalesforcePaths()).to.not.include('/should-not-affect-router');
    });

    it('getDevServerPaths should return a copy of paths', () => {
      const paths = router.getDevServerPaths();
      paths.push('/should-not-affect-router');

      expect(router.getDevServerPaths()).to.not.include('/should-not-affect-router');
    });
  });

  describe('WebSocket Upgrade Detection', () => {
    it('should detect WebSocket upgrade requests for dev server paths', () => {
      const req = createMockRequest('/__vite__/hmr', 'GET', {
        upgrade: 'websocket',
        connection: 'Upgrade',
      });
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.isWebSocket).to.be.true;
    });

    it('should detect WebSocket upgrade for Webpack HMR', () => {
      const req = createMockRequest('/sockjs-node/123/abc/websocket', 'GET', {
        upgrade: 'websocket',
        connection: 'upgrade',
      });
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.isWebSocket).to.be.true;
    });

    it('should handle case-insensitive WebSocket headers', () => {
      const req = createMockRequest('/__vite__/ws', 'GET', {
        upgrade: 'WebSocket',
        connection: 'Upgrade',
      });
      const decision = router.route(req);

      expect(decision.isWebSocket).to.be.true;
    });

    it('should not detect WebSocket for missing upgrade header', () => {
      const req = createMockRequest('/__vite__/hmr', 'GET', {
        connection: 'Upgrade',
      });
      const decision = router.route(req);

      expect(decision.isWebSocket).to.be.undefined;
    });

    it('should not detect WebSocket for missing connection header', () => {
      const req = createMockRequest('/__vite__/hmr', 'GET', {
        upgrade: 'websocket',
      });
      const decision = router.route(req);

      expect(decision.isWebSocket).to.be.undefined;
    });

    it('should not detect WebSocket for wrong upgrade value', () => {
      const req = createMockRequest('/__vite__/hmr', 'GET', {
        upgrade: 'http/2',
        connection: 'Upgrade',
      });
      const decision = router.route(req);

      expect(decision.isWebSocket).to.be.undefined;
    });

    it('should handle Connection header with multiple values', () => {
      const req = createMockRequest('/__webpack_hmr', 'GET', {
        upgrade: 'websocket',
        connection: 'keep-alive, Upgrade',
      });
      const decision = router.route(req);

      expect(decision.isWebSocket).to.be.true;
    });

    it('should detect WebSocket for non-HMR paths', () => {
      const req = createMockRequest('/custom-ws-endpoint', 'GET', {
        upgrade: 'websocket',
        connection: 'Upgrade',
      });
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.isWebSocket).to.be.true;
    });
  });

  describe('URL Encoding and Special Characters', () => {
    it('should handle URL-encoded query parameters', () => {
      const req = createMockRequest(
        '/services/data/v60.0/query?q=SELECT%20Id%2CName%20FROM%20Account%20WHERE%20Name%20LIKE%20%27Test%25%27'
      );
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
    });

    it('should handle plus signs in query parameters', () => {
      const req = createMockRequest('/services/data/v60.0/query?q=SELECT+Id,Name+FROM+Account');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
    });

    it('should handle special characters in path', () => {
      const req = createMockRequest('/files/my-file-name_v1.0.js');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
      expect(decision.reason).to.include('.js');
    });

    it('should handle international characters in path', () => {
      const req = createMockRequest('/assets/文件.png');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should handle spaces encoded as %20', () => {
      const req = createMockRequest('/assets/my%20file.png');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should handle multiple query parameters with encoding', () => {
      const req = createMockRequest(
        '/services/apexrest/MyAPI?param1=value%201&param2=value%202&param3=%E4%B8%AD%E6%96%87'
      );
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests without URL', () => {
      const req = { method: 'GET', headers: {} } as IncomingMessage;
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should handle requests without method', () => {
      const req = { url: '/test', headers: {} } as IncomingMessage;
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should handle URLs with complex query strings', () => {
      const req = createMockRequest('/services/data/v60.0/query?q=SELECT+Id+FROM+Account&limit=100&offset=0');
      const decision = router.route(req);

      expect(decision.target).to.equal('salesforce');
    });

    it('should handle URLs with fragments', () => {
      const req = createMockRequest('/dashboard#/section');
      const decision = router.route(req);

      expect(decision.target).to.equal('devserver');
    });

    it('should be case-sensitive for paths', () => {
      const req1 = createMockRequest('/Services/Data/v60.0'); // Wrong case
      expect(router.route(req1).target).to.equal('devserver'); // Not matched

      const req2 = createMockRequest('/services/data/v60.0'); // Correct case
      expect(router.route(req2).target).to.equal('salesforce'); // Matched
    });
  });

  describe('Debug Logging', () => {
    it('should support debug mode', () => {
      const debugRouter = new RequestRouter({ debug: true });
      expect(debugRouter).to.be.instanceOf(RequestRouter);
    });

    it('should work without debug mode', () => {
      const normalRouter = new RequestRouter({ debug: false });
      const req = createMockRequest('/services/data/v60.0/sobjects');
      const decision = normalRouter.route(req);

      expect(decision.target).to.equal('salesforce');
    });
  });
});
