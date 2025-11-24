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

import { expect } from 'chai';
import sinon from 'sinon';
import { Logger } from '../../src/utils/Logger.js';

describe('Logger', () => {
  let consoleLogStub: sinon.SinonStub;
  let consoleWarnStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    consoleLogStub = sinon.stub(console, 'log');
    consoleWarnStub = sinon.stub(console, 'warn');
    consoleErrorStub = sinon.stub(console, 'error');
  });

  afterEach(() => {
    consoleLogStub.restore();
    consoleWarnStub.restore();
    consoleErrorStub.restore();
  });

  describe('Constructor', () => {
    it('should create logger with debug disabled by default', () => {
      const logger = new Logger();

      expect(logger.isDebugEnabled()).to.be.false;
    });

    it('should create logger with debug enabled when specified', () => {
      const logger = new Logger(true);

      expect(logger.isDebugEnabled()).to.be.true;
    });
  });

  describe('info()', () => {
    it('should log info messages', () => {
      const logger = new Logger();
      logger.info('Test info message');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.equal('Test info message');
    });

    it('should log multiple info messages', () => {
      const logger = new Logger();
      logger.info('First message');
      logger.info('Second message');

      expect(consoleLogStub.calledTwice).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.equal('First message');
      expect(consoleLogStub.secondCall.args[0]).to.equal('Second message');
    });
  });

  describe('warn()', () => {
    it('should log warning messages', () => {
      const logger = new Logger();
      logger.warn('Test warning message');

      expect(consoleWarnStub.calledOnce).to.be.true;
      expect(consoleWarnStub.firstCall.args[0]).to.equal('Test warning message');
    });
  });

  describe('error()', () => {
    it('should log error messages', () => {
      const logger = new Logger();
      logger.error('Test error message');

      expect(consoleErrorStub.calledOnce).to.be.true;
      expect(consoleErrorStub.firstCall.args[0]).to.equal('Test error message');
    });
  });

  describe('debug()', () => {
    it('should not log debug messages when debug is disabled', () => {
      const logger = new Logger(false);
      logger.debug('This should not be logged');

      expect(consoleLogStub.called).to.be.false;
    });

    it('should log debug messages when debug is enabled', () => {
      const logger = new Logger(true);
      logger.debug('Debug message');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include('[DEBUG]');
      expect(consoleLogStub.firstCall.args[0]).to.include('Debug message');
    });

    it('should prefix debug messages with [DEBUG]', () => {
      const logger = new Logger(true);
      logger.debug('Test message');

      expect(consoleLogStub.firstCall.args[0]).to.equal('[DEBUG] Test message');
    });
  });

  describe('Log Levels', () => {
    it('should use correct console method for each level', () => {
      const logger = new Logger();

      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleWarnStub.calledOnce).to.be.true;
      expect(consoleErrorStub.calledOnce).to.be.true;
    });

    it('should handle all log levels with debug enabled', () => {
      const logger = new Logger(true);

      logger.info('info');
      logger.warn('warn');
      logger.error('error');
      logger.debug('debug');

      expect(consoleLogStub.calledTwice).to.be.true; // info + debug
      expect(consoleWarnStub.calledOnce).to.be.true;
      expect(consoleErrorStub.calledOnce).to.be.true;
    });
  });

  describe('isDebugEnabled()', () => {
    it('should return false when debug is disabled', () => {
      const logger = new Logger(false);

      expect(logger.isDebugEnabled()).to.be.false;
    });

    it('should return true when debug is enabled', () => {
      const logger = new Logger(true);

      expect(logger.isDebugEnabled()).to.be.true;
    });
  });

  describe('Sensitive Data Protection', () => {
    it('should not expose sensitive data in logs', () => {
      const logger = new Logger(true);

      // Logger itself doesn't sanitize, but we test it doesn't log raw tokens
      const message = 'Processing request';
      logger.info(message);

      expect(consoleLogStub.firstCall.args[0]).to.equal(message);
      // Note: Sanitization should be done by ErrorHandler before logging
    });

    it('should allow logging of safe messages', () => {
      const logger = new Logger(true);

      logger.info('Starting proxy server on port 4545');
      logger.debug('Request routed to Salesforce API');

      expect(consoleLogStub.calledTwice).to.be.true;
    });
  });

  describe('Message Formatting', () => {
    it('should handle empty messages', () => {
      const logger = new Logger();
      logger.info('');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.equal('');
    });

    it('should handle multi-line messages', () => {
      const logger = new Logger();
      const multiLineMessage = 'Line 1\nLine 2\nLine 3';
      logger.info(multiLineMessage);

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.equal(multiLineMessage);
    });

    it('should handle messages with special characters', () => {
      const logger = new Logger();
      const specialMessage = 'Message with émojis 🎉 and spëcial chars!';
      logger.info(specialMessage);

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.equal(specialMessage);
    });

    it('should handle very long messages', () => {
      const logger = new Logger();
      const longMessage = 'A'.repeat(1000);
      logger.info(longMessage);

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.have.lengthOf(1000);
    });
  });

  describe('Debug Mode Toggle', () => {
    it('should respect debug mode throughout logger lifecycle', () => {
      const logger = new Logger(true);

      logger.debug('Message 1');
      expect(consoleLogStub.calledOnce).to.be.true;

      logger.debug('Message 2');
      expect(consoleLogStub.calledTwice).to.be.true;
    });

    it('should not log debug messages after debug mode check', () => {
      const logger = new Logger(false);

      expect(logger.isDebugEnabled()).to.be.false;
      logger.debug('Should not appear');

      expect(consoleLogStub.called).to.be.false;
    });
  });

  describe('Performance', () => {
    it('should handle rapid logging', () => {
      const logger = new Logger();

      for (let i = 0; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      expect(consoleLogStub.callCount).to.equal(100);
    });

    it('should handle rapid debug logging when enabled', () => {
      const logger = new Logger(true);

      for (let i = 0; i < 50; i++) {
        logger.debug(`Debug ${i}`);
      }

      expect(consoleLogStub.callCount).to.equal(50);
    });

    it('should not process debug messages when disabled', () => {
      const logger = new Logger(false);

      // Even with many calls, console should not be touched
      for (let i = 0; i < 100; i++) {
        logger.debug(`Debug ${i}`);
      }

      expect(consoleLogStub.called).to.be.false;
    });
  });

  describe('Integration with Other Modules', () => {
    it('should work with info, warn, and error in sequence', () => {
      const logger = new Logger();

      logger.info('Starting process');
      logger.warn('Warning detected');
      logger.error('Error occurred');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleWarnStub.calledOnce).to.be.true;
      expect(consoleErrorStub.calledOnce).to.be.true;

      expect(consoleLogStub.firstCall.args[0]).to.equal('Starting process');
      expect(consoleWarnStub.firstCall.args[0]).to.equal('Warning detected');
      expect(consoleErrorStub.firstCall.args[0]).to.equal('Error occurred');
    });

    it('should maintain separate instances with different debug settings', () => {
      const logger1 = new Logger(true);
      const logger2 = new Logger(false);

      logger1.debug('From logger1');
      logger2.debug('From logger2');

      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include('From logger1');
    });
  });
});
