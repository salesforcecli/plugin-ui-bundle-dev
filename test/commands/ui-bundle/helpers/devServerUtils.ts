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

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { createServer, type Server } from 'node:net';

/*
 * Port ranges reserved per test file (avoid collisions):
 *   devWithUrl.nut.ts  — 18_900–18_909 (full flow), 18_930–18_939 (proxy-only), 18_940–18_949 (Vite)
 *   devPort.nut.ts     — 18_910–18_919 (dev servers), 18_920–18_929 (proxy ports)
 *
 * Tests run sequentially (--parallel=false), but unique ports per test are
 * still needed: the OS keeps closed sockets in TIME_WAIT briefly, and if
 * parallelism is enabled later, overlapping ranges would cause EADDRINUSE.
 */

/** Mocha suite-level timeout for describe blocks that spawn ui-bundle dev. */
export const SUITE_TIMEOUT = 180_000;

/** Timeout for spawnUiBundleDev when the command is expected to start successfully. */
export const SPAWN_TIMEOUT = 120_000;

/** Shorter timeout for spawnUiBundleDev when the command is expected to fail quickly. */
export const SPAWN_FAIL_TIMEOUT = 60_000;

export type UiBundleDevHandle = {
  /** The proxy URL emitted by the command on stderr as JSON `{"url":"..."}` */
  proxyUrl: string;
  /** The underlying child process */
  process: ChildProcess;
  /** Accumulated stderr output */
  stderr: string;
  /** Gracefully kill the process tree */
  kill: () => Promise<void>;
};

/**
 * Spawn `sf ui-bundle dev` asynchronously and wait for the JSON URL line on stderr.
 *
 * Uses `bin/dev.js` (same binary that `execCmd` uses) so we test the
 * local plugin code, not whatever is installed globally.
 */
export function spawnUiBundleDev(
  args: string[],
  options: { cwd: string; timeout?: number }
): Promise<UiBundleDevHandle> {
  const binDev = join(process.cwd(), 'bin', 'dev.js');
  const proc = spawn(
    process.execPath,
    ['--loader', 'ts-node/esm', '--no-warnings=ExperimentalWarning', binDev, 'ui-bundle', 'dev', ...args],
    {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Unix: detached creates a process group so we can kill(-pid) the tree.
      // Windows: detached opens a new console and breaks stdio piping; skip it
      // since taskkill /t /f already handles tree cleanup.
      ...(process.platform !== 'win32' && { detached: true }),
    }
  );

  let stderrData = '';

  const killProcessGroup = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    const pid = proc.pid;
    if (pid == null) return;
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, signal);
      }
    } catch {
      /* already dead */
    }
  };

  return new Promise<UiBundleDevHandle>((resolve, reject) => {
    const timeoutMs = options.timeout ?? SPAWN_TIMEOUT;
    const timeoutId = setTimeout(() => {
      killProcessGroup('SIGKILL');
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for proxy URL.\nstderr:\n${stderrData}`));
    }, timeoutMs);

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrData += text;

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof json.url === 'string') {
            clearTimeout(timeoutId);
            resolve({
              proxyUrl: json.url,
              process: proc,
              stderr: stderrData,
              kill: () =>
                new Promise<void>((res) => {
                  if (proc.killed || proc.exitCode !== null) {
                    res();
                    return;
                  }
                  const forceKillTimeout = setTimeout(() => {
                    killProcessGroup('SIGKILL');
                    res();
                  }, 5000);
                  proc.once('close', () => {
                    clearTimeout(forceKillTimeout);
                    res();
                  });
                  killProcessGroup('SIGTERM');
                }),
            });
          }
        } catch {
          // Not a JSON line — ignore
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== null && code !== 0) {
        reject(new Error(`ui-bundle dev exited with code ${code}.\nstderr:\n${stderrData}`));
      }
    });
  });
}

/**
 * Occupy a TCP port so that proxy bind attempts fail with EADDRINUSE.
 * Returns the server handle — call `server.close()` to release.
 */
export function occupyPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Start a plain HTTP server that serves static HTML content.
 * Used for proxy-only mode tests where the dev server is already running.
 */
export function startTestHttpServer(port: number): Promise<HttpServer> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Manual Dev Server</h1>');
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Start an HTTP server that mimics a Vite dev server with the
 * UIBundleProxyHandler plugin active. Responds to health check requests
 * (`?sfProxyHealthCheck=true`) with `X-Salesforce-UIBundle-Proxy: true`.
 */
export function startViteProxyServer(port: number): Promise<HttpServer> {
  return new Promise((resolve, reject) => {
    const server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      if (url.searchParams.get('sfProxyHealthCheck') === 'true') {
        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'X-Salesforce-UiBundle-Proxy': 'true',
        });
        res.end('OK');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Vite Dev Server</h1>');
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Close an HTTP server and wait for it to finish. */
export function closeServer(server: HttpServer | Server | null): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
