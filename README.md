# ZCoder

A patch-based fork of [ZCode](https://github.com/zai-org/ZCode). The `ZCode/` submodule always
tracks a pinned official commit; everything we add lives in the directory patch queue under
`patches/`. Cloning this repository and applying the queue reproduces the working tree byte for
byte, and nothing here rewrites the submodule history.

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
