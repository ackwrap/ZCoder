import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prepareSource } from "./lib/patch-workflow.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--source" || args[1].startsWith("--")))
    throw new Error("用法：node scripts/prepare-patches.mjs [--source <源码目录>]");
  const result = await prepareSource({
    configPath: fileURLToPath(new URL("../patches.config.json", import.meta.url)),
    source: args.length ? resolve(args[1]) : undefined,
    report: async (phase, detail) => {
      if (phase === "development" || phase === "installed") console.log(`[patches] ${detail}`);
    },
  });
  if (result.action === "applied") console.log(`[patches] 已应用完整目录队列：${result.tree}`);
} catch (error) {
  console.error(`[patches] ${error.message}`);
  process.exitCode = 1;
}
