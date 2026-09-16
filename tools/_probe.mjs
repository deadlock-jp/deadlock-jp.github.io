import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as d from "../src/lib/data.ts";

const v = JSON.parse(readFileSync(join(process.cwd(), "data/latest.json"), "utf8")).version;
const o = JSON.parse(readFileSync(join(process.cwd(), "data/snapshots", v, "objects.json"), "utf8"));

for (const id of ["npc_boss_tier1", "npc_boss_tier3", "npc_barrack_boss", "trooper_normal", "trooper_medic", "neutral_trooper_strong", "npc_neutral_weakpoint"]) {
  const x = o.objects[id];
  if (!x) { console.log(id + " なし"); continue; }
  console.log("\n== " + id + " (" + x.className + ") ==");
  console.log("   " + Object.entries(x.stats).map(([k, val]) => k + "=" + val).join("  "));
  if (x.flags && Object.keys(x.flags).length) console.log("   flags: " + Object.keys(x.flags).join(" "));
}

console.log("\n== 経済データ ==");
console.log("itemPricePerTier:", JSON.stringify(d.itemsFile.itemPricePerTier ?? "(なし)"));
const h = d.releasedHeroes()[0];
console.log("levels (先頭3):", JSON.stringify(h.levels?.slice(0, 3)));
console.log("costBonuses のキー:", Object.keys(h.costBonuses ?? {}).join(" "));
console.log("costBonuses.WeaponMod 先頭3:", JSON.stringify(h.costBonuses?.WeaponMod?.slice(0, 3)));
console.log("\nitemsFile のキー:", Object.keys(d.itemsFile).join(" "));
