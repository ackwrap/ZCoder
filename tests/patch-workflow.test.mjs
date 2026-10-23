import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { exportPatches, prepareSource, verifyQueue } from "../scripts/lib/patch-workflow.mjs";

const exec = promisify(execFile);
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function git(cwd, ...args) {
  return (
    await exec("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })
  ).stdout.trim();
}
async function put(root, path, data) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), data);
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "zcode-patches-test-"));
  const source = join(root, "ZCode");
  await mkdir(source);
  await git(source, "init", "-b", "main");
  await git(source, "config", "user.name", "Patch Test");
  await git(source, "config", "user.email", "patch@example.invalid");
  await git(source, "config", "core.autocrlf", "false");
  await git(source, "config", "core.filemode", "false");
  await put(source, ".gitignore", "node_modules/\n*.log\n");
  await put(source, "README.md", "base\n");
  await put(source, "packages/ui/view.ts", "base\n");
  await put(source, "packages/shared/data.txt", "base\n");
  await put(source, "apps/cli/tool.ts", "base\n");
  await put(source, "apps/cli/dist-types/tool.d.ts", "base generated\n");
  await git(source, "add", ".");
  await git(source, "commit", "-qm", "base");
  const base = await git(source, "rev-parse", "HEAD");
  const configPath = join(root, "patches.config.json");
  const config = {
    schemaVersion: 1,
    source: "ZCode",
    output: "patches",
    base: { ref: "refs/heads/main", commit: base },
    exclude: ["**/node_modules/**", "**/dist-types/**", "**/*.log"],
  };
  await writeFile(configPath, JSON.stringify(config));
  t.after(async () => {
    const listing = await git(source, "worktree", "list", "--porcelain").catch(() => "");
    for (const line of listing.split("\n")) {
      if (
        line.startsWith("worktree ") &&
        line.slice(9).replaceAll("\\", "/") !== source.replaceAll("\\", "/")
      ) {
        await git(source, "worktree", "remove", "--force", line.slice(9));
      }
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, source, base, configPath, queue: join(root, "patches") };
}
async function indexBytes(source) {
  const location = await git(source, "rev-parse", "--path-format=absolute", "--git-path", "index");
  return readFile(location);
}
async function manifest(queue) {
  return JSON.parse(await readFile(join(queue, "manifest.json"), "utf8"));
}
async function tamper(queue, mutate) {
  const value = await manifest(queue);
  const patch = value.patches[0];
  const content = mutate(await readFile(join(queue, patch.file)));
  await writeFile(join(queue, patch.file), content);
  patch.sha256 = sha(content);
  await writeFile(join(queue, "manifest.json"), JSON.stringify(value));
}

test("exports deterministic directory snapshots and keeps the real index/staging untouched", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "staged\n");
  await git(f.source, "add", "packages/ui/view.ts");
  await put(f.source, "packages/ui/view.ts", "final\n");
  await put(f.source, "apps/cli/new.ts", "new\n");
  await put(f.source, "README.md", "readme changed\n");
  await put(f.source, "apps/cli/dist-types/tool.d.ts", "generated noise\n");
  const beforeIndex = await indexBytes(f.source);
  const beforeStatus = await git(f.source, "status", "--porcelain=v1");
  await exportPatches({ configPath: f.configPath });
  assert.deepEqual(await indexBytes(f.source), beforeIndex);
  assert.equal(await git(f.source, "status", "--porcelain=v1"), beforeStatus);
  const first = await manifest(f.queue);
  assert.deepEqual(
    first.patches.map((p) => p.directory),
    [".", "apps/cli", "packages/ui"],
  );
  assert.deepEqual(first.excludedChangedPaths, ["apps/cli/dist-types/tool.d.ts"]);
  assert.equal(await git(f.source, "show", `${first.tree}:packages/ui/view.ts`), "final");
  const bytes = await readFile(join(f.queue, "manifest.json"));
  await exportPatches({ configPath: f.configPath });
  assert.deepEqual(await readFile(join(f.queue, "manifest.json")), bytes);
  assert.deepEqual(await indexBytes(f.source), beforeIndex);
});

