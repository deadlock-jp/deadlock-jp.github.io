// @ts-check
/**
 * ローカルの Deadlock インストール(このPC)から、パーサーが読める形の
 * 「ローカル抽出ルート」を作る。data/snapshots/ への書き込みはしない
 * (それは src/parsers/main.ts --local の仕事)。ここは vdata の decompile と
 * ファイル集めだけを担当する。
 *
 * 出力先: <work>\local-<ClientVersion>\
 *   steam.inf
 *   scripts\...              (pak01_dir.vpk の scripts/ を decompile したもの)
 *   localization\...         (ゲーム本体の resource/localization をそのままコピー)
 *
 * 使い方:
 *   node --experimental-strip-types tools/extract/extract-local.mjs
 *   node --experimental-strip-types tools/extract/extract-local.mjs --install "D:\SteamLibrary\steamapps\common\Deadlock" --work "C:\Users\nogud\Downloads\deadlock-extract"
 *
 * 標準出力の最後の1行に、生成したローカルルートの絶対パスだけを出す
 * (`main.ts --local <path>` にそのまま渡せるように)。進捗・ログは stderr。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { findSteamInstall as findSteamInstallBase, readClientVersion } from "./steam.mjs";

const args = process.argv.slice(2);
const opt = (name, def = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

const log = (...a) => console.error(...a);

const WORK = resolve(opt("work", "C:\\Users\\nogud\\Downloads\\deadlock-extract"));
const CLI_URL =
  "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/20.0/cli-windows-x64.zip";

const findSteamInstall = () => findSteamInstallBase(opt("install"));

function ensureCli() {
  const toolDir = join(WORK, "tool");
  const cli = join(toolDir, "Source2Viewer-CLI.exe");
  if (existsSync(cli)) return cli;
  log("[extract-local] Source2Viewer-CLI が無いのでダウンロードします...");
  mkdirSync(toolDir, { recursive: true });
  const zip = join(WORK, "cli.zip");
  execFileSync("curl.exe", ["-L", "--fail", "-o", zip, CLI_URL], { stdio: "inherit" });
  execFileSync("tar", ["-xf", zip, "-C", toolDir], { stdio: "inherit" });
  if (!existsSync(cli)) throw new Error("ダウンロード後も Source2Viewer-CLI.exe が見つかりません");
  return cli;
}

function main() {
  const installPath = findSteamInstall();
  const { clientVersion, infPath } = readClientVersion(installPath);
  log(`[extract-local] Deadlock install: ${installPath}`);
  log(`[extract-local] ClientVersion: ${clientVersion}`);

  const localRoot = join(WORK, `local-${clientVersion}`);
  mkdirSync(localRoot, { recursive: true });

  // 1. steam.inf を退避
  cpSync(infPath, join(localRoot, "steam.inf"));

  // 2. scripts/ を decompile (毎回実行。数秒〜十数秒で終わるためキャッシュはしない)
  const cli = ensureCli();
  const vpk = join(installPath, "game", "citadel", "pak01_dir.vpk");
  if (!existsSync(vpk)) throw new Error(`pak01_dir.vpk が見つかりません: ${vpk}`);
  const scriptsOut = join(localRoot); // CLI が <out>\scripts\... を作る
  log("[extract-local] scripts/ を decompile 中...");
  execFileSync(cli, ["-i", vpk, "-o", scriptsOut, "--vpk_filepath", "scripts", "--vpk_decompile"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (!existsSync(join(localRoot, "scripts", "heroes.vdata"))) {
    throw new Error("decompile 後に scripts\\heroes.vdata が見つかりません。CLI の出力を確認してください。");
  }
  // 参考用にファイル一覧を残す(ファイル名を決め打ちにしないための記録)
  const listAll = (dir, prefix = "") =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? listAll(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
    );
  writeFileSync(
    join(localRoot, "_filelist.txt"),
    listAll(join(localRoot, "scripts")).sort().join("\n") + "\n",
  );

  // 3. localization/ をコピー (ゲーム本体側はバラファイルなので decompile 不要)
  const locSrc = join(installPath, "game", "citadel", "resource", "localization");
  const locDst = join(localRoot, "localization");
  if (existsSync(locSrc)) {
    cpSync(locSrc, locDst, { recursive: true });
  } else {
    log(`[extract-local] 警告: localization フォルダが見つかりません: ${locSrc}`);
  }

  writeFileSync(join(localRoot, "_extracted_at_utc.txt"), new Date().toISOString() + "\n");

  log(`[extract-local] 完了: ${localRoot}`);
  console.log(localRoot);
}

main();
