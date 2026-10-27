# ZCoder

English | [简体中文](README.zh-CN.md)

A patch-based fork of [ZCode](https://github.com/zai-org/ZCode). The `ZCode/` submodule always
tracks a pinned official commit; everything we add lives in the directory patch queue under
`patches/`. Cloning this repository and applying the queue reproduces the working tree byte for
byte, and nothing here rewrites the submodule history.

## What this fork changes

Everything below is part of the directory queue against the pinned commit. It is a complete
snapshot of the resulting tree, not a commit-by-commit feature sequence. At the time of writing the
queue holds 13 directory patches covering 885 tracked file diffs (501 new files, 2 deletions);
`patches/manifest.json` is the authoritative inventory and those counts move with every export.

### Providers, accounts and model discovery

- **Codex (ChatGPT login) provider.** A Codex template sits next to the OpenAI API-key template.
  It supports browser OAuth and an explicit device-code login, both using the fixed opencode 2.1.4
  Codex client identity with no automatic fallback between them. The provider detail offers
  connect, cancel, re-login, disconnect, model editing and a connection test. Legacy token-sharing
  credentials are not migrated; the user has to log in again.
- **Codex-native web search.** Model requests go through the Codex backend, native search is
  enabled, `allowed_domains` is validated instead of silently dropped, and URL citations carried in
  Responses `output_text.annotations` are surfaced to streaming and non-streaming consumers.
- **Model discovery on save.** A successful Codex login, or a saved generic provider whose key,
  protocol, base URL or headers changed, triggers a model-list read. The UI exposes a "refresh
  models" action with idle/loading/ready/error/unsupported states, and switching or closing panels
  never starts a second host job. Account-type sources keep their existing synchronization path.
- **Resolution priority and fallback.** Model settings resolve personal override, then discovered
  data, then verified offline Codex windows, then the built-in recommendation, and label the source
  they used. Verified windows are only a fallback; an unknown model never gets a fabricated source.
- **Z.AI / BigModel Start Plan** and coding-plan login/upgrade flows (including the embedded
  webview), with Start Plan-only entries hidden from Settings navigation and a deliberately reduced
  set of provider actions.
- **Title generation model** setting (default: inherit the session model), used by session titles
  and `/rename`.

### System prompts and context

- **Per-model system prompts.** Advanced settings keep one custom agent prompt per exact
  `providerId + modelId`. When enabled for a matching model it replaces the other default agent
  prompt sections and keeps only the tool, MCP and Skill descriptions; permissions, approvals and
  the sandbox are untouched. There is no wildcard or provider-wide match. Configuration is
  host-level, the per-session switch is renderer-local, and the prompt is edited in a dialog.
- **Context source update notices.** Changes to the Skills, Agents, MCP-tool and instructions
  catalogs are projected into the V4 timeline as audit notices, built only from explicitly
  allowlisted metadata. They are not user messages and never expose loaded Skill bodies, agent
  system prompts or MCP credentials.
- **Instruction file observation.** User and workspace `AGENTS.md` files are watched through a
  lease owned by the Node adapter, and refreshed at the model-request boundary. Disposal only
  releases that lease.
- **Session context panel.** The status panel shows the model name and resolution source, the
  effective context window and the real auto-compact threshold, plus usage, cache-hit rate and
  output tokens per second. It is a read-only projection; it never opens a connection.
- **`/mcp` diagnostics** (alias `/mcps`) opens a redacted MCP status view and copy action without
  writing configuration.

### Compaction

- **Compaction profiles.** `detailed` (default) and `compact` summaries, selectable live per
  session; compact mode follows the seven-section continuation template and keeps up to fifteen
  relevant files.
- **Workspace-scoped compaction policy.** Create and cold resume read the latest policy for the
  matching workspace, so a policy update in one workspace cannot leak into another.
- **Desktop compaction bridge.** A single-owner bridge carries handshake targets, persisted policy
  reads and forwarding; the source connector keeps the physical connection.
- **Compact result details** in the existing timeline marker; summary bodies stay out of the
  transcript, model history, sharing and export.
- **Long tool turns** are summarized without splitting parallel calls, so an oversized tool turn
  no longer blocks compaction indefinitely.
- **`/autocompact`** queries or sets the current session's auto-compact limit (`80000`, `100k`,
  `80%`, `reset`); it never edits workspace or global settings and only lowers the safe threshold.