test("includes binary changes, deletions, cross-directory renames and odd filenames", async (t) => {
  const f = await fixture(t);
  await rename(join(f.source, "packages/shared/data.txt"), join(f.source, "packages/ui/moved.txt"));
  const odd =
    process.platform === "win32"
      ? "packages/ui/odd [x] 中文 space.ts"
      : "packages/ui/odd [x] 中文\t\n.ts";
  await put(f.source, odd, "odd contents\n");
  await put(f.source, "packages/ui/icon.bin", Buffer.from([0, 1, 2, 255, 0]));
  await rm(join(f.source, "apps/cli/tool.ts"));
  await exportPatches({ configPath: f.configPath });
  const value = await manifest(f.queue);
  const patches = (
    await Promise.all(value.patches.map((p) => readFile(join(f.queue, p.file), "utf8")))
  ).join("\n");
  assert.match(patches, /GIT binary patch/);
  assert.doesNotMatch(patches, /^rename (from|to)/m);
  assert.ok(value.patches.flatMap((p) => p.paths).includes(odd));
  assert.equal(await git(f.source, "show", `${value.tree}:packages/ui/moved.txt`), "base");
  await assert.rejects(git(f.source, "cat-file", "-e", `${value.tree}:apps/cli/tool.ts`));
});

test("preserves explicitly staged executable mode even when core.filemode is false", async (t) => {
  const f = await fixture(t);
  await git(f.source, "update-index", "--chmod=+x", "apps/cli/tool.ts");
  const before = await indexBytes(f.source);
  await exportPatches({ configPath: f.configPath });
  const value = await manifest(f.queue);
  assert.match(await git(f.source, "ls-tree", value.tree, "apps/cli/tool.ts"), /^100755 /);
  assert.deepEqual(await indexBytes(f.source), before);
});

test("supports committed development changes without moving the pinned base branch", async (t) => {
  const f = await fixture(t);
  await git(f.source, "checkout", "-qb", "development");
  await put(f.source, "packages/ui/view.ts", "committed\n");
  await git(f.source, "commit", "-qam", "development");
  await exportPatches({ configPath: f.configPath });
  assert.equal((await manifest(f.queue)).base.commit, f.base);
  assert.equal(await git(f.source, "rev-parse", "refs/heads/main"), f.base);
});

test("backs up the complete old queue including untracked notes", async (t) => {
  const f = await fixture(t);
  await put(f.queue, "series", "old.patch\n");
  await put(f.queue, "old.patch", "old patch\n");
  await put(f.queue, "notes.txt", "user note\n");
  await put(f.source, "packages/ui/view.ts", "new\n");
  const result = await exportPatches({ configPath: f.configPath });
  assert.equal(await readFile(join(result.backup, "notes.txt"), "utf8"), "user note\n");
  assert.equal(await readFile(join(result.backup, "old.patch"), "utf8"), "old patch\n");
  assert.match(await readFile(join(f.queue, "series"), "utf8"), /packages-ui/);
});

test("check mode does not publish or change the real index", async (t) => {
  const f = await fixture(t);
  await put(f.queue, "series", "old.patch\n");
  await put(f.source, "packages/ui/view.ts", "new\n");
  const before = await indexBytes(f.source);
  await exportPatches({ configPath: f.configPath, check: true });
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "old.patch\n");
  assert.deepEqual(await indexBytes(f.source), before);
});

test("refuses a moved base branch without touching the existing output", async (t) => {
  const f = await fixture(t);
  await put(f.queue, "series", "keep\n");
  await put(f.source, "README.md", "advance\n");
  await git(f.source, "commit", "-qam", "advance main");
  await assert.rejects(exportPatches({ configPath: f.configPath }), /基准引用|base ref/i);
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
});

test("refuses unrelated HEAD and unmerged index", async (t) => {
  const f = await fixture(t);
  await git(f.source, "checkout", "--orphan", "unrelated");
  await git(f.source, "commit", "-qm", "unrelated");
  await assert.rejects(exportPatches({ configPath: f.configPath }), /HEAD|基准/);
  await git(f.source, "checkout", "main");
  const blob = await git(f.source, "rev-parse", "HEAD:README.md");
  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    const child = spawn("git", ["update-index", "--index-info"], { cwd: f.source });
    child.stdin.end(
      `0 ${"0".repeat(40)}\tREADME.md\n100644 ${blob} 1\tREADME.md\n100644 ${blob} 2\tREADME.md\n100644 ${blob} 3\tREADME.md\n`,
    );
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`git index ${code}`))));
  });
  await assert.rejects(exportPatches({ configPath: f.configPath }), /冲突|unmerged/i);
});

