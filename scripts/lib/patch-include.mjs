import { isAbsolute, win32 } from "node:path";

export function validateIncludes(include, credentialPath) {
  if (include === undefined) return;
  if (!Array.isArray(include))
    throw new Error("include 必须是精确相对文件路径数组");
  for (const path of include) {
    if (
      typeof path !== "string" ||
      !path ||
      isAbsolute(path) ||
      win32.isAbsolute(path) ||
      /^[a-z]:/i.test(path) ||
      /[\\\0*?\[\]{}]/.test(path) ||
      path
        .split("/")
        .some(
          (part) => !part || part === "." || part === ".." || part === ".git",
        )
    )
      throw new Error("include 必须是安全的精确相对文件路径");
    if (credentialPath(path))
      throw new Error(`include 不允许疑似凭据路径：${path}`);
  }
}

export function includedExclusion(excluded, include = []) {
  const exact = new Set(include);
  return (path) =>
    path
      .split("/")
      .some((part) => part === ".git" || part === "node_modules") ||
    (!exact.has(path) && excluded(path));
}
