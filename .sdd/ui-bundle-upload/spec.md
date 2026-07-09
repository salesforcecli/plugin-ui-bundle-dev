# Feature Specification — `sf ui-bundle upload` Command

**Type:** FEAT
**Feature Name:** `sf ui-bundle upload` Command
**Date:** 2026-07-08

---

## 1. Feature Summary

`sf ui-bundle upload` is a thin CLI wrapper around `POST /connect/uibundle/deploys`.

**What it enables:**

- Standard (non-admin) users can persist a React UI Bundle without the Metadata API, which requires admin-only `ModifyMetadata`/`ModifyAllData` at the framework level.

**How it works:**

- The endpoint is fully async: the CLI issues one `POST`, which stages the zip, enqueues a job, and returns `202 Accepted` immediately.
- The CLI prints the returned job ID and does nothing else — no polling, no zip-content validation, no lifecycle management client-side.

**Business value:**

- A standard user can create and persist a UI Bundle themselves — the first step toward a Salesforce Page — without filing an admin request or holding Metadata API permissions.
- This unblocks the broader MIYO Pages self-service vision.

**Invocation context:**

- The command runs inside an isolated CAP (Coding Agentic Platform) DX workspace, where a bundle is agent-generated and then uploaded.
- CAP is one agentic entry point among several (e.g. Agentforce Vibes, Agentforce Coworker), and this command is intended as the unified entryway for UI Bundle deployment across all of them.
- The flag/output contract is designed for that agentic/pipeline consumption, not an interactive human-first CLI.

---

## 2. Functional Requirements

### 2.1 User Stories

**As a** standard (non-admin) Salesforce user
**I want to** upload a React UI Bundle to my org from the CLI without holding Metadata API `ModifyMetadata`/`ModifyAllData` permissions
**So that** I can create and persist a UI Bundle — the basis of a Salesforce Page — independently, without filing an admin request.

**As an** agentic surface (CAP, Agentforce Vibes, Agentforce Coworker)
**I want to** a single, stable CLI entrypoint that uploads an agent-generated bundle and returns a machine-parseable job ID
**So that** any agentic entryway can trigger a UI Bundle deployment on a standard user's behalf through one unified command rather than reimplementing the call.

### 2.2 Core Requirements

1. Ship `sf ui-bundle upload` as one synchronous call to `POST /connect/uibundle/deploys` — no polling (REQ-101).
2. Validate all required flags (`--zip-file`, `--use-pages`, `--target-org`) before any network call (REQ-102–105).
3. Produce correct human and `--json` output for both success and failure paths (§2.6), surfacing the server message verbatim (REQ-106–109, 111).
4. Use distinct CLI-side error names, separable from a server-reported `Failed` status, so JSON consumers can branch on `result.name` (REQ-110).
5. Perform no client-side zip-content validation — a server-side concern (REQ-112).
6. Keep the change additive-only: new `UiBundleUploadResult` type (REQ-113, 205), generated artifacts (`command-snapshot.json`, `COMMANDS.md` — REQ-202, 212), `README.md` section (REQ-209), and test fixtures (REQ-208) are all new or appended, with nothing existing modified.

### 2.3 Acceptance Criteria

**AC1 (REQ-101–105) — Flags & synchronous POST**

- [ ] **101.** All flags valid → exactly one synchronous `POST`; no retry/poll.
- [ ] **102.** `--zip-file` omitted → `FailedFlagValidationError` (`Missing required flag zip-file`), no network call.
- [ ] **103.** `--zip-file` path missing/not-a-file → `Flags.file({ exists: true })` validation error, no network call.
- [ ] **104.** `--use-pages` omitted → `FailedFlagValidationError` (`Missing required flag use-pages`), no network call.
- [ ] **105.** `--target-org` omitted, no default → `NoDefaultEnvError` via `Flags.requiredOrg()`, no network call. Distinct mechanism from 102/104 (org resolver, not flag parser) — see `dev.nut.ts:58` for the existing pattern.