test("refuses credential-like files instead of exporting them", async (t) => {
  const f = await fixture(t);
  await put(f.source, ".env", "SECRET=not-for-patches\n");
  await assert.rejects(exportPatches({ configPath: f.configPath }), /凭据|credential/i);
});

test("detects edits during verification before publishing", async (t) => {
  const f = await fixture(t);
  await put(f.queue, "series", "keep\n");
  await put(f.source, "packages/ui/view.ts", "first\n");
  await assert.rejects(
    exportPatches({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "verified") await put(f.source, "packages/ui/view.ts", "later edit\n");
      },
    }),
    /变化|changed/i,
  );
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
  assert.equal(await readFile(join(f.source, "packages/ui/view.ts"), "utf8"), "later edit\n");
});

test("does not steal an existing exporter lock", async (t) => {
  const f = await fixture(t);
  await put(f.root, ".patch-export.lock", "another process\n");
  await assert.rejects(exportPatches({ configPath: f.configPath }), /锁|lock/i);
  assert.equal(await readFile(join(f.root, ".patch-export.lock"), "utf8"), "another process\n");
});

test("verifier rejects checksum changes and malformed series before applying", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await exportPatches({ configPath: f.configPath });
  const value = await manifest(f.queue);
  await writeFile(join(f.queue, "series"), "../escape.patch\n");
  await assert.rejects(verifyQueue({ source: f.source, queue: f.queue }), /series|清单|名称/);
  await writeFile(join(f.queue, "series"), value.patches.map((p) => p.file).join("\n") + "\n");
  await writeFile(join(f.queue, value.patches[0].file), "tampered\n");
  await assert.rejects(verifyQueue({ source: f.source, queue: f.queue }), /摘要|SHA|checksum/i);
});

test("bad first patch stops replay and leaves the development worktree untouched", async (t) => {
  const f = await fixture(t);
  await put(f.source, "apps/cli/tool.ts", "cli\n");
  await put(f.source, "packages/ui/view.ts", "ui\n");
  await exportPatches({ configPath: f.configPath });
  await tamper(f.queue, () => Buffer.from("not a patch\n"));
  const before = await indexBytes(f.source);
  const applied = [];
  await assert.rejects(
    verifyQueue({
      source: f.source,
      queue: f.queue,
      report: async (phase, detail) => {
        if (phase === "applied") applied.push(detail);
      },
    }),
    /0001|补丁/,
  );
  assert.deepEqual(applied, []);
  assert.deepEqual(await indexBytes(f.source), before);
  assert.equal(await readFile(join(f.source, "packages/ui/view.ts"), "utf8"), "ui\n");
});

test("dirty preparation never reapplies patches or changes staging", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await exportPatches({ configPath: f.configPath });
  const before = await indexBytes(f.source);
  assert.equal((await prepareSource({ configPath: f.configPath })).action, "development");
  assert.deepEqual(await indexBytes(f.source), before);
});

test("clean baseline preparation applies once; later launches preserve the queue", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await exportPatches({ configPath: f.configPath });
  // 此处只恢复测试夹具自身创建的变更，生产工具不得执行 restore。
  await put(f.source, "packages/ui/view.ts", "base\n");
  assert.equal((await prepareSource({ configPath: f.configPath })).action, "applied");
  assert.equal(await readFile(join(f.source, "packages/ui/view.ts"), "utf8"), "new\n");
  assert.equal((await prepareSource({ configPath: f.configPath })).action, "development");
});

test("preserves index-only symlink identity on non-symlink filesystems", async (t) => {
  const f = await fixture(t);
  await git(f.source, "config", "core.symlinks", "false");
  await put(f.source, "packages/ui/link", "view.ts");
  const blob = await git(f.source, "hash-object", "-w", "packages/ui/link");
  await git(f.source, "update-index", "--add", "--cacheinfo", "120000", blob, "packages/ui/link");
  const before = await indexBytes(f.source);
  await exportPatches({ configPath: f.configPath });
  assert.match(
    await git(f.source, "ls-tree", (await manifest(f.queue)).tree, "packages/ui/link"),
    /^120000 /,
  );
  assert.deepEqual(await indexBytes(f.source), before);
});

