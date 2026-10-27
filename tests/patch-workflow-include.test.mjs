import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { exportPatches, verifyQueue } from "../scripts/lib/patch-workflow.mjs";

const exec = promisify(execFile);
const included = "packages/example/helper/dist/helper.js";
async function git(cwd, ...args) {
  return (
    await exec("git", args, {
      cwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })
  ).stdout.trim();
}
async function put(root, path, data) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), data);
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "patch-include-test-"));
  const source = join(root, "source");
  await mkdir(source);
  await git(source, "init", "-b", "main");
  await git(source, "config", "user.name", "Patch Test");
  await git(source, "config", "user.email", "patch@example.invalid");
  await git(source, "config", "core.autocrlf", "false");
  await put(source, ".gitignore", "ignored/\n");
  await put(source, "tracked.txt", "base\n");
  await git(source, "add", ".");
  await git(source, "commit", "-qm", "base");
  const base = await git(source, "rev-parse", "HEAD");
  const configPath = join(root, "config.json");
  const config = {
    schemaVersion: 1,
    source: "source",
    output: "patches",
    base: { ref: "refs/heads/main", commit: base },
    exclude: ["**/dist/**"],
  };
  const save = () => writeFile(configPath, JSON.stringify(config));
  await save();
  t.after(async () => {
    const listing = await git(source, "worktree", "list", "--porcelain").catch(
      () => "",
    );
    for (const line of listing.split("\n")) {
      if (
        line.startsWith("worktree ") &&
        line.slice(9).replaceAll("\\", "/") !== source.replaceAll("\\", "/")
      )
        await git(source, "worktree", "remove", "--force", line.slice(9));
    }
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    source,
    base,
    configPath,
    config,
    save,
    queue: join(root, "patches"),
  };
}
async function indexBytes(source) {
  return readFile(
    await git(
      source,
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "index",
    ),
  );
}

test("exact include replays only its file, preserving staging and excluded manifest", async (t) => {
  const f = await fixture(t);
  f.config.include = [included, "ignored/dist/ignored.js"];
  await f.save();
  await put(f.source, included, "synthetic helper\n");
  await put(f.source, "packages/example/helper/dist/other.js", "other\n");
  await put(
    f.source,
    "packages/example/other/dist/helper.js",
    "other directory\n",
  );
  await put(f.source, "ignored/dist/ignored.js", "ignored\n");
  await put(f.source, "tracked.txt", "staged\n");
  await git(f.source, "add", "tracked.txt");
  await put(f.source, "tracked.txt", "working\n");
  const index = await indexBytes(f.source);
  const status = await git(
    f.source,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  );
  await exportPatches({ configPath: f.configPath });
  const manifest = JSON.parse(
    await readFile(join(f.queue, "manifest.json"), "utf8"),
  );
  assert.ok(manifest.patches.flatMap((p) => p.paths).includes(included));
  assert.deepEqual(manifest.excludedChangedPaths, [
    "packages/example/helper/dist/other.js",
    "packages/example/other/dist/helper.js",
  ]);
  assert.equal(
    await git(f.source, "show", `${manifest.tree}:${included}`),
    "synthetic helper",
  );
  await assert.rejects(
    git(f.source, "cat-file", "-e", `${manifest.tree}:ignored/dist/ignored.js`),
  );
  assert.equal(
    (await verifyQueue({ source: f.source, queue: f.queue })).tree,
    manifest.tree,
  );
  assert.deepEqual(await indexBytes(f.source), index);
  assert.equal(
    await git(f.source, "status", "--porcelain=v1", "--untracked-files=all"),
    status,
  );
});

test("omitted or empty include keeps existing exclusion behavior", async (t) => {
  const f = await fixture(t);
  await put(f.source, included, "synthetic\n");
  for (const value of [undefined, []]) {
    if (value === undefined) delete f.config.include;
    else f.config.include = value;
    await f.save();
    const result = await exportPatches({
      configPath: f.configPath,
      check: true,
    });
    assert.deepEqual(result.excluded, [included]);
    assert.equal(result.files, 0);
  }
});

test("invalid or credential include entries are rejected", async (t) => {
  const f = await fixture(t);
  for (const value of [
    null,
    "file",
    [null],
    ["/absolute"],
    ["C:/absolute"],
    ["../outside"],
    ["a/../b"],
    ["a/./b"],
    ["a//b"],
    ["a/*.js"],
    ["a/?.js"],
    ["a/[x].js"],
    ["a/{x,y}.js"],
    ["a\\b"],
    ["a/\0b"],
    ["a/.env"],
    ["a/secret.key"],
    ["a/.git/config"],
  ]) {
    f.config.include = value;
    await f.save();
    await assert.rejects(
      exportPatches({ configPath: f.configPath, check: true }),
      /include|凭据/i,
      JSON.stringify(value),
    );
  }
});

test("include cannot bypass hard exclusions or staged nested gitlinks", async (t) => {
  const f = await fixture(t);
  const hard = "node_modules/example/dist/helper.js";
  f.config.include = [hard, "vendor/dist/nested"];
  await f.save();
  await put(f.source, hard, "synthetic\n");
  const nested = join(f.source, "vendor/dist/nested");
  await mkdir(nested, { recursive: true });
  await git(nested, "init", "-b", "main");
  await git(nested, "config", "user.name", "Patch Test");
  await git(nested, "config", "user.email", "patch@example.invalid");
  await put(nested, "file", "synthetic\n");
  await git(nested, "add", ".");
  await git(nested, "commit", "-qm", "nested");
  await git(f.source, "add", "vendor/dist/nested");
  const index = await indexBytes(f.source);
  await assert.rejects(exportPatches({ configPath: f.configPath }), /gitlink/);
  assert.deepEqual(await indexBytes(f.source), index);
  f.config.include = [hard];
  await f.save();
  const result = await exportPatches({ configPath: f.configPath, check: true });
  assert.ok(result.excluded.includes(hard));
});

test("include retains base and concurrent change protections", async (t) => {
  const f = await fixture(t);
  f.config.include = [included];
  await f.save();
  await put(f.source, included, "first\n");
  await put(f.queue, "series", "keep\n");
  await assert.rejects(
    exportPatches({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "verified") await put(f.source, included, "later\n");
      },
    }),
    /发生变化/,
  );
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
  await git(f.source, "commit", "--allow-empty", "-qm", "move base");
  await assert.rejects(exportPatches({ configPath: f.configPath }), /基准引用/);
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
});
