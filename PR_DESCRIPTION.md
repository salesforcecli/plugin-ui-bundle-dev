# feat: Add E2E NUT tests for webapp dev command

**Work Item:** W-21111429

## Summary

This PR adds comprehensive end-to-end (E2E) Nut (NUT) tests for the `sf webapp dev` command. The test suite validates CLI behavior, port handling, URL resolution, proxy detection, and Vite integration across both Linux and Windows CI environments.

## What's Changed

### New Test Suites

| File | Purpose |
|-----|---------|
| `test/commands/webapp/dev.nut.ts` | Tier 1 (no auth) and Tier 2 (CLI validation) tests — flag parsing, webapp discovery, URL resolution errors |
| `test/commands/webapp/devPort.nut.ts` | `--port` and `--proxy-port` flag tests; validates port binding and conflict handling |
| `test/commands/webapp/devWithUrl.nut.ts` | `--url` flag, proxy detection, Vite integration; full dev server lifecycle tests |

### Shared Test Infrastructure

| File | Purpose |
|-----|---------|
| `test/commands/webapp/helpers/devServerUtils.ts` | Spawns `webapp dev` asynchronously, waits for proxy URL, handles process tree cleanup; port range reservation to avoid collisions |
| `test/commands/webapp/helpers/webappProjectUtils.ts` | Project scaffolding (createProject, createProjectWithWebapp), auth helpers (authOrgViaUrl), path utilities |
| `test/commands/webapp/_cleanup.nut.ts` | Test session cleanup |

### CI & Configuration

- **GitHub Actions:** NUTs run on `ubuntu-latest` and `windows-latest` (matrix strategy, 3 retries)
- **`.env.template`:** Documents NUT credentials (`TESTKIT_AUTH_URL`, JWT options, `OPEN_BROWSER=false`)
- **`src/commands/webapp/dev.ts`:** Respects `OPEN_BROWSER=false` for headless test runs

### Windows CI Fixes

- Use `spawnWebappDev` for port tests to avoid shelljs stdio hang on Windows
- Use `taskkill /t /f` for process tree cleanup on Windows
- Use `--sfdx-url-file` for auth in Windows CI (avoids interactive prompts)
- Skip `detached: true` on Windows (breaks stdio piping; taskkill handles cleanup)
- Create `TestSession` before `ensureSfCli` to prevent hangs

## Test Coverage

- **Tier 1 (no auth):** `--target-org` required; parse-time validation
- **Tier 2 (CLI validation):** Webapp discovery, missing manifest, invalid URL formats
- **Port tests:** Default/custom `--port`, `--proxy-port`, port-in-use handling
- **URL/proxy tests:** `--url` resolution, proxy detection, Vite dev server integration

## How to Run Locally

1. Copy `.env.template` to `.env`
2. Set `TESTKIT_AUTH_URL` (or JWT credentials) — see template for options
3. Run: `yarn nut` (or `yarn test:nut` per package.json)

## Checklist

- [x] Tests pass on ubuntu-latest
- [x] Tests pass on windows-latest
- [x] No doc files committed (planning docs kept local)
- [x] `.env` remains gitignored; `.env.template` documents required vars
