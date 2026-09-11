// @ts-check
/** Steam の Deadlock インストール先を探す・steam.inf を読む共通ヘルパー。
 * extract-local.mjs と tools/automation/auto-update.mjs の両方から使う
 * (自動実行側は decompile 前にバージョンだけ軽く確認したいため)。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} [override] */
export function findSteamInstall(override) {
  if (override) return override;
  const steamRoots = ["C:\\Program Files (x86)\\Steam"];
  const libPaths = new Set(steamRoots);
  for (const root of steamRoots) {
    const vdf = join(root, "steamapps", "libraryfolders.vdf");
    if (!existsSync(vdf)) continue;
    const text = readFileSync(vdf, "utf8");
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      libPaths.add(m[1].replace(/\\\\/g, "\\"));
    }
  }
  for (const lib of libPaths) {
    const candidate = join(lib, "steamapps", "common", "Deadlock");
    if (existsSync(join(candidate, "game", "citadel", "steam.inf"))) return candidate;
  }
  throw new Error(
    "Deadlock のインストール先が見つかりません。--install <パス> で steamapps\\common\\Deadlock を指定してください。",
  );
}

/** @param {string} installPath */
export function readClientVersion(installPath) {
  const infPath = join(installPath, "game", "citadel", "steam.inf");
  const text = readFileSync(infPath, "utf8");
  const m = text.match(/^ClientVersion=(\S+)/m);
  if (!m) throw new Error(`steam.inf に ClientVersion が見つかりません: ${infPath}`);
  return { clientVersion: m[1], infPath, infText: text };
}
