// @ts-check
/**
 * 起動時チェック → 抽出 → parse → 差分 → commit → push を1本にまとめたスクリプト
 * (architecture.html 第6章)。今はタスクスケジューラには未登録 — 手動で実行するか、
 * 登録するときはこのファイルをそのままコマンドに指定すればよい:
 *
 *   node --experimental-strip-types <repo>\tools\automation\auto-update.mjs
 *
 * 流れ:
 *   1. ロックファイル確認(二重起動防止。失敗時も必ず解放)
 *   2. steam.inf の ClientVersion を読む(decompile 無しの軽いチェック)
 *   3. _lastversion.txt と同じなら何もせず終了
 *   4. 違えば: extract-local.mjs → parse --local → gen-snapshot-diff --write
 *      → git commit → push(fine-grained PAT 経由。deploy key は組織ポリシーで
 *      無効化されているため使えない)
 *   5. 失敗したら push せず・_lastversion.txt も更新せず終了(次回また試みる)。
 *      成功/失敗どちらも _autolog.txt に記録する。
 *
 * 認証: %USERPROFILE%\.deadlock-jp-token.txt に保存した fine-grained PAT
 * (deadlock-jp/deadlock-jp.github.io 限定・Contents: Read and write のみ)を
 * askpass.mjs 経由で渡す。トークンの値は argv にも env にも直接乗らないので、
 * このスクリプトの失敗ログにトークンが混ざる心配がない。push 先は通常の
 * `origin`(このセッションで使っている個人アカウント認証)と同じリポジトリだが、
 * 認証情報だけこの専用トークンに差し替える(-c credential.helper= で
 * Git Credential Manager 等の割り込みを止めてから askpass に任せる)。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { findSteamInstall, readClientVersion } from "../extract/steam.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const WORK = "C:\\Users\\nogud\\Downloads\\deadlock-extract";
const LOCK = join(WORK, "_update.lock");
const LASTVERSION = join(WORK, "_lastversion.txt");
const AUTOLOG = join(WORK, "_autolog.txt");
const TOKEN_PATH = join(homedir(), ".deadlock-jp-token.txt");
const ASKPASS = join(HERE, "askpass.cmd");
const REPO_URL = "https://github.com/deadlock-jp/deadlock-jp.github.io.git";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    mkdirSync(WORK, { recursive: true });
    appendFileSync(AUTOLOG, line + "\n");
  } catch {
    /* ログ書き込み失敗は致命的にしない */
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf8", ...opts });
}

function acquireLock() {
  mkdirSync(WORK, { recursive: true });
  if (existsSync(LOCK)) {
    const age = Date.now() - readFileSync(LOCK, "utf8").split("\n")[0];
    // 6時間以上前のロックは前回の異常終了とみなして上書きする(スタックロック対策)
    if (Number.isFinite(Number(age)) && age < 6 * 60 * 60 * 1000) {
      log(`ロック中(${LOCK})。二重起動とみなして終了します。`);
      process.exit(0);
    }
    log("古いロックを検出。前回異常終了とみなして上書きします。");
  }
  writeFileSync(LOCK, String(Date.now()));
}

function releaseLock() {
  try {
    unlinkSync(LOCK);
  } catch {
    /* 無ければ無いでよい */
  }
}

function main() {
  acquireLock();
  try {
    const installPath = findSteamInstall();
    const { clientVersion } = readClientVersion(installPath);
    const lastVersion = existsSync(LASTVERSION) ? readFileSync(LASTVERSION, "utf8").trim() : null;

    if (clientVersion === lastVersion) {
      log(`変更なし(ClientVersion ${clientVersion})。終了します。`);
      return;
    }
    log(`新しいバージョンを検出: ${lastVersion ?? "(初回)"} -> ${clientVersion}`);

    if (!existsSync(TOKEN_PATH)) {
      throw new Error(
        `${TOKEN_PATH} が無いので push できません(抽出前に確認して中断)。fine-grained PAT を作って保存してください。`,
      );
    }

    // 差分の from に使う「更新前の最新版」を、上書きされる前に控えておく
    const latestPath = join(REPO_ROOT, "data", "latest.json");
    const prevVersion = existsSync(latestPath)
      ? JSON.parse(readFileSync(latestPath, "utf8")).version
      : null;

    log("抽出中 (tools/extract/extract-local.mjs)...");
    const extractOut = run("node", ["--experimental-strip-types", "tools/extract/extract-local.mjs"]);
    const localRoot = extractOut.trim().split("\n").at(-1)?.trim();
    if (!localRoot || !existsSync(localRoot)) {
      throw new Error(`extract-local.mjs の出力からローカルルートを取れませんでした: ${JSON.stringify(extractOut)}`);
    }

    log(`parse中 (--local ${localRoot})...`);
    run("node", ["--experimental-strip-types", "src/parsers/main.ts", "--local", localRoot]);

    if (prevVersion && prevVersion !== clientVersion) {
      log(`差分生成中 (${prevVersion} -> ${clientVersion})...`);
      run("node", ["tools/gen-snapshot-diff.mjs", "--from", prevVersion, "--to", clientVersion, "--write"]);
    } else {
      log("差分生成をスキップ(前バージョンが無いか同一)。");
    }

    log("git commit + push 中...");
    run("git", ["add", "data/"]);
    const status = run("git", ["status", "--porcelain", "--", "data/"]);
    if (!status.trim()) {
      log("data/ に変更がありませんでした(ClientVersion は変わったが数値・ID差分ゼロ)。commit をスキップします。");
    } else {
      run("git", ["commit", "-m", `data: snapshot ${clientVersion} (auto)`]);
      if (!existsSync(TOKEN_PATH)) {
        throw new Error(
          `${TOKEN_PATH} が無いので push できません。fine-grained PAT を作って保存してください。`,
        );
      }
      run("git", ["-c", "credential.helper=", "push", REPO_URL, "HEAD:main"], {
        env: { ...process.env, GIT_ASKPASS: ASKPASS, GIT_TERMINAL_PROMPT: "0" },
      });
      log("push 完了");
    }

    writeFileSync(LASTVERSION, clientVersion);
    log(`完了。_lastversion.txt を ${clientVersion} に更新しました。`);
  } catch (err) {
    log(`失敗: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    log("push・_lastversion.txt の更新は行いませんでした(次回リトライされます)。");
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

main();