test("refuses staged embedded submodule changes", async (t) => {
  const f = await fixture(t);
  const nested = join(f.source, "vendor/nested");
  await mkdir(nested, { recursive: true });
  await git(nested, "init", "-b", "main");
  await git(nested, "config", "user.name", "Patch Test");
  await git(nested, "config", "user.email", "patch@example.invalid");
  await put(nested, "nested.txt", "nested\n");
  await git(nested, "add", ".");
  await git(nested, "commit", "-qm", "nested");
  await git(f.source, "add", "vendor/nested");
  const before = await indexBytes(f.source);
  await assert.rejects(exportPatches({ configPath: f.configPath }), /gitlink/);
  assert.deepEqual(await indexBytes(f.source), before);
});

test("failed candidate replay never replaces the old queue", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await put(f.queue, "series", "keep\n");
  const { readdir } = await import("node:fs/promises");
  await assert.rejects(
    exportPatches({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "snapshot") {
          const candidate = (await readdir(f.root)).find((name) =>
            name.startsWith(".patch-export-"),
          );
          await tamper(join(f.root, candidate), () => Buffer.from("bad patch\n"));
        }
      },
    }),
    /重放失败/,
  );
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
});

test("later edits to the old queue are not overwritten", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await put(f.queue, "series", "keep\n");
  await assert.rejects(
    exportPatches({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "verified") await put(f.queue, "note.txt", "later note\n");
      },
    }),
    /旧补丁目录发生变化/,
  );
  assert.equal(await readFile(join(f.queue, "note.txt"), "utf8"), "later note\n");
});

test("later staging changes are preserved and prevent publishing", async (t) => {
  const f = await fixture(t);
  await put(f.source, "packages/ui/view.ts", "new\n");
  await put(f.queue, "series", "keep\n");
  await assert.rejects(
    exportPatches({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "verified") {
          await put(f.source, "README.md", "later staged\n");
          await git(f.source, "add", "README.md");
        }
      },
    }),
    /真实 index 发生变化/,
  );
  assert.equal(await git(f.source, "show", ":README.md"), "later staged");
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "keep\n");
});

test("empty snapshots produce a valid empty queue", async (t) => {
  const f = await fixture(t);
  const before = await indexBytes(f.source);
  const result = await exportPatches({ configPath: f.configPath });
  assert.equal(result.patches, 0);
  assert.equal(await readFile(join(f.queue, "series"), "utf8"), "");
  assert.deepEqual(await indexBytes(f.source), before);
});

test("committed development preparation never overlays the published queue", async (t) => {
  const f = await fixture(t);
  await git(f.source, "checkout", "-qb", "development");
  await put(f.source, "packages/ui/view.ts", "development\n");
  await git(f.source, "commit", "-qam", "development");
  await exportPatches({ configPath: f.configPath });
  assert.equal((await prepareSource({ configPath: f.configPath })).action, "development");
  assert.equal(await git(f.source, "status", "--porcelain=v1"), "");
});

test("preparation stops on concurrent edits without applying later patches or discarding edits", async (t) => {
  const f = await fixture(t);
  for (const path of ["apps/cli/tool.ts", "packages/shared/data.txt", "packages/ui/view.ts"])
    await put(f.source, path, "new\n");
  await exportPatches({ configPath: f.configPath });
  for (const path of ["apps/cli/tool.ts", "packages/shared/data.txt", "packages/ui/view.ts"])
    await put(f.source, path, "base\n");
  let installed = 0;
  await assert.rejects(
    prepareSource({
      configPath: f.configPath,
      report: async (phase) => {
        if (phase === "installed" && ++installed === 1)
          await put(f.source, "packages/shared/data.txt", "concurrent user edit\n");
      },
    }),
    /0002.*应用失败/,
  );
  assert.equal(installed, 1);
  assert.equal(await readFile(join(f.source, "apps/cli/tool.ts"), "utf8"), "new\n");
  assert.equal(
    await readFile(join(f.source, "packages/shared/data.txt"), "utf8"),
    "concurrent user edit\n",
  );
  assert.equal(await readFile(join(f.source, "packages/ui/view.ts"), "utf8"), "base\n");
});
