import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { includedExclusion, validateIncludes } from "./patch-include.mjs";

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PATCH_NAME = /^\d{4}-[a-z0-9-]+\.patch$/;
const MAX_GIT_OUTPUT = 128 * 1024 * 1024;
const PATCH_CONTENTS = Symbol("validatedPatchContents");
const noop = async () => {};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const text = (value) => value.toString("utf8").trim();
const paths = (value) => value.toString("utf8").split("\0").filter(Boolean);

async function git(source, args, { env = {}, input, allow = [] } = {}) {
  return new Promise((done, fail) => {
    const childEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"])
      delete childEnv[name];
    Object.assign(childEnv, env);
    const child = spawn("git", ["--literal-pathspecs", "-C", source, ...args], {
      cwd: source,
      env: childEnv,
      windowsHide: true,
    });
    const output = [],
      errors = [];
    let size = 0;
    const timeout = setTimeout(() => {
      child.kill();
      fail(new Error(`Git 操作超时：${args[0]}`));
    }, 120000);
    child.stdout.on("data", (data) => {
      size += data.length;
      if (size > MAX_GIT_OUTPUT) {
        child.kill();
        fail(new Error("Git 输出超过安全上限"));
      } else output.push(data);
    });
    child.stderr.on("data", (data) => errors.push(data));
    child.on("error", (error) => {
      clearTimeout(timeout);
      fail(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 || allow.includes(code)) done(Buffer.concat(output));
      else fail(new Error(`git ${args[0]} 失败：${Buffer.concat(errors).toString("utf8").trim()}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function assertRelative(path, name) {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => part === ".." || part === ".git")
  ) {
    throw new Error(`${name} 必须是安全的相对路径`);
  }
}

async function safeParents(root, target) {
  const rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel))
    throw new Error("输出必须位于配置目录内");
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    if (info?.isSymbolicLink()) throw new Error(`路径不能经过符号链接：${current}`);
  }
}

async function settings(configPath, sourceOverride) {
  const configFile = resolve(configPath);
  const root = dirname(configFile);
  const raw = await readFile(configFile);
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error("无法解析 patches 配置 JSON");
  }
  if (
    config.schemaVersion !== 1 ||
    !config.base ||
    !OID.test(config.base.commit) ||
    typeof config.base.ref !== "string" ||
    !/^refs\/(heads|remotes)\//.test(config.base.ref)
  ) {
    throw new Error("配置必须包含 schemaVersion=1、基准分支完整引用和固定 commit SHA");
  }
  assertRelative(config.source, "source");
  assertRelative(config.output, "output");
  if (
    !Array.isArray(config.exclude) ||
    config.exclude.some(
      (pattern) =>
        typeof pattern !== "string" ||
        !pattern ||
        pattern.includes("\\") ||
        pattern.includes("\0") ||
        pattern.split("/").includes(".."),
    )
  )
    throw new Error("exclude 必须是相对路径 glob 数组");
  validateIncludes(config.include, credentialPath);
  const source = resolve(root, sourceOverride ?? config.source);
  const output = resolve(root, config.output);
  const fromSource = relative(source, output);
  if (
    output === root ||
    output === source ||
    (!isAbsolute(fromSource) && fromSource !== ".." && !fromSource.startsWith(`..${sep}`))
  )
    throw new Error("输出不能位于源码目录或覆盖仓库根目录");
  await safeParents(root, output);
  return { root, configFile, configHash: hash(raw), config, source, output };
}

async function checkBase({ source, config }) {
  const top = text(await git(source, ["rev-parse", "--show-toplevel"]));
  const normalize = (path) => {
    const normalized = resolve(path).replaceAll("\\", "/");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  if (normalize(top) !== normalize(source)) throw new Error("source 必须是源码 Git 仓库根目录");
  await git(source, ["check-ref-format", config.base.ref]);
  const resolved = text(
    await git(source, ["rev-parse", "--verify", "--end-of-options", `${config.base.ref}^{commit}`]),
  );
  if (resolved !== config.base.commit)
    throw new Error(`基准引用已变化：${config.base.ref}，请显式确认并更新固定 SHA`);
  const head = text(await git(source, ["rev-parse", "HEAD"]));
  try {
    await git(source, ["merge-base", "--is-ancestor", config.base.commit, head]);
  } catch {
    throw new Error("HEAD 不包含配置的固定基准，停止处理");
  }
  if ((await git(source, ["ls-files", "-u", "-z"])).length)
    throw new Error("index 存在未解决冲突，停止处理");
  return head;
}

async function locked(root, run) {
  const lockPath = join(root, ".patch-export.lock");
  const token = randomUUID();
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(`已有补丁操作锁：${lockPath}；请确认原操作结束后再处理`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ token, pid: process.pid }));
    return await run();
  } finally {
    await lock.close();
    const value = await readFile(lockPath, "utf8").catch(() => "");
    if (value.includes(token)) await unlink(lockPath);
  }
}

function excludedBy(patterns) {
  const expressions = patterns.map((pattern) => {
    const parts = pattern.split("/");
    const body = parts
      .map((part, index) => {
        if (part === "**") return index === parts.length - 1 ? ".*" : "(?:[^/]+/)*";
        return (
          part
            .split("*")
            .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("[^/]*") + (index < parts.length - 1 ? "/" : "")
        );
      })
      .join("");
    return new RegExp(`^${body}$`, "i");
  });
  return (path) =>
    path.split("/").some((part) => part === ".git" || part === "node_modules") ||
    expressions.some((expression) => expression.test(path));
}

function credentialPath(path) {
  const name = path.split("/").at(-1).toLowerCase();
  return (
    ((name === ".env" || name.startsWith(".env.")) && !/\.(example|sample|template)$/.test(name)) ||
    /\.(pem|key|p12|pfx)$/.test(name) ||
    /^(credentials|secrets)\.json$/.test(name) ||
    /^(id_rsa|id_ed25519)$/.test(name)
  );
}

async function candidates(options) {
  const { source, config } = options;
  const all = [
    ...new Set([
      ...paths(
        await git(source, [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--name-only",
          "-z",
          config.base.commit,
          "--",
        ]),
      ),
      ...paths(await git(source, ["ls-files", "--others", "--exclude-standard", "-z"])),
    ]),
  ].sort(compare);
  const excluded = includedExclusion(excludedBy(config.exclude), config.include);
  const files = all.filter((path) => !excluded(path));
  for (const path of files) {
    assertRelative(path, "源码文件");
    if (credentialPath(path)) throw new Error(`疑似凭据路径，拒绝导出：${path}`);
  }
  return { files, excluded: all.filter(excluded) };
}

async function fingerprints(source, files) {
  return Promise.all(
    files.map(async (path) => {
      await safeParents(source, dirname(join(source, path)));
      const info = await lstat(join(source, path)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      if (!info) return [path, "deleted"];
      if (info.isSymbolicLink()) return [path, "link", await readlink(join(source, path))];
      if (info.isDirectory()) return [path, "directory"];
      return [path, info.mode, hash(await readFile(join(source, path)))];
    }),
  );
}

async function indexHash(source) {
  const path = text(
    await git(source, ["rev-parse", "--path-format=absolute", "--git-path", "index"]),
  );
  return hash(
    await readFile(path).catch((error) => {
      if (error.code === "ENOENT") return Buffer.alloc(0);
      throw error;
    }),
  );
}

async function directoryHash(path) {
  const info = await lstat(path).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (!info) return null;
  if (info.isSymbolicLink() || !info.isDirectory())
    throw new Error(`补丁输出必须是普通目录：${path}`);
  async function walk(directory) {
    const result = [];
    for (const entry of (await readdir(directory)).sort(compare)) {
      const full = join(directory, entry),
        stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new Error(`补丁目录含符号链接：${full}`);
      result.push([entry, stat.isDirectory() ? await walk(full) : hash(await readFile(full))]);
    }
    return result;
  }
  return hash(JSON.stringify(await walk(path)));
}

async function temporary() {
  const base =
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Temp", "opencode")
      : join(tmpdir(), "opencode");
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, "zcode-directory-patches-"));
}

function entries(buffer) {
  return new Map(
    paths(buffer).map((line) => {
      const tab = line.indexOf("\t"),
        [mode, oid, stage] = line.slice(0, tab).split(" ");
      return [line.slice(tab + 1), { mode, oid, stage }];
    }),
  );
}

async function capture(options, files, temp) {
  const { source, config } = options;
  const env = { GIT_INDEX_FILE: join(temp, "snapshot.index") };
  await git(source, ["read-tree", config.base.commit], { env });
  if (files.length)
    await git(source, ["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], {
      env,
      input: Buffer.from(files.join("\0") + "\0"),
    });
  const actual = entries(await git(source, ["ls-files", "--stage", "-z"]));
  const snapshot = entries(await git(source, ["ls-files", "--stage", "-z"], { env }));
  const filemode = text(
    await git(source, ["config", "--type=bool", "--get", "core.filemode"], { allow: [1] }),
  );
  const symlinks = text(
    await git(source, ["config", "--type=bool", "--get", "core.symlinks"], { allow: [1] }),
  );
  const modes = [];
  for (const path of files) {
    const real = actual.get(path),
      captured = snapshot.get(path);
    if (!real || !captured) continue;
    // Windows / core.filemode=false 的可执行位只存在于用户 index，不能从文件系统猜成 644。
    if (
      (filemode === "false" && ["100644", "100755"].includes(real.mode)) ||
      (symlinks === "false" && real.mode === "120000")
    ) {
      modes.push(`${real.mode} ${captured.oid}\t${path}\0`);
    }
  }
  if (modes.length)
    await git(source, ["update-index", "-z", "--index-info"], {
      env,
      input: Buffer.from(modes.join("")),
    });
  const tree = text(await git(source, ["write-tree"], { env }));
  const changed = paths(
    await git(source, ["diff", "--no-renames", "--name-only", "-z", config.base.commit, tree]),
  );
  const before = new Map(
    paths(await git(source, ["ls-tree", "-r", "-z", config.base.commit])).map((line) => {
      const tab = line.indexOf("\t");
      return [line.slice(tab + 1), { mode: line.slice(0, tab).split(" ")[0] }];
    }),
  );
  for (const path of changed) {
    if (before.get(path)?.mode === "160000" || snapshot.get(path)?.mode === "160000")
      throw new Error(`不能自动导出嵌套 submodule gitlink：${path}`);
  }
  return { tree, changed };
}

function group(path) {
  const parts = path.split("/");
  return parts.length === 1
    ? "."
    : ["packages", "apps"].includes(parts[0]) && parts.length > 2
      ? parts.slice(0, 2).join("/")
      : parts[0];
}

async function generate(options, snapshot, excluded, candidate) {
  const groups = new Map();
  for (const path of snapshot.changed.sort(compare)) {
    const key = group(path);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(path);
  }
  const patches = [];
  const directories = [...groups.keys()].sort((a, b) =>
    a === "." ? -1 : b === "." ? 1 : compare(a, b),
  );
  for (const [index, directory] of directories.entries()) {
    const slug =
      directory === "."
        ? "root"
        : directory
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase() || "directory";
    const file = `${String(index + 1).padStart(4, "0")}-${slug}.patch`;
    const scope = directory === "." ? groups.get(directory) : [directory];
    const content = await git(options.source, [
      "diff",
      "--binary",
      "--full-index",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      options.config.base.commit,
      snapshot.tree,
      "--",
      ...scope,
    ]);
    if (!content.length) throw new Error(`空补丁组：${directory}`);
    await writeFile(join(candidate, file), content);
    patches.push({ file, directory, sha256: hash(content), paths: groups.get(directory) });
  }
  const manifest = {
    schemaVersion: 1,
    generator: "zcode-plus-directory-patches",
    base: options.config.base,
    sourceHead: options.head,
    tree: snapshot.tree,
    excludedChangedPaths: excluded,
    patches,
  };
  await writeFile(
    join(candidate, "series"),
    patches.map((patch) => patch.file).join("\n") + (patches.length ? "\n" : ""),
  );
  await writeFile(join(candidate, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

async function loadQueue(queue) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(queue, "manifest.json"), "utf8"));
  } catch {
    throw new Error("无法读取/解析 patches/manifest.json，请先导出目录队列");
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.generator !== "zcode-plus-directory-patches" ||
    !OID.test(manifest.base?.commit) ||
    !OID.test(manifest.tree) ||
    !Array.isArray(manifest.patches)
  )
    throw new Error("无效的补丁 manifest");
  const series = (await readFile(join(queue, "series"), "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const expected = manifest.patches.map((patch) => patch.file);
  if (
    series.some((name) => !PATCH_NAME.test(name)) ||
    new Set(series).size !== series.length ||
    JSON.stringify(series) !== JSON.stringify(expected)
  )
    throw new Error("series 顺序/名称与 manifest 清单不一致");
  const contents = new Map();
  for (const patch of manifest.patches) {
    if (
      typeof patch.directory !== "string" ||
      !Array.isArray(patch.paths) ||
      patch.paths.some((path) => typeof path !== "string" || group(path) !== patch.directory)
    )
      throw new Error("补丁目录分组无效");
    for (const path of patch.paths) assertRelative(path, "补丁文件");
    const full = join(queue, patch.file),
      info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error(`补丁不能是符号链接：${patch.file}`);
    const bytes = await readFile(full);
    if (hash(bytes) !== patch.sha256) throw new Error(`补丁 SHA-256 摘要不匹配：${patch.file}`);
    contents.set(patch.file, bytes);
  }
  manifest[PATCH_CONTENTS] = contents;
  return manifest;
}

export async function verifyQueue({
  source,
  queue,
  baseCommit,
  baseRef,
  expectedTree,
  report = noop,
}) {
  const manifest = await loadQueue(queue);
  if (baseCommit && manifest.base.commit !== baseCommit) throw new Error("补丁基准与配置不一致");
  if (baseRef && manifest.base.ref !== baseRef) throw new Error("补丁基准引用与配置不一致");
  if (expectedTree && manifest.tree !== expectedTree)
    throw new Error("补丁目标 tree 与源码快照不一致");
  const temp = await temporary(),
    worktree = join(temp, "verify");
  let created = false;
  try {
    const hooks = join(temp, "empty-hooks");
    await mkdir(hooks);
    await git(
      source,
      [
        "-c",
        `core.hooksPath=${hooks}`,
        "worktree",
        "add",
        "--detach",
        worktree,
        manifest.base.commit,
      ],
      { env: { GIT_LFS_SKIP_SMUDGE: "1" } },
    );
    created = true;
    for (const patch of manifest.patches) {
      const input = manifest[PATCH_CONTENTS].get(patch.file);
      try {
        await git(worktree, ["apply", "--check", "--index", "-"], { input });
        await git(worktree, ["apply", "--index", "-"], { input });
      } catch (error) {
        throw new Error(`补丁 ${patch.file} 重放失败：${error.message}`);
      }
      await report("applied", patch.file);
    }
    const tree = text(await git(worktree, ["write-tree"]));
    if (tree !== manifest.tree)
      throw new Error(`重放 tree 不一致：实际 ${tree}，预期 ${manifest.tree}`);
    await git(source, ["worktree", "remove", "--force", worktree]);
    created = false;
    await rm(temp, { recursive: true });
    return { tree, patches: manifest.patches.length };
  } catch (error) {
    throw new Error(`${error.message}\n保留验证目录：${created ? worktree : temp}`);
  }
}

export async function exportPatches({
  configPath,
  source: sourceOverride,
  check = false,
  report = noop,
}) {
  const options = await settings(configPath, sourceOverride);
  return locked(options.root, async () => {
    options.head = await checkBase(options);
    const initialIndex = await indexHash(options.source);
    const initialOutput = await directoryHash(options.output);
    const selection = await candidates(options);
    const before = await fingerprints(options.source, selection.files);
    const temp = await temporary();
    const candidate = await mkdtemp(join(options.root, ".patch-export-"));
    try {
      const snapshot = await capture(options, selection.files, temp);
      const manifest = await generate(options, snapshot, selection.excluded, candidate);
      const candidateHash = await directoryHash(candidate);
      await report("snapshot", { tree: snapshot.tree, files: snapshot.changed.length });
      await verifyQueue({
        source: options.source,
        queue: candidate,
        baseCommit: options.config.base.commit,
        baseRef: options.config.base.ref,
        expectedTree: snapshot.tree,
        report,
      });
      await report("verified", { tree: snapshot.tree });
      if (
        (await checkBase(options)) !== options.head ||
        (await indexHash(options.source)) !== initialIndex ||
        JSON.stringify((await candidates(options)).files) !== JSON.stringify(selection.files) ||
        JSON.stringify(await fingerprints(options.source, selection.files)) !==
          JSON.stringify(before)
      )
        throw new Error("导出期间源码/HEAD/真实 index 发生变化，未发布候选补丁");
      if (
        hash(await readFile(options.configFile)) !== options.configHash ||
        (await directoryHash(options.output)) !== initialOutput
      )
        throw new Error("导出期间配置/旧补丁目录发生变化，未覆盖后来编辑");
      if ((await directoryHash(candidate)) !== candidateHash)
        throw new Error("验证期间候选队列发生变化，未发布未经验证的内容");
      let backup = null;
      if (!check) {
        await safeParents(options.root, options.output);
        await mkdir(dirname(options.output), { recursive: true });
        if (initialOutput !== null) {
          const backups = join(options.root, ".patch-backups");
          await safeParents(options.root, backups);
          await mkdir(backups, { recursive: true });
          const container = join(
            backups,
            `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`,
          );
          await mkdir(container);
          backup = join(container, "patches");
          await rename(options.output, backup);
        }
        try {
          await rename(candidate, options.output);
        } catch (error) {
          if (backup) {
            try {
              await rename(backup, options.output);
            } catch (restoreError) {
              throw new Error(
                `发布失败且无法自动恢复：${error.message}；${restoreError.message}；旧队列仍保存在 ${backup}`,
              );
            }
          }
          throw error;
        }
      } else await rm(candidate, { recursive: true });
      await rm(temp, { recursive: true });
      return {
        tree: snapshot.tree,
        patches: manifest.patches.length,
        files: snapshot.changed.length,
        excluded: selection.excluded,
        backup,
        output: check ? null : options.output,
        check,
      };
    } catch (error) {
      throw new Error(`${error.message}\n候选目录：${candidate}\n快照目录：${temp}`);
    }
  });
}

export async function prepareSource({ configPath, source: sourceOverride, report = noop }) {
  const options = await settings(configPath, sourceOverride);
  return locked(options.root, async () => {
    const head = await checkBase(options);
    const manifest = await loadQueue(options.output);
    const queueHash = await directoryHash(options.output);
    if (
      manifest.base.commit !== options.config.base.commit ||
      manifest.base.ref !== options.config.base.ref
    )
      throw new Error("补丁基准与配置不一致");
    const status = await git(options.source, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    if (head !== options.config.base.commit || status.length) {
      await report("development", "保留当前开发工作区，不应用或撤回补丁");
      return { action: "development" };
    }
    await verifyQueue({
      source: options.source,
      queue: options.output,
      baseCommit: options.config.base.commit,
      baseRef: options.config.base.ref,
      report,
    });
    if (
      (await directoryHash(options.output)) !== queueHash ||
      hash(await readFile(options.configFile)) !== options.configHash
    )
      throw new Error("准备期间队列/配置发生变化，未应用补丁");
    if (
      text(await git(options.source, ["rev-parse", "HEAD"])) !== head ||
      (await git(options.source, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]))
        .length
    )
      throw new Error("准备期间源码发生变化，未应用补丁");
    // 内容已恢复为基准但 stat cache 尚未更新时，apply --index 仍会拒绝；仅在确认完全干净后刷新。
    await git(options.source, ["update-index", "--refresh"]);
    for (const patch of manifest.patches) {
      const input = manifest[PATCH_CONTENTS].get(patch.file);
      try {
        await git(options.source, ["apply", "--check", "--index", "-"], { input });
        await git(options.source, ["apply", "--index", "-"], { input });
      } catch (error) {
        throw new Error(`补丁 ${patch.file} 应用失败，已停止并保留现场：${error.message}`);
      }
      await report("installed", patch.file);
    }
    const tree = text(await git(options.source, ["write-tree"]));
    if (tree !== manifest.tree)
      throw new Error("应用后的 index tree 与 manifest 不一致，请保留现场检查");
    return { action: "applied", tree };
  });
}