### Conversation UI

- **Status capsule and side pane exclusivity.** Opening the right side pane compacts the
  conversation status capsule to its mini form; expanding the capsule closes the side pane without
  dropping tabs or dirty drafts.
- **Shared side-pane viewer tabs.** Read-only viewers collapse into three stable categories (files,
  subagents, plans) instead of creating one tab per object.
- **Status panel and subagent navigation.** Git, Goal, Progress and Run headers share one ordering;
  a header shortcut opens the subagent session directory, and all agents under one root share a
  single read-only side tab.
- **Focus mode (`/force`)** per session, and **selection side chat** (selection to composer chip or
  to a side conversation) on the main timeline.
- **Chat status panel** for git state, goal progress, terminal plan, todos and background resources
  in one collapsed/expanded shell.
- **Navigation removals.** The computer-use settings entry, the desktop remote-control trigger, the
  footer account entry and sidebar marketing banners are no longer rendered; the underlying
  implementations are kept for compatibility.
- **On-demand login.** Startup no longer forces the login page; it opens only for manual login,
  provider connection or an expired session.
- **Local slash commands:** `/model`, `/effort`, `/copy`, `/export`, `/context`, `/fork`,
  `/branch`, `/force`, `/exit`, `/autocompact`, `/rename`, `/plan` and `/mcp` (`/mcps`). They yield
  to CLI commands with the same name, are not registered in read-only views, and only act on the
  session pane that invoked them.
- **Tool rendering.** One tool-call renderer with inline diff previews, full-file versus actual
  Read-range labels, a command-output file preview dialog, a background-Bash output dialog, full
  task-output copy, and running edit/command cards that expand by default while a manual collapse
  stays respected.
- **Conversation polish.** Reading-oriented Markdown type scale, assistant actions
  (copy/like/dislike/fork/retry/timestamp) only on the final part of a row, merged thinking and
  explore summary rows, a normalised turn view model, and reliable image-preview pointer
  dismissal.

### Runtime, agents and safety

- **Defensive security notice** in the shared harness block.
- **Session-scoped Skills/MCP toggles** in the right-hand status panel. They only change the
  current session, never user or workspace configuration, never revoke authorization and never
  force-stop an in-flight call.
- **Permission-mode live switch** from the composer, including inherited subagents.
- **TaskOutput contract:** blocking and non-blocking reads, compact provider-visible status,
  completion-notification dedupe and persisted large output.
- **Background subagents** wake the parent with a completion notification. Nested background Bash
  inside a subagent is cleanup-only, capped at one hour by default, and cancelled when the subagent
  itself is cancelled.
- **Agent reuse guidance** in the Agent and SendMessage descriptions, so follow-up work resumes an
  existing agent instead of spawning a duplicate.
- **Notable fixes:** an instruction-observation watcher leak and read/dispose race, stale Codex
  device-code results after cancellation, Codex native-search domain validation, cross-workspace
  compaction leakage, invalid deferred-tool-call arguments, unbounded tool output, and Read range
  guidance that defaulted to whole-file reads.

### How the changes are integrated

- New behavior lives in new modules that carry a `CONTRACT.md`, a contract example and focused
  tests. Existing files keep only the import, registration, dependency pass-through or single call
  needed to mount them, which keeps the queue replayable on top of upstream.
- Extracted modules include the Codex transport policy, instruction-file observation,
  workspace-scoped compaction policy, the desktop compaction bridge, provider model-resolution
  policy, session resources, the defensive-security notice, and the UI compat-command and
  output-copy helpers.
- UI locale dictionaries are extended through additive message sets; existing keys and values are
  unchanged.
- `patches/@opencode__ai@2.1.4.patch` keeps native-search URL citations in the upstream parser
  instead of copying transport code into the fork. The license and provenance of the adapted
  OpenCode wire helpers are recorded under `third-party/`.
- Line thresholds in `.oxlintrc.json` and `architecture-policy.yaml` are aligned, and every new
  source module is registered in the architecture policy rather than widening a legacy exemption.

