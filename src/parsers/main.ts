/**
 * パーサーCLI
 *
 *   node --experimental-strip-types src/parsers/main.ts --gt <GameTracking-Deadlockのパス>
 *   node --experimental-strip-types src/parsers/main.ts --local <ローカル抽出ルート>
 *
 * --gt: GameTracking-Deadlock から data/*.json(フラット)を生成する。
 *       検算・過去スナップショットのバックフィル用。--gt を省略した場合は
 *       環境変数 GAMETRACKING_PATH、それも無ければ ../GameTracking-Deadlock を見る。
 *
 * --local: このPC のゲームクライアントから抽出したローカルルート
 *       (tools/extract/extract-local.mjs の出力。steam.inf / scripts/ / localization/ を持つ)
 *       から data/snapshots/<ClientVersion>/*.json を生成し、data/latest.json を更新する。
 *       これが現在の一次ソース(architecture.html 参照)。
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHeroes } from "./heroes.ts";
import { parseItems } from "./items.ts";
import { parseAbilities } from "./abilities.ts";
import { parseObjects } from "./objects.ts";
import { parseLocalization } from "./localization.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function resolveGameTrackingPath(): string {
  const candidate =
    argValue("gt") ??
    process.env.GAMETRACKING_PATH ??
    resolve(REPO_ROOT, "../GameTracking-Deadlock");
  const path = resolve(candidate);
  if (!existsSync(join(path, "game/citadel/pak01_dir/scripts/heroes.vdata"))) {
    throw new Error(
      `GameTracking-Deadlock が見つかりません: ${path}\n` +
        `--gt <パス> か環境変数 GAMETRACKING_PATH で指定してください。`,
    );
  }
  return path;
}

/** 取り込み元のコミットSHA。更新検知と変更履歴の突き合わせに使う */
function upstreamCommit(gtPath: string): string {
  try {
    return execFileSync("git", ["-C", gtPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function writeJsonTo(dir: string, name: string, data: unknown): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  ${path.replace(REPO_ROOT + "\\", "").replace(REPO_ROOT + "/", "")}`);
}

/** ヒーロー/アイテム/アビリティ/オブジェクトを一括 parse して件数レポートを出す */
function parseAll(
  scripts: string,
  sha: string,
): {
  heroes: ReturnType<typeof parseHeroes>;
  items: ReturnType<typeof parseItems>;
  abilities: ReturnType<typeof parseAbilities>;
  objects: ReturnType<typeof parseObjects>;
} {
  const heroes = parseHeroes(join(scripts, "heroes.vdata"), sha);
  const items = parseItems(
    join(scripts, "abilities.vdata"),
    join(scripts, "generic_data.vdata"),
    sha,
  );
  const abilities = parseAbilities(join(scripts, "abilities.vdata"), sha);
  const objects = parseObjects(join(scripts, "npc_units.vdata"), sha);

  const heroTotal = Object.keys(heroes.heroes).length;
  const released = Object.values(heroes.heroes).filter((h) => h.released).length;
  const itemList = Object.values(items.items);
  const inShop = itemList.filter((i) => i.inShop);

  console.log(`\nヒーロー ${heroTotal} 件 (実装済み ${released} 件)`);
  console.log(`アイテム ${itemList.length} 件 (ショップ掲載 ${inShop.length} 件)`);
  for (const slot of ["WeaponMod", "Armor", "Tech"] as const) {
    const n = inShop.filter((i) => i.slotType === slot).length;
    const tiers = [1, 2, 3, 4, 5]
      .map((t) => `T${t}:${inShop.filter((i) => i.slotType === slot && i.tier === t).length}`)
      .join(" ");
    console.log(`  ${slot.padEnd(10)} ${String(n).padStart(3)} 件  ${tiers}`);
  }
  const unreleased = itemList.filter((i) => i.unreleasedTier).length;
  if (unreleased > 0) {
    console.log(`  (未実装ティアのため除外: ${unreleased} 件)`);
  }

  const abilityList = Object.values(abilities.abilities);
  console.log(`スキル ${abilityList.length} 件`);
  const byKind = new Map<string, number>();
  for (const a of abilityList) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
  for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(10)} ${String(n).padStart(3)} 件`);
  }
  console.log(`  銃データを持つもの ${abilityList.filter((a) => a.weapon).length} 件`);
  console.log(`オブジェクト ${Object.keys(objects.objects).length} 件`);

  return { heroes, items, abilities, objects };
}

function reportLocalization(localization: ReturnType<typeof parseLocalization>, lang: string): void {
  const tokenTotal = Object.keys(localization.tokens).length;
  console.log(`ローカライズ(${localization.language}) ${tokenTotal} トークン`);
  for (const [group, n] of Object.entries(localization.groupCounts)) {
    console.log(`  ${group.padEnd(24)} ${String(n).padStart(5)}`);
  }
  if (tokenTotal === 0) {
    console.log(`  ※ ${lang} のファイルが見つかりませんでした`);
  }
}

/** 取り込み元コミットの日付(ISO)。スナップショットがどの時点のものかを残すのに使う */
function upstreamCommitDate(gtPath: string): string | null {
  try {
    return execFileSync("git", ["-C", gtPath, "show", "-s", "--format=%cI", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

/** --gt: GameTracking-Deadlock からフラットな data/*.json を生成(検算・バックフィル用) */
function runGameTracking(): void {
  const gt = resolveGameTrackingPath();
  const sha = upstreamCommit(gt);
  const scripts = join(gt, "game/citadel/pak01_dir/scripts");
  const dataDir = join(REPO_ROOT, "data");

  console.log(`GameTracking-Deadlock: ${gt}`);
  console.log(`commit: ${sha}`);
  console.log("生成:");

  const { heroes, items, abilities, objects } = parseAll(scripts, sha);
  writeJsonTo(dataDir, "heroes.json", heroes);
  writeJsonTo(dataDir, "items.json", items);
  writeJsonTo(dataDir, "abilities.json", abilities);
  writeJsonTo(dataDir, "objects.json", objects);

  // 英語は GameTracking-Deadlock に含まれる。日本語はゲーム本体から取得して
  // 同じ場所に置けば、--lang japanese で同じパーサーが読む。
  const lang = argValue("lang") ?? "english";
  const localization = parseLocalization(join(gt, "game/citadel/resource/localization"), lang, sha);
  writeJsonTo(dataDir, `localization.${lang}.json`, localization);
  reportLocalization(localization, lang);
}

/**
 * --gt --snapshot: GameTracking-Deadlock の「今チェックアウトしている版」を
 * data/snapshots/<ClientVersion>/ として保存する。
 *
 * 過去の公式アップデート前後の状態を復元するためのバックフィル専用。
 * data/latest.json は動かさない(現行版はこのPCのゲームクライアントから採る)。
 * GameTracking に日本語ローカライズは含まれないので英語だけになるが、サイトの
 * 表示名は常に最新版から引くため、差分の計算には影響しない。
 */
function runGameTrackingSnapshot(): void {
  const gt = resolveGameTrackingPath();
  const sha = upstreamCommit(gt);
  const scripts = join(gt, "game/citadel/pak01_dir/scripts");
  const infPath = join(gt, "game/citadel/steam.inf");
  if (!existsSync(infPath)) {
    throw new Error(`steam.inf が見つかりません: ${infPath}\nsparse-checkout に含めてください。`);
  }
  const infText = readFileSync(infPath, "utf8");
  const clientVersion = infText.match(/^ClientVersion=(\S+)/m)?.[1];
  if (!clientVersion) throw new Error(`steam.inf に ClientVersion がありません: ${infPath}`);

  console.log(`GameTracking-Deadlock: ${gt}`);
  console.log(`commit: ${sha}`);
  console.log(`ClientVersion: ${clientVersion}`);
  console.log("生成:");

  const snapDir = join(REPO_ROOT, "data", "snapshots", clientVersion);
  const { heroes, items, abilities, objects } = parseAll(scripts, clientVersion);
  writeJsonTo(snapDir, "heroes.json", heroes);
  writeJsonTo(snapDir, "items.json", items);
  writeJsonTo(snapDir, "abilities.json", abilities);
  writeJsonTo(snapDir, "objects.json", objects);

  const locRoot = join(gt, "game/citadel/resource/localization");
  for (const lang of ["japanese", "english"] as const) {
    const localization = parseLocalization(locRoot, lang, clientVersion);
    if (Object.keys(localization.tokens).length === 0) {
      console.log(`  ※ ${lang} は GameTracking に含まれないので省略`);
      continue;
    }
    writeJsonTo(snapDir, `localization.${lang}.json`, localization);
    reportLocalization(localization, lang);
  }

  writeJsonTo(snapDir, "meta.json", {
    clientVersion,
    patchVersion: infText.match(/^ServerVersion=(\S+)/m)?.[1] ?? clientVersion,
    extractedAt: upstreamCommitDate(gt) ?? new Date().toISOString(),
    source: "gametracking",
    upstreamCommit: sha,
  });
  console.log(`\n  data/latest.json は更新しません(過去版のバックフィル)`);
}

/**
 * --local: tools/extract/extract-local.mjs が作ったローカル抽出ルートから
 * data/snapshots/<ClientVersion>/*.json を生成し、data/latest.json を更新する。
 * スナップショットが唯一の真実の源(architecture.html)。フラットな data/*.json は書かない。
 */
function runLocal(localRoot: string): void {
  const scripts = join(localRoot, "scripts");
  if (!existsSync(join(scripts, "heroes.vdata"))) {
    throw new Error(
      `scripts/heroes.vdata が見つかりません: ${scripts}\n` +
        `tools/extract/extract-local.mjs の出力ディレクトリを --local に渡してください。`,
    );
  }
  const infText = readFileSync(join(localRoot, "steam.inf"), "utf8");
  const clientVersion = infText.match(/^ClientVersion=(\S+)/m)?.[1];
  if (!clientVersion) throw new Error(`steam.inf に ClientVersion がありません: ${localRoot}`);

  console.log(`ローカル抽出ルート: ${localRoot}`);
  console.log(`ClientVersion: ${clientVersion}`);
  console.log("生成:");

  const snapDir = join(REPO_ROOT, "data", "snapshots", clientVersion);
  const source = "game-client";

  const { heroes, items, abilities, objects } = parseAll(scripts, clientVersion);
  writeJsonTo(snapDir, "heroes.json", heroes);
  writeJsonTo(snapDir, "items.json", items);
  writeJsonTo(snapDir, "abilities.json", abilities);
  writeJsonTo(snapDir, "objects.json", objects);

  const locRoot = join(localRoot, "localization");
  for (const lang of ["japanese", "english"] as const) {
    const localization = parseLocalization(locRoot, lang, clientVersion);
    writeJsonTo(snapDir, `localization.${lang}.json`, localization);
    reportLocalization(localization, lang);
  }

  const meta = {
    clientVersion,
    patchVersion: infText.match(/^ServerVersion=(\S+)/m)?.[1] ?? clientVersion,
    extractedAt: new Date().toISOString(),
    source,
    extractorVersion: "Source2Viewer-CLI 20.0",
  };
  writeJsonTo(snapDir, "meta.json", meta);

  const latestPath = join(REPO_ROOT, "data", "latest.json");
  writeFileSync(latestPath, JSON.stringify({ version: clientVersion }, null, 2) + "\n", "utf8");
  console.log(`\n  data/latest.json -> ${clientVersion}`);
}

function main(): void {
  const local = argValue("local");
  if (local) {
    runLocal(resolve(local));
  } else if (process.argv.includes("--snapshot")) {
    runGameTrackingSnapshot();
  } else {
    runGameTracking();
  }
}

main();