**AC2 (REQ-106–109) — Output shapes**

- [ ] **106.** `Queued` response → human success block (§2.6) to stdout, exit 0.
- [ ] **107.** `--json` + `Queued` → `{ "result": { "jobId", "status": "Queued" } }` only, no human text.
- [ ] **108.** Defensive handling for whether the server response body ever carries a `status: "Failed"` shape → human failure block (§2.6) to stderr, exit 1. Not expected under the current Pkg A draft contract (§2.5) — a `Failed` result requires a job id and a job-shaped `POST` response body, neither of which the upstream spec documents — but the CLI does not fail closed if it happens.
- [ ] **109.** `--json` equivalent of 108 → `{ "result": { "jobId", "status": "Failed", "message" } }`, exit 1. Same "defensive, not expected" framing as 108.

**AC3 (REQ-110–112) — Error semantics**

- [ ] **110.** The _actual_ synchronous-failure path: an HTTP-level 4xx/5xx response from the `POST` call itself (no job id, no valid job-shaped body — e.g. the server's own early size/content-type rejection per §2.5, or auth failure, or no HTTP response at all) → thrown `SfError` with a distinct CLI-side name (`UiBundleUploadAuthError`/`UiBundleUploadNetworkError`/`UiBundleUploadValidationError`), separate from a server `Failed` status result object (108/109).
- [ ] **111.** Server error message — whether from an HTTP error body (110) or, defensively, a `Failed.message` (108/109) — surfaced verbatim, no rewriting or truncation.
- [ ] **112.** No client-side zip-content validation, ever.

**AC4 (REQ-113) — Result type**

- [ ] **113.** `UiBundleUploadResult` is a plain type in `src/config/types.ts`: `{ jobId: string; status: 'Queued' | 'InProgress' | 'Succeeded' | 'Failed'; message?: string }` — a sibling export, not a subclass/modification of `UiBundleDevResult`.

**AC5 — Non-regression**

- [ ] Covered by the Non-Regression checklist in §6.2; every item there is falsifiable via `git diff` or test-suite parity.

### 2.4 CLI Command Contract

| Flag           | Char | Type                                | Required | Notes                                                        |
| -------------- | ---- | ----------------------------------- | -------- | ------------------------------------------------------------ |
| `--zip-file`   | `-z` | `Flags.file({ exists: true })`      | yes      | No client-side zip-content validation (REQ-112).             |
| `--use-pages`  | —    | `Flags.boolean({ required: true })` | yes      | No short char — avoids `-p` collision with `dev`'s `--port`. |
| `--target-org` | `-o` | `Flags.requiredOrg()`               | yes      | Same pattern as `dev.ts`; supplies its own messages.         |

Global `--json` / `--flags-dir` inherited from `SfCommand`.

**`--help`:**

```
Upload a UI Bundle to your org.

USAGE
  $ sf ui-bundle upload -z <value> --use-pages -o <value> [--json] [--flags-dir <value>]

FLAGS
  -z, --zip-file=<value>    (required) Path to the UI Bundle source to upload.
      --use-pages           (required) Toggle whether this UI Bundle should be uploaded to Salesforce Pages.
  -o, --target-org=<value>  (required) Username or alias of the target org.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json                Format output as json.

DESCRIPTION
Use this command to upload a React-based UI Bundle to your Salesforce org. The bundle source must be a
compressed ZIP file. This can be used by both admin and non-admin users.
The upload is asynchronous. View the UI bundle in your org to verify completion.

EXAMPLES
  Upload a UI Bundle to Salesforce Pages using your default org:
    $ sf ui-bundle upload --zip-file my-compressed-bundle --use-pages

  Upload to a specific org by alias:
    $ sf ui-bundle upload --zip-file my-compressed-bundle --use-pages --target-org my-org
```

### 2.5 Connect API Contract (Pkg A, draft)

This documents the upstream Connect API contract ("Pkg A" — Async Connect API Front Door for UIBundle Deploy), currently in Draft status, so the CLI's request/response mapping is traceable to its source contract. Only the `POST` is in scope; the `GET` below is shown for context/comparison only (REQ-301 excludes it).

**Endpoints:**

| Method | Path                        | In scope for `upload`?                 |
| ------ | --------------------------- | -------------------------------------- |
| `POST` | `/connect/uibundle/deploys` | Yes — the one call this command makes. |

**`POST` request — draft field table** (explicitly "to be finalized in Spike A1"; transport itself — multipart zip vs. content-reference vs. base64 — is undecided):

| Field              | Type       | Notes                                                                                     |
| ------------------ | ---------- | ----------------------------------------------------------------------------------------- |
| `requestedName`    | string     | Human label, e.g. "Sales Dashboard". Load-bearing for multi-page UX; not marked optional. |
| `bundle`           | file (zip) | multipart part; primary payload.                                                          |
| `contentReference` | string     | optional — id of already-staged content, alternative to `bundle`.                         |
| `workspaceId`      | string     | optional — target workspace if known.                                                     |

`upload`'s `--zip-file`-as-multipart design tracks the _primary_ option under consideration for `bundle`, not a finalized contract — transport is still pending upstream confirmation.

**Access model:** this endpoint is accessible by standard (non-admin) users.

**Server-side validation:** payload validation (size, content-type, reject-oversized-early, no execution of untrusted content) is explicitly server-side only, performed synchronously in Pkg A before enqueue. A rejection can therefore surface as a synchronous HTTP 4xx error from the `POST` call itself, distinct from the async job-level `Failed` status (§3.2, REQ-110–111).

### 2.6 Output Shapes

**Human — success:**

```
→ Upload UI Bundle to org

Packaging bundle source... done
Staging and initiating upload... done

Upload queued successfully.
Job ID: 0BXxx0000000001
```

**Human — failure (defensive; see callout below):**

```
→ Upload UI Bundle to org

Packaging bundle source... done
Staging and initiating upload... done

✗ Upload failed
  Job ID:   0BXxx0000000001
  Message:  Bundle validation failed — zip contains disallowed file type at path: src/server.js
```

**JSON — success:** `{ "result": { "jobId": "0BXxx0000000001", "status": "Queued" } }`

**JSON — failure:** `{ "result": { "jobId": "0BXxx0000000001", "status": "Failed", "message": "Bundle validation failed — zip contains disallowed file type at path: src/server.js" } }`

Status values (`Queued`/`InProgress`/`Succeeded`/`Failed`) match the server-side `UIBundleDeployJob` entity. The CLI only ever reports whichever status the one synchronous `POST` response carries (`Queued` or `Failed`) — it never observes `InProgress`/`Succeeded` in this scope, since that needs the polling surface REQ-301/303 exclude.

---

## 3. Edge Cases and Error Handling

### 3.1 Edge Cases

1. **Non-existent or invalid `--zip-file` path**

   - **Scenario:** the path passed to `--zip-file` does not exist, or points to a directory rather than a file.
   - **Expected Behavior:** `Flags.file({ exists: true })` raises its validation error before any network call (REQ-103); no `POST` is issued.

2. **A non-zip file passed as `--zip-file`**

   - **Scenario:** a real, existing file that is not a valid zip is supplied.
   - **Expected Behavior:** the CLI never inspects zip contents (REQ-112). `Flags.file({ exists: true })` only checks the path exists, not that it's a valid zip. The bundle is sent as-is; the server is the sole validator, and a bad payload surfaces as a synchronous server-side rejection (HTTP 4xx, §3.2), never a CLI-side content check.

3. **Server response body unexpectedly carries `status: "Failed"`**
   - **Scenario:** the still-Draft Pkg A contract (§2.5, §5) evolves to return a `Failed`-shaped `POST` body — not expected under today's contract, which documents only `Queued`.
   - **Expected Behavior:** human/JSON failure output per AC2 (108/109), exit 1 — handled defensively as a returned result object, not thrown. The CLI does not fail closed on an unexpected-but-well-formed body.

### 3.2 Error Handling

1. **HTTP 4xx/5xx server rejection from the `POST` itself (size/content-type/validation)**

   - **When:** the server synchronously rejects the request — e.g. its early size/content-type check (§2.5) — returning an HTTP error with no job id and no job-shaped body.
   - **Display:** thrown `UiBundleUploadValidationError` (`SfError` from `@salesforce/core`), server message surfaced verbatim (REQ-111), no rewriting or truncation.
   - **Action:** exit 1; no result object emitted. This is the _actual_ synchronous-failure path (REQ-110), distinct from the defensive `Failed` result object (§3.1 case 3 / AC2 108–109).

2. **Auth failure**

   - **When:** the target org's auth is invalid/expired, or the endpoint rejects the caller.
   - **Display:** thrown `UiBundleUploadAuthError`, server message verbatim.
   - **Action:** exit 1, no network result object.

3. **Network failure / no HTTP response**

   - **When:** the `POST` cannot complete (connection refused, timeout, DNS, etc.).
   - **Display:** thrown `UiBundleUploadNetworkError`.
   - **Action:** exit 1, no network result object.

4. **Missing or unresolvable required flags**
   - **When:** `--zip-file`/`--use-pages` omitted → `FailedFlagValidationError` (flag parser); `--target-org` omitted with no default org → `NoDefaultEnvError` (org resolver, distinct mechanism — see `dev.nut.ts:58`).
   - **Display:** the framework's flag/org-resolver validation error.
   - **Action:** fail before any network call (REQ-102/104/105), exit 1.

> **No client-side zip-content validation, ever (REQ-112).** Content safety is a server-side concern (§2.5 server-side validation); the CLI never inspects, unzips, or scans the payload.

---

## 4. Constraints

- **Repo:** ships inside the existing `plugin-ui-bundle-dev` repo (not a new plugin) to hit a near-term code-check-in deadline.
- **Naming:** the command is `upload`, not `deploy` — `deploy` would collide with `sf project deploy`'s full Metadata-API lifecycle.
- **Dependency:** the Connect API this command calls through to ultimately invokes the server-side `UIBundleCrud.create(UIBundleSource)`.
- **Non-regression is first-class:** `plugin-ui-bundle-dev` is a shared, shipped production plugin, so `upload` must not regress `sf ui-bundle dev` (see §6.2 Non-Regression Checklist).
- **JIT plugin install:** `plugin-ui-bundle-dev` is a just-in-time install — first invocation of `sf ui-bundle upload` triggers automatic plugin installation; there is no pre-install step today (pre-installing, e.g. baked into the CAP workspace image, is a future consideration, not in scope).

---

## 5. Testing Guidelines

### 5.1 Unit Testing (`upload.test.ts`)

- [ ] Missing `--zip-file` → `FailedFlagValidationError`, no network call.
- [ ] Missing `--use-pages` → `FailedFlagValidationError`, no network call.
- [ ] Missing `--target-org` (no default) → `NoDefaultEnvError` — distinct from the flag-parse cases.
- [ ] Non-existent `--zip-file` path → `Flags.file({ exists: true })` validation error, no network call.
- [ ] `Queued` response → human success block and `--json` shape (§2.6).
- [ ] `Failed` response (defensive) → human failure block and `--json` shape (§2.6).
- [ ] Each CLI-side `SfError` name asserted: `UiBundleUploadValidationError` / `UiBundleUploadNetworkError` / `UiBundleUploadAuthError`.
- [ ] Lint, build, and license-header checks clean on all new `.ts` files.

### 5.2 Integration Testing (`upload.nut.ts`)

Tiered like `dev.nut.ts` — Tier 1 (`dev.nut.ts:33-71`, no-auth flag-parse checks) and Tier 2 (`dev.nut.ts:72+`, real-org checks). Tier 2 throws if `TESTKIT_AUTH_URL` is unset, matching `dev.nut.ts`'s existing contract — it does not silently skip.

- [ ] Tier 1: flag-parse / validation cases run without auth.
- [ ] Tier 2: real-org `POST` path returns and reports a `Queued` job id.
- [ ] Tier 2 confirmed to throw (not silently skip) when `TESTKIT_AUTH_URL` is unset.
- [ ] `command-snapshot.json` / `COMMANDS.md` show only tool-generated diffs — zero hand-edits.

**Non-Regression Checklist** — adding `upload` must not touch the existing `dev` command. **Zero diff required** on:

- [ ] `src/commands/ui-bundle/dev.ts`, `messages/ui-bundle.dev.md`, `schemas/ui__bundle-dev.json`
- [ ] Existing `UiBundleDevResult` export in `src/config/types.ts`
- [ ] Existing `ui-bundle:dev` element in `command-snapshot.json` (`flagChars: ["b","n","o","p","u"]`) — `upload` is appended as a new 2nd element, never mutating the 1st
- [ ] `test/commands/ui-bundle/{dev.test.ts,dev.nut.ts,devPort.nut.ts,devWithUrl.nut.ts}`, and every existing export in `helpers/devServerUtils.ts` / `helpers/uiBundleProjectUtils.ts`
- [ ] `README.md`'s `### sf ui-bundle dev` section + Quick Start/Features prose (new subsection appended after, not interleaved)
- [ ] `package.json`'s `oclif.topics.ui-bundle` block; `src/index.ts` (stays `export default {};`)
- [ ] **Test parity:** running the existing `dev` unit suite and `dev`-scoped NUTs post-change produces identical pass/fail results to the pre-change baseline — zero new failures, zero fixed.

### 5.3 Manual Testing

Browser/responsive/cross-device checks from the template do not apply — this is a CLI with no browser surface. CLI-appropriate manual verification instead:

- [ ] Smoke-test `sf ui-bundle upload` against a real org for a `Queued` result, and (if reachable) a server-rejected/error case.
- [ ] Eyeball `--json` output against the documented shapes in §2.6.
- [ ] Confirm `--help` output matches the contract documented in §2.4.

---

## 6. Code Comment Style Guidelines

Code comments added for this feature follow these rules:

1. **Implementation-focused, not business-focused.** A comment explains what the code does or the specific technical reason for a choice — never the feature's business rationale, user story, or requirements narrative.
2. **Concise, not verbose.** Prefer a single short line over a multi-line explanation or paragraph.
3. **No requirements/AC/spec references.** Comments must never cite requirement or acceptance-criteria IDs from the spec or plan documents (e.g. `REQ-112`, `AC2`, `§2.5`). State the constraint or reasoning directly so the comment stands on its own.

   ```
   // Don't: no client-side zip validation (REQ-112)
   // Do:    server validates zip content; client sends the payload as-is
   ```

---

## 7. Out of Scope

1. **REQ-301.** No `status` command / `GET /connect/uibundle/deploys/{jobId}`. → Dreamforce+.
2. **REQ-302.** No local-directory source, no auto-compression — `--zip-file` only. → Dreamforce+.
3. **REQ-303.** No `--wait` flag, no client-side polling. → Dreamforce+.
4. **REQ-304.** `--use-pages` stays required-boolean, Pages-only — no generic upload semantics. → Dreamforce+ makes it optional.
5. **REQ-305.** No extraction into a shared TypeScript library — lives entirely in `plugin-ui-bundle-dev` for this release. → Acknowledged roadmap item, not merely a deferred maybe: library extraction is on the roadmap for Dreamforce or shortly after, with initial use cases being CLI-specific from agents, and the eventual goal of both a CLI and a library covering all entryways down the line.

---

---

---

---

---
