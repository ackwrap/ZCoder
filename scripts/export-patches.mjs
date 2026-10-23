import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportPatches } from "./lib/patch-workflow.mjs";

const options = { configPath: fileURLToPath(new URL("../patches.config.json", import.meta.url)) };
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--check") options.check = true;
    else if (["--config", "--source"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--"))
      options[arg === "--config" ? "configPath" : "source"] = resolve(args[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法：node scripts/export-patches.mjs [--check] [--source <源码目录>] [--config <配置文件>]\n默认直接导出 ZCode/，隔离验证成功后备份并替换 patches/；不改变源码、真实 index、分支或 gitlink。",
      );
      process.exit(0);
    } else throw new Error(`未知或缺值参数：${arg}`);
  }
  options.report = async (phase, detail) => {
    if (phase === "snapshot") console.log(`[patches] 快照 ${detail.tree}，${detail.files} 个文件`);
    if (phase === "applied") console.log(`[patches] 重放通过：${detail}`);
  };
  const result = await exportPatches(options);
  console.log(
    `[patches] ${result.check ? "检查通过，未替换队列" : "导出完成"}：${result.patches} 个目录补丁 / ${result.files} 个文件`,
  );
  if (result.backup) console.log(`[patches] 旧队列备份：${result.backup}`);
  if (result.excluded.length)
    console.log(`[patches] 保留并排除 ${result.excluded.length} 项产物/缓存改动，详见 manifest`);
  console.log("[patches] Git 树重放验证不代替源码功能测试。");
} catch (error) {
  console.error(`[patches] ${error.message}`);
  process.exitCode = 1;
}
