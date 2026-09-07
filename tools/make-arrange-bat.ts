/**
 * data/image-manifest.json から deadlock-arrange.bat を生成する。
 *
 *   node --experimental-strip-types tools/make-arrange-bat.ts
 *
 * 手書きすると対応表とズレるので、必ずこれで作り直すこと。
 * 抽出そのものは deadlock-extract.bat が行い、このバッチは
 * 取り出した panorama/... のPNGを public/images/... の形に並べ替えるだけ。
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { ImageManifest } from "../src/parsers/image-manifest.ts";

const manifest = JSON.parse(
  readFileSync("data/image-manifest.json", "utf8"),
) as ImageManifest;

/** panorama/images/a/b_psd.vtex_c → a\b_psd.png (抽出後のファイル名) */
function extractedName(vpkPath: string): string {
  return vpkPath
    .replace(/^panorama\/images\//, "")
    .replace(/\.vtex_c$/, ".png")
    .replace(/\.vsvg_c$/, ".svg")
    .replace(/\//g, "\\");
}

/** public/images/a/b.png → a\b.png */
function outName(outPath: string): string {
  return outPath.replace(/^public\/images\//, "").replace(/\//g, "\\");
}

const dirs = new Set<string>();
for (const e of manifest.entries) {
  const d = outName(e.outPath).split("\\").slice(0, -1).join("\\");
  dirs.add(d);
  // 親フォルダも順に作る
  const parts = d.split("\\");
  for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("\\"));
}
dirs.delete("");

const L: string[] = [];
L.push("@echo off");
L.push(`REM 自動生成: tools/make-arrange-bat.ts (画像 ${manifest.entries.length} 件)`);
L.push("REM 手で編集しないこと。data/image-manifest.json を直して作り直す。");
L.push("setlocal enabledelayedexpansion");
L.push("set SRC=%~dp0deadlock-extract\\game-images");
L.push("set ROOT=%~dp0deadlock-extract\\arranged");
L.push("set ZIP=%~dp0deadlock-public-images.zip");
L.push('set ERR=%~dp0deadlock-extract\\_arrange_errors.txt');
L.push('if exist "%ROOT%" rmdir /s /q "%ROOT%"');
L.push('if exist "%ERR%" del "%ERR%"');
L.push("set N=0");
L.push("set FAIL=0");
L.push("");
L.push("echo Creating folders ...");
for (const d of [...dirs].sort()) L.push(`mkdir "%ROOT%\\public\\images\\${d}" 2>nul`);
L.push("");
L.push(`echo Copying ${manifest.entries.length} files ...`);
for (const e of manifest.entries) {
  const from = extractedName(e.vpkPath);
  const to = outName(e.outPath);
  L.push(
    `copy /y "%SRC%\\panorama\\images\\${from}" "%ROOT%\\public\\images\\${to}" >nul 2>&1` +
      ` && (set /a N+=1 >nul) || (echo MISSING ${from}>>"%ERR%" & set /a FAIL+=1 >nul)`,
  );
}
L.push("");
L.push("echo Copied: %N%   Failed: %FAIL%");
L.push('echo %N% > "%~dp0deadlock-extract\\_arranged_count.txt"');
L.push(`if not "%FAIL%"=="0" echo 足りないファイルの一覧: "%ERR%"`);
L.push("echo Zipping ...");
L.push('if exist "%ZIP%" del "%ZIP%"');
L.push(
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%ROOT%\\public' -DestinationPath '%ZIP%' -Force"`,
);
L.push("echo.");
L.push(`echo DONE -^> %ZIP%    (期待値: ${manifest.entries.length} 件)`);
L.push("echo.");
L.push("pause");

// Windowsのバッチなので改行はCRLF
writeFileSync("tools/extract/deadlock-arrange.bat", L.join("\r\n") + "\r\n", "utf8");
console.log(
  `tools/extract/deadlock-arrange.bat を生成しました (${manifest.entries.length} 件 / フォルダ ${dirs.size} 個)`,
);
