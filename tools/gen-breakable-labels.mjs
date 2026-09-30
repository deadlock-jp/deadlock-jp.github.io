/**
 * 箱・黄金像の識別番号(Y12 / B5 / G30)の台帳 data/breakable-labels.json を作る・追記する。
 *
 * ファーム動画と一緒に「どの箱を回るか」を報告してもらうための短い番号。
 * 番号は表示用のラベルで、実体はゲーム内部の配置ID(hammeruniqueid。map.json の breakables[].hid)。
 * 一度振った番号は二度と変えない(報告と動画の対応が壊れるため)。マップが更新されて
 * 新しい箱が増えたら、そのレーンの続き番号を足すだけ。消えた箱の番号も欠番として残す。
 *
 * 対象は味方陣営(南・アンバー側。y < 0)の箱と黄金像だけ。マップは点対称なので、
 * 敵陣の箱は同じ番号の反対側と考えればよい。
 *
 * 頭文字は一番近いレーン(Y=ヨーク(黄) / B=ブロードウェイ(青) / G=グリニッジ(緑))。
 * レーンごとに、自陣の拠点に近い順(レーンの経路上でいちばん近い点の順)に番号を振るので、
 * 番号が近い箱は場所も近い。
 *
 * 使い方:  node tools/gen-breakable-labels.mjs          (dry-run。増える番号を表示)
 *          node tools/gen-breakable-labels.mjs --write  (data/breakable-labels.json に書く)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(REPO, "data", "breakable-labels.json");
const write = process.argv.includes("--write");

const version = JSON.parse(readFileSync(join(REPO, "data", "latest.json"), "utf8")).version;
const map = JSON.parse(readFileSync(join(REPO, "data", "snapshots", version, "map.json"), "utf8"));
const economy = JSON.parse(readFileSync(join(REPO, "data", "snapshots", version, "economy.json"), "utf8"));

/** economy.json の lanes[i].name(#Citadel_LaneNameYellow など)→ 頭文字 */
const PREFIX = { Yellow: "Y", Blue: "B", Green: "G" };
const lanes = map.lanes
  .map((l) => {
    const color = /Citadel_LaneName(\w+)/.exec(economy.lanes[l.lane]?.name ?? "")?.[1];
    return { prefix: PREFIX[color], points: l.points };
  })
  .filter((l) => l.prefix);
if (lanes.length !== 3) throw new Error(`レーンが3本見つかりません: ${lanes.map((l) => l.prefix).join(",")}`);

const doc = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {
      schemaVersion: 1,
      note:
        "箱・黄金像の識別番号。キーはゲーム内部の配置ID(hammeruniqueid)、値は表示用の番号。tools/gen-breakable-labels.mjs が作る。一度振った番号は変えない(ファーム動画の報告と対応させるため)。味方陣営(南)の分だけ。",
      labels: {},
    };

const used = new Set(Object.values(doc.labels));
const next = {};
for (const p of Object.values(PREFIX)) {
  const nums = [...used].filter((l) => l.startsWith(p)).map((l) => Number(l.slice(p.length)));
  next[p] = nums.length ? Math.max(...nums) + 1 : 1;
}

// まだ番号の無い味方陣営の箱を、最寄りレーンと、そのレーン上の位置(拠点からの点の番号)で並べる
const fresh = map.breakables
  .filter((b) => b.hid && b.y < 0 && !doc.labels[b.hid])
  .map((b) => {
    let best = { d: Infinity, prefix: "", along: 0 };
    for (const l of lanes) {
      l.points.forEach((pt, i) => {
        const d = Math.hypot(pt.x - b.x, pt.y - b.y);
        if (d < best.d) best = { d, prefix: l.prefix, along: i };
      });
    }
    return { b, ...best };
  })
  .sort((a, b) => a.prefix.localeCompare(b.prefix) || a.along - b.along || a.b.x - b.b.x);

for (const f of fresh) doc.labels[f.b.hid] = `${f.prefix}${next[f.prefix]++}`;

const count = (p) => Object.values(doc.labels).filter((l) => l.startsWith(p)).length;
console.log(`新しく振った番号 ${fresh.length} 件 (台帳の合計 Y:${count("Y")} B:${count("B")} G:${count("G")})`);
if (write) {
  doc.version = version;
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log("data/breakable-labels.json を更新しました");
} else {
  console.log("(dry-run。--write で保存します)");
}