## Layout

| Path | Purpose |
| --- | --- |
| `ZCode/` | Upstream source submodule, pinned by gitlink |
| `patches/` | Generated directory patches plus `series` and `manifest.json` |
| `patches.config.json` | Fixed base ref/commit, source and output directories, excludes |
| `scripts/`, `tests/` | Patch export/prepare tooling and its regression tests |
| `.github/workflows/desktop-build.yml` | Windows/Linux packaging as Actions artifacts |
| `start-test.sh`, `start-test.ps1` | Local test-build launchers |
| `AGENTS.md` | Development and delivery rules |

## Quick start

```bash
git submodule update --init -- ZCode
./start-test.sh          # Windows: ./start-test.ps1
```

The launcher keeps your working tree as-is. It only verifies and applies the full queue when the
submodule is completely clean at the pinned commit. `--check` still skips only the launch step, so
it may apply patches, install dependencies or configure the Electron sandbox on first use.

To prepare the source without installing dependencies or launching anything:

```bash
node scripts/prepare-patches.mjs
```

## Development

Work directly in `ZCode/`. Agents and IDEs should treat `AGENTS.md` as the only rule source for
this repository; the submodule's own instructions are not loaded.

Day-to-day checks stay targeted — format only the files you touched and run the tests covering
them. Full type checks, lint and desktop E2E are reserved for the delivery round, not for every
edit.

## Patch queue

```bash
node scripts/export-patches.mjs            # regenerate and verify the queue
node scripts/export-patches.mjs --check    # build and verify a candidate, keep the old queue
node scripts/export-patches.mjs --source /path/to/ZCode
node --test tests/patch-workflow.test.mjs  # tooling regression tests
```

The exporter snapshots the fixed base against the final working tree (committed, staged,
unstaged and untracked changes), splits it into `packages/<pkg>`, `apps/<app>` and top-level
groups, then replays every patch in an isolated worktree with `apply --check --index` and
`apply --index` before comparing trees. It never touches the real index, branches or gitlink.
The previous queue is preserved under `.patch-backups/`.

Directory patches are all-or-nothing: `patches/**` is marked `-text` so checkout line-ending
conversion cannot change the bytes recorded in `manifest.json`.

## Builds

Builds run on GitHub Actions for `windows-x64` (NSIS installer) and `linux-x64` (AppImage, deb,
rpm, pacman). The job checks out the pinned submodule, verifies the gitlink, applies
`patches/series`, installs with the frozen lockfile, stamps a display version, then runs the
existing `pnpm bundle:desktop -- --os <win|linux> --arch x64` pipeline.

The `platform` input accepts `all` (the default), `windows`, or `linux`. Selecting one platform
creates only that platform's packaging job; omitting it preserves the Windows/Linux build.

There is no tag trigger or GitHub Release. Installers are uploaded only as Actions artifacts
and retained for 30 days.

```bash
gh workflow run desktop-build.yml --repo ackwrap/ZCoder --ref main -f version=3.16.3 -f platform=windows
gh run list --repo ackwrap/ZCoder --workflow desktop-build.yml --event workflow_dispatch --branch main
# Select the run matching the dispatched commit, then download only its Windows installer.
gh run download <run-id> --repo ackwrap/ZCoder -n windows-x64-nsis -D dist/<unique-run-directory>
```

Versions follow the upstream number with a fork suffix, so a build is identifiable without
inventing a second version line: `3.16.2-1`, `3.16.2-2`, and so on. The default is
`3.16.2-<run number>`; pass an explicit `version` input to override it. The value is written
only into the checked-out tree before packaging, never back into the patch queue.

Artifacts are unsigned; code signing and notarization are not configured.

## Notes

- The tooling never commits, pushes or updates the gitlink on its own.
- `ZCode/patches/` holds upstream dependency patches and is unrelated to this repository's
  `patches/`.
- `export-patches` and `prepare-patches` share `.patch-export.lock`; if a crashed run left the
  lock behind, confirm the previous process is gone before removing it.
- See [docs/patch-workflow.md](docs/patch-workflow.md) for the full workflow and its boundaries.
