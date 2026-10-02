/**
 * ビルド比較(src/pages/build/compare.astro)がクライアント側で使うデータ。
 * data/snapshots/ の比較できる全バージョンぶんを、言語ごとに1つの JSON にして
 * /data/compare-<lang>.<ハッシュ>.json として別ファイルで配る(src/pages/data/[file].json.ts)。
 * 以前はページの HTML に埋め込んでいた(HTML の大半)。
 *
 * 選択肢に出すのは公式アップデートに対応する版と最新の抽出版だけ(versionedData.ts)。
 * ラベルは ClientVersion ではなく公式アップデートの日付。比較に使う内部キーは
 * ClientVersion のまま変えない(共有URL・スナップショットの対応がずれるため)。
 */
import { t, modifierLabel, releasedHeroes } from "./data.ts";
import { weaponRows, weaponHeadline, weaponName, vitalityRows, spiritRows } from "./gamestats.ts";
import { comparableSnapshots, loadVersionedSnapshot } from "./versionedData.ts";
import { COST_BONUS_TARGET } from "../types/hero.ts";
import { dataFile } from "./buildPayload.ts";
import { currentLang } from "../i18n/context.ts";

/** 1バージョンぶんのヒーロー・アイテムを、比較に要る数値だけの軽量な形にする */
function buildVersionPayload(version: string) {
  const snap = loadVersionedSnapshot(version);
  const abilityOf = (key: string) => snap.abilitiesFile.abilities[key];

  const heroes = Object.fromEntries(
    Object.values(snap.heroesFile.heroes)
      .filter((h) => h.released)
      .map((h) => {
        const weaponSlot = h.abilities.find((a) => a.slot === "Weapon_Primary");
        const weapon = weaponSlot ? (abilityOf(weaponSlot.abilityKey)?.weapon ?? null) : null;
        return [
          h.id,
          {
            levels: h.levels.map((l) => ({
              level: l.level,
              requiredGold: l.requiredGold,
              up: l.useStandardUpgrade,
            })),
            costBonuses: h.costBonuses,
            weaponHead: weaponHeadline(weapon),
            weaponName: weaponName(h),
            rows: {
              WeaponMod: weaponRows(h, weapon),
              Armor: vitalityRows(h),
              Tech: spiritRows(h),
            },
            calc: {
              baseHealth: h.startingStats.EMaxHealth ?? 0,
              healthPerBoon: h.levelUpBonuses.MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL ?? 0,
              techPowerPerBoon: h.levelUpBonuses.MODIFIER_VALUE_TECH_POWER ?? 0,
              bulletDamage: weapon?.bulletDamage ?? null,
              bulletDamagePerBoon: h.levelUpBonuses.MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL ?? 0,
              cycleTime: weapon?.cycleTime ?? null,
              bulletsPerShot: weapon?.bulletsPerShot ?? 1,
            },
          },
        ];
      }),
  );

  const items = Object.fromEntries(
    Object.values(snap.itemsFile.items)
      .filter((i) => i.inShop)
      .map((i) => [
        i.id,
        {
          cost: i.cost,
          slot: i.slotType,
          mods: i.passiveProperties
            .map((n) => i.properties[n])
            .filter((p) => p?.providedType && p.value !== null)
            .map((p) => ({ type: p!.providedType!, value: p!.value! })),
        },
      ]),
  );

  return { heroes, items };
}

/** いま描いている言語の比較データ一式。payload が JSON に書き出す分、残りはページのマークアップ用 */
export function compareData() {
  const lang = currentLang();
  let hit = memo.get(lang);
  if (!hit) memo.set(lang, (hit = makeCompareData()));
  return hit;
}
const memo = new Map<string, ReturnType<typeof makeCompareData>>();

function makeCompareData() {
  const snapshots = comparableSnapshots(); // 新しい順
  const versions = snapshots.map((s) => s.version);
  const versionLabels = Object.fromEntries(snapshots.map((s) => [s.version, s.label]));
  const versionPayloads = Object.fromEntries(versions.map((v) => [v, buildVersionPayload(v)]));

  // ヒーロー名・アイテム名はラベルなので、どのバージョンで見ても最新版の表記でよい
  const heroes = releasedHeroes();
  const heroNames = Object.fromEntries(heroes.map((h) => [h.id, t(h.nameToken, h.key)]));
  const allItemIds = new Set<string>();
  for (const v of versions) for (const id of Object.keys(versionPayloads[v]!.items)) allItemIds.add(id);
  const itemNames = Object.fromEntries([...allItemIds].map((id) => [id, t(id, id)]));

  /*
   * アイコン表示用の見た目情報(tier/slotType/shopIcon等)は数値ではなく、
   * バージョン間でまず変わらない。新しい順に見て最初に見つかったバージョンの値を使う。
   */
  const itemIconMeta: Record<
    string,
    { tier: number; slotType: string | null; shopIcon: string | null; activation: string; isImbue: boolean }
  > = {};
  for (const v of versions) {
    const snap = loadVersionedSnapshot(v);
    for (const id of allItemIds) {
      if (itemIconMeta[id]) continue;
      const it = snap.itemsFile.items[id];
      if (it) {
        itemIconMeta[id] = {
          tier: it.tier,
          slotType: it.slotType,
          shopIcon: it.shopIcon,
          activation: it.activation,
          isImbue: it.isImbue,
        };
      }
    }
  }

  // 合計ステータスの内訳ラベル(MODIFIER_VALUE_* → その言語の表記)。全バージョンの型を集める
  const allModTypes = new Set<string>();
  for (const v of versions) {
    for (const it of Object.values(versionPayloads[v]!.items)) {
      for (const m of it.mods) allModTypes.add(m.type);
    }
  }
  for (const c of Object.values(COST_BONUS_TARGET)) allModTypes.add(c.valueType);
  const labels = Object.fromEntries([...allModTypes].map((type) => [type, modifierLabel(type)]));

  return {
    payload: { versionPayloads, versions, versionLabels, heroNames, itemNames, labels },
    heroes,
    heroNames,
    allItemIds,
    itemIconMeta,
    itemNames,
  };
}

/** ビルド比較のデータ(/data/compare-<lang>.<ハッシュ>.json) */
export const compareDataFile = (base: string) => dataFile("compare", base, () => compareData().payload);
