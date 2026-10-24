import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(new URL("../ZCode/package.json", import.meta.url));
const { parse } = require("yaml");
const workflow = parse(
  await readFile(new URL("../.github/workflows/desktop-build.yml", import.meta.url), "utf8"),
);

const targets = {
  windows: { os: "win", arch: "x64", label: "windows-x64", runner: "windows-latest", shell: "bash" },
  linux: { os: "linux", arch: "x64", label: "linux-x64", runner: "ubuntu-latest", shell: "bash" },
};

function selectMatrix(platform) {
  const expression = workflow.jobs.package.strategy.matrix;
  assert.equal(typeof expression, "string");
  const match = expression.match(
    /^\$\{\{ fromJSON\(inputs\.platform == 'windows' && '([^']+)' \|\| inputs\.platform == 'linux' && '([^']+)' \|\| '([^']+)'\) \}\}$/,
  );
  assert.ok(match, "matrix must select only a fixed, platform-specific JSON value");
  return JSON.parse(match[platform === "windows" ? 1 : platform === "linux" ? 2 : 3]);
}

test("dispatch exposes optional platform selection without changing version input", () => {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.platform, {
    description: "Platform to build",
    required: false,
    type: "choice",
    default: "all",
    options: ["all", "windows", "linux"],
  });
  assert.equal(workflow.on.workflow_dispatch.inputs.version.type, "string");
  assert.equal(workflow.on.workflow_dispatch.inputs.version.required, false);
});

for (const [platform, expected] of [
  ["windows", [targets.windows]],
  ["linux", [targets.linux]],
  ["all", [targets.windows, targets.linux]],
  [undefined, [targets.windows, targets.linux]],
]) {
  test(`matrix selects packaging jobs for ${platform ?? "omitted platform"}`, () => {
    assert.deepEqual(selectMatrix(platform), { include: expected });
  });
}

test("build retains read-only permissions, pinned checkout and Windows artifact", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const steps = workflow.jobs.package.steps;
  assert.equal(steps.find((step) => step.uses === "actions/checkout@v4").with.submodules, "recursive");
  const upload = steps.find((step) => step.name === "Upload Windows installer");
  assert.equal(upload.if, "matrix.os == 'win'");
  assert.equal(upload.with.name, "windows-x64-nsis");
  assert.equal(upload.with.path, "artifacts/*.exe");
  assert.equal(upload.with["retention-days"], 30);
  assert.match(steps.find((step) => step.name === "Build and package").run, /--os \$\{\{ matrix\.os \}\}/);
});
