# Feature Specification — `sf ui-bundle upload` Command

**Type:** FEAT
**Feature Name:** `sf ui-bundle upload` Command
**Date:** 2026-07-08

---

## 1. Feature Summary

`sf ui-bundle upload` is a thin CLI wrapper around `POST /connect/ui-bundle/deployments`.

**Command state:** the command ships in developer-preview state — `public static readonly state = 'preview';` on the command class. `sf-plugins-core` therefore emits a runtime warning on every invocation and oclif prints a preview banner in `--help` (§2.4).

**What it enables:**

- Standard (non-admin) users can persist a React UI Bundle without the Metadata API, which requires admin-only `ModifyMetadata`/`ModifyAllData` at the framework level.
- The bundle source can be supplied two ways: a pre-built zip via `--zip-file`, or an uncompressed source directory via `--bundle-dir` that the CLI auto-compresses before upload (§2.4).

**How it works:**

- The endpoint is fully async: the CLI issues one `POST`, which stages the zip, enqueues a job, and returns `202 Accepted` immediately.
- When `--bundle-dir` is used, the CLI compresses the directory to a zip (via `@salesforce/source-deploy-retrieve`) before the `POST`; when `--zip-file` is used, the file is sent as-is.
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

1. Ship `sf ui-bundle upload` as one synchronous call to `POST /connect/ui-bundle/deployments` — no polling (REQ-101).
2. Accept the bundle source as exactly one of `--zip-file` or `--bundle-dir`, and validate the required flags (the `--zip-file`/`--bundle-dir` exactly-one relationship, `--use-salesforce-pages`, `--target-org`) before any network call (REQ-102–105).
3. Produce correct human and `--json` output for both success and failure paths (§2.6), surfacing the server message verbatim (REQ-106–109, 111).
4. Use distinct CLI-side error names, separable from a server-reported `Failed` status, so JSON consumers can branch on `result.name` (REQ-110).
5. Perform no client-side zip-content validation — a server-side concern (REQ-112).
6. When `--bundle-dir` is supplied, compress the directory to a zip via `@salesforce/source-deploy-retrieve` before the `POST`; when `--zip-file` is supplied, send the file as-is (REQ-302).
7. Ship the command in developer-preview state (`state = 'preview'`) so both `--help` and runtime surface the preview warning.
8. The change is additive to the plugin's command surface — new `UiBundleUploadResult` type (REQ-113, 205), generated artifacts (`command-snapshot.json`, `COMMANDS.md` — REQ-202, 212), `README.md` section (REQ-209), and test fixtures (REQ-208) are all new or appended, with no existing `dev` command source modified. The one deliberate exception is `package.json`, which gains `@salesforce/source-deploy-retrieve` as a new runtime dependency (§2.4) — so the framing is additive-to-plugin plus one dependency addition, not strictly "nothing existing modified."

### 2.3 Acceptance Criteria

**AC1 (REQ-101–105) — Flags & synchronous POST**

- [ ] **101.** All flags valid (exactly one bundle source) → exactly one synchronous `POST`; no retry/poll.
- [ ] **102.** Neither `--zip-file` nor `--bundle-dir` given → `FailedFlagValidationError` from the `exactlyOne` relationship (`Exactly one of the following must be provided: --zip-file, --bundle-dir`), no network call. Neither flag is a standalone `required: true` flag anymore; the requirement is enforced by the exactly-one group.
- [ ] **102b.** Both `--zip-file` and `--bundle-dir` given → `FailedFlagValidationError` from the `exactlyOne` relationship (`--zip-file cannot also be provided when using --bundle-dir`, or the symmetric `--bundle-dir cannot also be provided when using --zip-file` depending on parse order), no network call.
- [ ] **103.** `--zip-file` path missing/not-a-file → `Flags.file({ exists: true })` validation error, no network call. Symmetrically, `--bundle-dir` path missing/not-a-directory → `Flags.directory({ exists: true })` validation error, no network call.
- [ ] **104.** `--use-salesforce-pages` omitted → `FailedFlagValidationError` (`Missing required flag use-salesforce-pages`), no network call.
- [ ] **105.** `--target-org` omitted, no default → `NoDefaultEnvError` via `Flags.requiredOrg()`, no network call. Distinct mechanism from 102/104 (org resolver, not flag parser) — see `dev.nut.ts:58` for the existing pattern.

