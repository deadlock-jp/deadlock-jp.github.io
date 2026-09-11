#!/usr/bin/env node
// @ts-check
/**
 * git の GIT_ASKPASS から呼ばれる小さなヘルパー。
 * トークンの値は一切 argv/env に乗せず、このスクリプトがファイルから直接読んで
 * git に渡す(auto-update.mjs のエラーログにトークンが写り込まないようにするため)。
 *
 * トークン置き場: %USERPROFILE%\.deadlock-jp-token.txt (このリポジトリの外。追跡しない)
 * ここには "Contents: Read and write" だけを許可した fine-grained PAT を1行で保存する。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const prompt = process.argv[2] ?? "";
const TOKEN_PATH = join(homedir(), ".deadlock-jp-token.txt");

if (/username/i.test(prompt)) {
  console.log("x-access-token");
} else {
  const token = readFileSync(TOKEN_PATH, "utf8").trim();
  if (!token) throw new Error(`${TOKEN_PATH} が空です`);
  console.log(token);
}
