// @ts-check
/**
 * 「強みと対策」の対応表(data/matchup-rules.json)の検算。
 *
 * ルールごとに「発火するヒーロー」と「実際に出るアイテム」を全部書き出す。
 * data/ には何も書かない、人間向けの確認レポート専用コマンド
 * (tools/reconcile-patch-notes.mjs と同じ位置付け)。
 * minValue や topPercent を動かしたら必ずこれを回して目視で確かめる。
 *
 *   npm run audit:matchup
 */
import { releasedHeroes, t } from "../src/lib/data.ts";
import { heroMatchup, SLOT_SHARE_LABEL } from "../src/lib/matchup.ts";

const heroes = releasedHeroes();
const byRule = new Map();
let noStandout = [];
let noCounter = [];

for (const h of heroes) {
  const m = heroMatchup(h);
  const name = t(h.nameToken, h.key);
  if (m.noStandout) noStandout.push(name);
  if (m.counters.length === 0) noCounter.push(name);
  for (const c of m.counters) {
    if (!byRule.has(c.id)) byRule.set(c.id, { title: c.title, heroes: [], items: c.items });
    byRule.get(c.id).heroes.push(name);
  }
}

console.log(`ヒーロー ${heroes.length} 体 / ルール ${byRule.size} 件\n`);
for (const [id, r] of byRule) {
  console.log(`=== ${id}  ${r.title} ===`);
  console.log(`  発火 ${r.heroes.length} 体: ${r.heroes.join(" ")}`);
  console.log(`  アイテム ${r.items.length} 件:`);
  for (const it of r.items) {
    console.log(
      `     T${it.item.tier} ${t(it.item.nameToken, it.item.id).padEnd(20)}` +
        `${(it.note ?? "(手動タグ)").padEnd(22)}${it.item.shopFilters.map((f) => f.replace("EShopFilter", "")).join("/")}`,
    );
  }
  console.log("");
}

console.log(`★5が無く上位3軸で代替: ${noStandout.length} 体 — ${noStandout.join(" ")}`);
console.log(`対策が1件も出ない: ${noCounter.length} 体 — ${noCounter.join(" ") || "なし"}`);

/* 1体ぶんの詳細も出しておく(根拠の文面を確かめる) */
const sample = heroes.find((h) => t(h.nameToken, h.key) === "ケルビン") ?? heroes[0];
const m = heroMatchup(sample);
console.log(`\n=== 例: ${t(sample.nameToken, sample.key)} ===`);
console.log("  特徴: " + m.strengths.map((s) => `${s.label} ${s.value}(上位${s.topPercent}%)`).join(" / "));
console.log("  構成比: " + m.shares.map((s) => `${s.label} ${s.percent}%(上位${s.topPercent}%)`).join(" / "));
for (const c of m.counters) {
  console.log(`  ▼ ${c.title}${c.manual ? " [手動タグ]" : ""}`);
  console.log(`     根拠: ${c.why}${c.evidence ? " — " + c.evidence : ""}`);
  console.log(`     ${c.items.map((i) => t(i.item.nameToken, i.item.id)).join(" ")}`);
}