**AC2 (REQ-106–109) — Output shapes**

- [ ] **106.** Without `--json`, `Queued` response → human success block (§2.6) to stdout, exit 0.
- [ ] **107.** With `--json`, `Queued` response → `{ "result": { "jobId", "status": "Queued" } }` only, no human text.
- [ ] **108.** Without `--json`, defensive handling for whether the server response body ever carries a `status: "Failed"` shape → human failure block (§2.6) to stderr, exit 1. Not expected under the current merged contract (§2.5) — a `Failed` result requires a job id and a job-shaped `POST` response body, which the upstream spec does not document as a synchronous response — but the CLI does not fail closed if it happens.
- [ ] **109.** With `--json`, equivalent of 108 → `{ "result": { "jobId", "status": "Failed", "message" } }`, exit 1. Same "defensive, not expected" framing as 108.

**AC3 (REQ-110–112) — Error semantics**

- [ ] **110.** The _actual_ synchronous-failure path: an HTTP-level 4xx/5xx response from the `POST` call itself (no job id, no valid job-shaped body — e.g. the server's own early size/content-type rejection per §2.5, or auth failure, or no HTTP response at all) → thrown `SfError` with a distinct CLI-side name (`UiBundleUploadAuthError`/`UiBundleUploadNetworkError`/`UiBundleUploadValidationError`), separate from a server `Failed` status result object (108/109).
- [ ] **111.** Server error message — whether from an HTTP error body (110) or, defensively, a `Failed.message` (108/109) — surfaced verbatim, no rewriting or truncation.
- [ ] **112.** No client-side zip-content validation, ever.

**AC4 (REQ-113) — Result type**

- [ ] **113.** `UiBundleUploadResult` is a plain type in `src/config/types.ts`: `{ jobId: string; status: 'Queued' | 'InProgress' | 'Succeeded' | 'Failed'; message?: string }` — a sibling export, not a subclass/modification of `UiBundleDevResult`.

**AC5 — Non-regression**

- [ ] Covered by the Non-Regression checklist in §5.2; every item there is falsifiable via `git diff` or test-suite parity.

### 2.4 CLI Command Contract

**Command state:** `public static readonly state = 'preview';` on the command class. This marks the command as developer-preview, so oclif prints `This command is in preview.` in `--help` output and `sf-plugins-core` emits the runtime warning `⚠ This command is currently in developer preview. Developer preview commands will likely change before shipping, use at your own risk. Don't use developer preview commands in your scripts.` on every invocation.

| Flag                     | Char | Type                                | Required                          | Notes                                                                                                                                                                                                                                                                          |
| ------------------------ | ---- | ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--zip-file`             | `-z` | `Flags.file({ exists: true })`      | exactly-one (with `--bundle-dir`) | Pre-built zip source, sent as-is. No client-side zip-content validation (REQ-112). Declares `exactlyOne: ['zip-file', 'bundle-dir']`; no longer a standalone `required: true` flag.                                                                                            |
| `--bundle-dir`           | `-d` | `Flags.directory({ exists: true })` | exactly-one (with `--zip-file`)   | Uncompressed UI Bundle source directory; CLI auto-compresses it before upload (§2.6, REQ-302). Declares `exactlyOne: ['zip-file', 'bundle-dir']`. `-d` is free — `dev` uses `b/n/o/p/u`, `upload` uses `o/z`, so no collision.                                                 |
| `--use-salesforce-pages` | —    | `Flags.boolean({ required: true })` | yes                               | No short char — avoids `-p` collision with `dev`'s `--port`. Per the merged server contract (§2.5), there is currently no corresponding server-side field for this flag — it is a CLI-side concept only, its server effect contingent on the AC6 transport/contract resolving. |
| `--target-org`           | `-o` | `Flags.requiredOrg()`               | yes                               | Same pattern as `dev.ts`; supplies its own messages.                                                                                                                                                                                                                           |

**Exactly-one-of semantics:** `--zip-file` and `--bundle-dir` each declare `exactlyOne: ['zip-file', 'bundle-dir']`. The resulting validation, enforced by the oclif flag parser before any network call:

- Neither flag given → `FailedFlagValidationError` (`Exactly one of the following must be provided: --zip-file, --bundle-dir`), no network call.
- Both flags given → `FailedFlagValidationError` (`--zip-file cannot also be provided when using --bundle-dir`, or the symmetric message depending on parse order), no network call.
- Exactly one given → proceeds to the `POST` path.

Global `--json` / `--flags-dir` inherited from `SfCommand`.

**`--help`:**

```
This command is in preview.

Upload a UI Bundle to your org.

USAGE
  $ sf ui-bundle upload (-z <value> | -d <value>) --use-salesforce-pages -o <value> [--json] [--flags-dir <value>]

FLAGS
  -z, --zip-file=<value>       Path to the UI Bundle source to upload.
  -d, --bundle-dir=<value>     Path to an uncompressed UI Bundle source directory; the CLI compresses it before upload.
      --use-salesforce-pages   (required) Toggle whether this UI Bundle should be uploaded to Salesforce Pages.
  -o, --target-org=<value>     (required) Username or alias of the target org.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json                Format output as json.

DESCRIPTION
Use this command to upload a React-based UI Bundle to your Salesforce org. Provide the bundle source as either a
compressed ZIP file (--zip-file) or an uncompressed source directory (--bundle-dir), which the CLI compresses for
you. This can be used by both admin and non-admin users.
The upload is asynchronous. View the UI bundle in your org to verify completion.

EXAMPLES
  Upload a UI Bundle to Salesforce Pages using your default org:
    $ sf ui-bundle upload --zip-file my-compressed-bundle --use-salesforce-pages

  Upload an uncompressed source directory (auto-compressed by the CLI):
    $ sf ui-bundle upload --bundle-dir ./my-bundle-src --use-salesforce-pages

  Upload to a specific org by alias:
    $ sf ui-bundle upload --zip-file my-compressed-bundle --use-salesforce-pages --target-org my-org
```

**New dependency — `@salesforce/source-deploy-retrieve` (SDR):** compression of a `--bundle-dir` source leverages SDR's zip capability (its `ZipWriter` / zip-stream utility) to produce the zip in-memory or in a temp file before the `POST`. SDR is **not** currently in `package.json` (confirmed against the committed `dependencies` block — sibling `@salesforce/*` deps are `@salesforce/core`, `@salesforce/kit`, `@salesforce/sf-plugins-core`, `@salesforce/ui-bundle`, all pinned as `^`-caret ranges), so this feature **adds** it as a new runtime dependency using the same caret convention (exact minor version to be resolved at implementation time). The precise SDR API call is left to implementation; the spec fixes only the library and its zip utility as the mechanism.

### 2.5 Connect API Contract (v62.0 — merged in Core, feature branch)

This documents the upstream Connect API contract, grounded in merged Core source on feature branch `p/salesforce-pages/262-develop` (not yet on main). Only the `POST` is in scope for this command; the `GET` below is shown for context/comparison only (REQ-301 excludes it).

**Endpoints:**

| Method | Path                                                         | In scope for `upload`?                                  |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| `POST` | `/services/data/v62.0/connect/ui-bundle/deployments`         | Yes — the one call this command makes.                  |
| `GET`  | `/services/data/v62.0/connect/ui-bundle/deployments/{jobId}` | No — status polling, context/comparison only (REQ-301). |

Note: `minVersion = 262` (API v62.0); `allowsPortalUsers = false`; `supportedFormats = {JSON}`; Apex family `ConnectApi.UiBundleDeploy`.

**`POST` request** — the input representation is `UiBundleDeployRequestRepresentation`, serialized under the top-level tag `uiBundleDeployRequest`:

| Field              | Type   | Required?              | Notes                                                                                                                                   |
| ------------------ | ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `requestedName`    | string | optional (recommended) | Human-readable page label → BPO `RequestedName`.                                                                                        |
| `contentReference` | string | optional               | Reference to already-staged content (ContentVersion / staged blob id) carrying the zip. **The only transport wired server-side today.** |
| `workspaceId`      | string | optional               | Target CMS workspace id, when known.                                                                                                    |

**⚠ Transport open question (AC6):** The merged server contract exposes ONLY `contentReference` (a staged-content id) as the way the zip reaches the server. There is **no `bundle` multipart file part, no base64 body, and no `usePages`/`useSalesforcePages` field server-side today.** Whether the final transport is a multipart `bundle` part, base64, or staged-content-then-`contentReference` is explicitly unresolved upstream (tracked as AC6 in the upstream work item, "not yet locked"). This reconciles with the CLI's current `--zip-file`-as-multipart design (§2.2/§2.6): that design tracks a transport that is NOT yet the wired server contract. The CLI's zip-delivery mechanism is therefore contingent on AC6 resolving, and only `contentReference` works against the merged endpoint as of this writing.

**`POST` response — 202 Accepted** — representation `UiBundleDeployResponseRepresentation` (Apex `ConnectApi.UiBundleDeployResponse`):

```
{ "jobId": "<BPO Id>", "status": "Queued" }
```

**`GET` response (context only)** — representation `UiBundleDeployStatusRepresentation` (Apex `ConnectApi.UiBundleDeployStatus`), `suppressNullsOnSerialization = true` (null fields dropped):

| Field           | When populated | Source (BPO col)              |
| --------------- | -------------- | ----------------------------- |
| `jobId`         | always         | `Id`                          |
| `requestedName` | always         | `Label`                       |
| `status`        | always         | mapped enum                   |
| `pageUrl`       | Succeeded only | `PageUrl`                     |
| `uiBundleId`    | Succeeded only | `UiBundleIdentifier` (9YE id) |
| `workspaceId`   | Succeeded only | `CmsWorkspaceIdentifier`      |
| `error`         | Failed only    | `ErrorDetail` (plain text)    |

**Status enum (frozen contract):** `Queued | InProgress | Succeeded | Failed`. The entity uses `Success`/`Fail` internally; the service translates at the contract boundary (`UiBundleDeployService#toContractStatus`).

**HTTP status codes (from the upstream ACs):** 202 accept · 400 invalid payload · 403 missing citizen-dev permission (currently a no-op seam) · 404 on GET when the job doesn't exist OR is owned by another user (no existence leak; scoped by `CreatedById`).

**Source of truth (artifacts):** repo `core-2206/core-262-public`, host `gitcore.soma.salesforce.com`, feature branch `p/salesforce-pages/262-develop` (merged via PR #111849, work item W-23174801 — NOT yet on `264-main`/`262-patch`). New modules: `core/salesforce-pages-connect-api` (resources/`IUiBundleDeployResource`, constants/`UiBundleDeployConstants`, family/`UiBundleDeployResourceFamily`, representations/`UiBundleDeploy{Request,Response,Status}Representation`) and `core/salesforce-pages-connect-impl` (resources/`UiBundleDeployResource`, service/`UiBundleDeployService`, `UiBundleDeploymentStore`/`UiBundleDeploymentUddStore`). Constants: `DEPLOYS_URL = "/connect/ui-bundle/deployments"`, `DEPLOY_REQUEST_INPUT = "uiBundleDeployRequest"`, `JOB_ID = "jobId"`.

**Caveats:**

- Endpoint is on a feature branch, not yet on main — subject to change before GA.
- Permission gate (citizen-dev perm) and payload validation are TODO seams in the merged skeleton, not yet enforced.
- `pageUrl` and `workspaceId` are scheduled for removal per DEC-120 (2026-07-09): page URL to be resolved at render time from developer name; workspace read via UDD off the UIBundle FK. Do NOT assume they are always populated on `Succeeded`.

**Access model:** this endpoint is accessible by standard (non-admin) users.

**Server-side validation:** payload validation (size, content-type, reject-oversized-early, no execution of untrusted content) is specified server-side to be performed synchronously before enqueue, but is a not-yet-enforced seam in the current merged skeleton. A rejection can therefore surface as a synchronous HTTP 4xx error from the `POST` call itself, distinct from the async job-level `Failed` status (§3.2, REQ-110–111).

### 2.6 Output Shapes

> **Output format is governed solely by the `--json` flag.** With `--json`, the command emits ONLY the JSON result object (no human-readable text) — on both the success and the failure path. Without `--json`, the command emits ONLY the human-readable formatted text blocks shown below (to stdout on success, stderr on failure) and never emits JSON — again on both paths. There is no mode that mixes the two.

The `Packaging bundle source...` step is path-dependent: with `--bundle-dir` it is the real SDR compression pass (directory → zip, REQ-302); with `--zip-file` there is nothing to package, so the step is trivial/no-op (the file is read and sent as-is). The `Staging and initiating upload...` step is identical for both paths.

**Human — success (`--bundle-dir`, compression happens):**

```
→ Upload UI Bundle to org

Packaging bundle source... done
Staging and initiating upload... done

Upload queued successfully.
Job ID: 0BXxx0000000001
```

**Human — success (`--zip-file`, no compression):**

```
→ Upload UI Bundle to org

Staging and initiating upload... done

Upload queued successfully.
Job ID: 0BXxx0000000001
```

**Human — failure (defensive; see callout below, text sourced from `messages/ui-bundle.upload.md` per §6.3):**

```
→ Upload UI Bundle to org

Packaging bundle source... done
Staging and initiating upload... done

Upload failed
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

3. **Neither / both of `--zip-file` and `--bundle-dir` supplied**

   - **Scenario:** the invocation omits both bundle-source flags, or supplies both.
   - **Expected Behavior:** the `exactlyOne: ['zip-file', 'bundle-dir']` relationship raises `FailedFlagValidationError` before any network call (§3.2 case 4, AC 102/102b). Neither is a standalone `required` flag; the exactly-one group is the sole enforcement point.

4. **`--bundle-dir` path missing or not a directory**

   - **Scenario:** the path passed to `--bundle-dir` does not exist, or points to a file rather than a directory.
   - **Expected Behavior:** `Flags.directory({ exists: true })` raises its validation error before any network call and before compression; no `POST` is issued. Contents of the directory are not inspected for validity — only compressed and sent (REQ-302; REQ-112 still applies — the server is the sole content validator).

5. **Server response body unexpectedly carries `status: "Failed"`**
   - **Scenario:** the still-Draft Pkg A contract (§2.5) evolves to return a `Failed`-shaped `POST` body — not expected under today's contract, which documents only `Queued`.
   - **Expected Behavior:** human/JSON failure output per AC2 (108/109), exit 1 — handled defensively as a returned result object, not thrown. The CLI does not fail closed on an unexpected-but-well-formed body.

### 3.2 Error Handling

1. **HTTP 4xx/5xx server rejection from the `POST` itself (size/content-type/validation)**

   - **When:** the server synchronously rejects the request — e.g. its early size/content-type check (§2.5) — returning an HTTP error with no job id and no job-shaped body.
   - **Display:** thrown `UiBundleUploadValidationError` (`SfError` from `@salesforce/core`), server message surfaced verbatim (REQ-111), no rewriting or truncation.
   - **Action:** exit 1; no result object emitted. This is the _actual_ synchronous-failure path (REQ-110), distinct from the defensive `Failed` result object (§3.1 case 5 / AC2 108–109).

2. **Auth failure**

   - **When:** the target org's auth is invalid/expired, or the endpoint rejects the caller.
   - **Display:** thrown `UiBundleUploadAuthError`, server message verbatim.
   - **Action:** exit 1, no network result object.

3. **Network failure / no HTTP response**

   - **When:** the `POST` cannot complete (connection refused, timeout, DNS, etc.).
   - **Display:** thrown `UiBundleUploadNetworkError`.
   - **Action:** exit 1, no network result object.

4. **Missing or unresolvable required flags**
   - **When:** neither/both of `--zip-file`/`--bundle-dir` supplied → `FailedFlagValidationError` from the `exactlyOne` relationship; `--use-salesforce-pages` omitted → `FailedFlagValidationError` (flag parser); `--target-org` omitted with no default org → `NoDefaultEnvError` (org resolver, distinct mechanism — see `dev.nut.ts:58`).
   - **Display:** the framework's flag/org-resolver validation error.
   - **Action:** fail before any network call (REQ-102/102b/104/105), exit 1.

> **No client-side zip-content validation, ever (REQ-112).** Content safety is a server-side concern (§2.5 server-side validation); the CLI never inspects, unzips, or scans the payload.

---

## 4. Constraints

- **Repo:** ships inside the existing `plugin-ui-bundle-dev` repo (not a new plugin) to hit a near-term code-check-in deadline.
- **Naming:** the command is `upload`, not `deploy` — `deploy` would collide with `sf project deploy`'s full Metadata-API lifecycle.
- **Dependency:** the Connect API this command calls through to ultimately invokes the server-side `UIBundleCrud.create(UIBundleSource)`.
- **Non-regression is first-class:** `plugin-ui-bundle-dev` is a shared, shipped production plugin, so `upload` must not regress `sf ui-bundle dev` (see §5.2 Non-Regression Checklist).
- **JIT plugin install:** `plugin-ui-bundle-dev` is a just-in-time install — first invocation of `sf ui-bundle upload` triggers automatic plugin installation; there is no pre-install step today (pre-installing, e.g. baked into the CAP workspace image, is a future consideration, not in scope).

---

## 5. Testing Guidelines

### 5.1 Unit Testing (`upload.test.ts`)

- [ ] Neither `--zip-file` nor `--bundle-dir` → `FailedFlagValidationError` (exactly-one), no network call.
- [ ] Both `--zip-file` and `--bundle-dir` → `FailedFlagValidationError` (exactly-one), no network call.
- [ ] Missing `--use-salesforce-pages` → `FailedFlagValidationError`, no network call.
- [ ] Missing `--target-org` (no default) → `NoDefaultEnvError` — distinct from the flag-parse cases.
- [ ] Non-existent `--zip-file` path → `Flags.file({ exists: true })` validation error, no network call.
- [ ] Non-existent / not-a-directory `--bundle-dir` path → `Flags.directory({ exists: true })` validation error, no network call.
- [ ] `--bundle-dir` given → CLI compresses the directory (via `@salesforce/source-deploy-retrieve`) and the multipart `bundle` part is a zip identical in shape to the `--zip-file` path.
- [ ] `--zip-file` given → file sent as-is, no re-compression pass.
- [ ] `Queued` response → human success block and `--json` shape (§2.6).
- [ ] `Failed` response (defensive) → human failure block and `--json` shape (§2.6).
- [ ] Each CLI-side `SfError` name asserted: `UiBundleUploadValidationError` / `UiBundleUploadNetworkError` / `UiBundleUploadAuthError`.
- [ ] Preview-state warning emitted (`state = 'preview'`) — not suppressed under `--json`'s result payload.
- [ ] No customer-facing output literal is inlined in `upload.ts` — all such output resolves via `messages.getMessage()` per §6.3.
- [ ] Lint, build, and license-header checks clean on all new `.ts` files.

### 5.2 Integration Testing (`upload.nut.ts`)

Tiered like `dev.nut.ts` — Tier 1 (`dev.nut.ts:33-71`, no-auth flag-parse checks) and Tier 2 (`dev.nut.ts:72+`, real-org checks). Tier 2 throws if `TESTKIT_AUTH_URL` is unset, matching `dev.nut.ts`'s existing contract — it does not silently skip.

- [ ] Tier 1: flag-parse / validation cases run without auth — including neither/both of `--zip-file`/`--bundle-dir` (exactly-one) and missing `--use-salesforce-pages`.
- [ ] Tier 2: real-org `POST` path returns and reports a `Queued` job id, for both the `--zip-file` and `--bundle-dir` (auto-compressed) sources.
- [ ] Tier 2 confirmed to throw (not silently skip) when `TESTKIT_AUTH_URL` is unset.
- [ ] `command-snapshot.json` / `COMMANDS.md` show only tool-generated diffs — zero hand-edits.

**Non-Regression Checklist** — adding `upload` must not touch the existing `dev` command. **Zero diff required** on:

- [ ] `src/commands/ui-bundle/dev.ts`, `messages/ui-bundle.dev.md`, `schemas/ui__bundle-dev.json`
- [ ] Existing `UiBundleDevResult` export in `src/config/types.ts`
- [ ] Existing `ui-bundle:dev` element in `command-snapshot.json` (`flagChars: ["b","n","o","p","u"]`) — `upload` is appended as a new 2nd element, never mutating the 1st
- [ ] `test/commands/ui-bundle/{dev.test.ts,dev.nut.ts,devPort.nut.ts,devWithUrl.nut.ts}`, and every existing export in `helpers/devServerUtils.ts` / `helpers/uiBundleProjectUtils.ts`
- [ ] `README.md`'s `### sf ui-bundle dev` section + Quick Start/Features prose (new subsection appended after, not interleaved)
- [ ] `package.json`'s `oclif.topics.ui-bundle` block; `src/index.ts` (stays `export default {};`). Note: the `dependencies` block is **not** zero-diff — it gains `@salesforce/source-deploy-retrieve` (§2.4), the one intended `package.json` change; the `oclif.topics` block and existing deps stay untouched.
- [ ] **Test parity:** running the existing `dev` unit suite and `dev`-scoped NUTs post-change produces identical pass/fail results to the pre-change baseline — zero new failures, zero fixed.

### 5.3 Manual Testing

Browser/responsive/cross-device checks from the template do not apply — this is a CLI with no browser surface. CLI-appropriate manual verification instead:

- [ ] Smoke-test `sf ui-bundle upload` against a real org for a `Queued` result, using both a `--zip-file` and a `--bundle-dir` source, and (if reachable) a server-rejected/error case.
- [ ] Eyeball `--json` output against the documented shapes in §2.6.
- [ ] Confirm `--help` output matches the contract documented in §2.4, including the `This command is in preview.` banner.
- [ ] Confirm the developer-preview runtime warning prints on a normal invocation.

---

## 6. Style Guidelines

### 6.1 Code Comment Guidelines

Code comments added for this feature follow these rules:

1. **Implementation-focused, not business-focused.** A comment explains what the code does or the specific technical reason for a choice — never the feature's business rationale, user story, or requirements narrative.
2. **Concise, not verbose.** Prefer a single short line over a multi-line explanation or paragraph.
3. **No requirements/AC/spec references.** Comments must never cite requirement or acceptance-criteria IDs from the spec or plan documents (e.g. `REQ-112`, `AC2`, `§2.5`). State the constraint or reasoning directly so the comment stands on its own.

   ```
   // Don't: no client-side zip validation (REQ-112)
   // Do:    server validates zip content; client sends the payload as-is
   ```

### 6.2 Plan Generation Guidelines

Plan documents generated for this feature follow these rules:

1. **No references to people, teams, or email addresses, including but not limited to Salesforce employees.** Attribute work to roles or components, never to named individuals, org charts, or contact addresses.
2. **Reference artifacts, not conversations.** Cite files, requirement IDs, and acceptance criteria (`REQ-302`, `AC1`) rather than chat threads, meetings, or verbal decisions, so each plan step stands on its own and stays reproducible.
3. **Every task is falsifiable.** Each plan item names a concrete verification — a command, a test, or a `git diff` check — so completion is objectively checkable rather than a matter of judgment.
4. **Scoped to this release.** Deferred or roadmap work belongs in §7 Out of Scope, not interleaved into plan steps; a plan step describes only in-scope, shippable work.

### 6.3 Output Message Guidelines

All customer-facing output messages — whether success text, info lines, or thrown `SfError` message strings — must follow these rules:

1. **All customer-facing output messages are defined in `messages/ui-bundle.upload.md` and referenced via `messages.getMessage()`.** Never inline customer-facing strings as string literals in the command source. This extends the oclif/sf-plugins-core convention for summaries/descriptions/examples to all runtime output the user sees.
2. **Server/framework-supplied messages surfaced verbatim are pass-through, not authored strings.** A caught `error.message` from the org connection, an HTTP error body, or any other externally-sourced error text is relayed as-is (§2.3 AC3 REQ-111 requires verbatim surfacing) — it is **not** a hardcoded literal and is out of scope for this rule.
3. **The `SfError` name/error-code (the second argument, e.g. `'UiBundleUploadValidationError'`) is a stable machine identifier, not customer-facing prose** — it stays inline.

The command currently inlines three customer-facing strings that this rule requires moving into `messages/ui-bundle.upload.md`: the empty-bundle-dir `SfError` message (`'The bundle source directory is empty.'` in `compressDirectory`), the compression-failure `SfError` message (`'Failed to compress the bundle source directory.'`), and the `Failed`-status human block (`'✗ Upload failed'` and its `Job ID:` / `Message:` labels) — this is the "Upload failed" text the user specifically called out as residing separately in upload.ts. Note: `messages/ui-bundle.upload.md` already defines unused `# error.*` keys (`error.upload-failed`, `error.auth-failed`, `error.network-failed`, `error.validation-failed`) that the code does not currently reference — the guideline's intent is that authored output routes through such message keys rather than duplicating strings inline.

---

## 7. Out of Scope

1. **REQ-301.** No `status` command / `GET /connect/ui-bundle/deployments/{jobId}`. → Dreamforce+.
2. **REQ-303.** No `--wait` flag, no client-side polling. → Dreamforce+.
3. **REQ-304.** `--use-salesforce-pages` stays required-boolean, Pages-only — no generic upload semantics. → Dreamforce+ makes it optional.
4. **REQ-305.** No extraction into a shared TypeScript library — lives entirely in `plugin-ui-bundle-dev` for this release. → Acknowledged roadmap item, not merely a deferred maybe: library extraction is on the roadmap for Dreamforce or shortly after, with initial use cases being CLI-specific from agents, and the eventual goal of both a CLI and a library covering all entryways down the line.

> **Moved into scope — REQ-302.** Previously "No local-directory source, no auto-compression — `--zip-file` only." Now **in scope**: `--bundle-dir` accepts an uncompressed local source directory and the CLI auto-compresses it via `@salesforce/source-deploy-retrieve` before the `POST` (§2.2 item 6, §2.4, §2.6). The REQ id is retained — still referenced by §2.2, §2.4, §2.6, and §3.1 — rather than dropped.

---

---

---

---

---
