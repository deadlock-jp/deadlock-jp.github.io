/** abilities.vdata (アイテム以外) → abilities.json */

import type { Kv3Object, Kv3Value } from "./kv3.ts";
import { readVdata, resolveEntry, stripEnumPrefix } from "./vdata.ts";
import {
  obj,
  str,
  parseProperties,
  parsePassiveProperties,
  parseTooltip,
  parseUpgrades,
} from "./properties.ts";
import type { Ability, AbilitiesFile, AbilityKind, WeaponInfo } from "../types/ability.ts";

const KINDS: AbilityKind[] = [
  "Weapon",
  "Signature",
  "Ultimate",
  "Innate",
  "Melee",
  "Cosmetic",
];

function nOrNull(v: Kv3Value | undefined): number | null {
  return typeof v === "number" ? v : null;
}

/**
 * 変身時のスロット入れ替え(スロット名 → 実ID)。
 * 唯一の実例はシルバー(人狼)の m_WerewolfModifier.m_mapWerewolfAbilities
 * (ESlot_Weapon_Primary / ESlot_Signature_1-3 を人狼側のIDへ差し替える)。
 * ヒーロー固有の命名(Werewolf)だが、他ヒーローが同じ仕組みを持てば
 * *Modifier.m_map*Abilities という形は同じはずなので、フィールド名を決め打ちにせず
 * "Modifier"で終わるキー配下の "m_map...Abilities" を総なめして拾う。
 */
function parseAlternateFormAbilities(e: Kv3Object): Record<string, string> | null {
  for (const [key, v] of Object.entries(e)) {
    if (!key.endsWith("Modifier")) continue;
    const modifier = obj(v);
    for (const [mkey, mval] of Object.entries(modifier)) {
      if (!mkey.startsWith("m_map") || !mkey.endsWith("Abilities")) continue;
      const map = obj(mval);
      const out: Record<string, string> = {};
      for (const [slot, id] of Object.entries(map)) {
        const s = str(id);
        // hero.abilities 側の slot("Signature_1"等)と突き合わせられるよう、
        // ESlot_ 接頭辞をここでも剥がしておく(parseHeroesと同じ規約)
        if (s) out[stripEnumPrefix(slot, "ESlot_")] = s;
      }
      if (Object.keys(out).length > 0) return out;
    }
  }
  return null;
}

function parseWeapon(v: Kv3Value | undefined): WeaponInfo | null {
  const w = obj(v);
  // ダメージも装弾数も無いものは実質的な銃データを持たない
  if (w["m_flBulletDamage"] === undefined && w["m_iClipSize"] === undefined) return null;
  return {
    bulletDamage: nOrNull(w["m_flBulletDamage"]),
    bulletsPerShot: nOrNull(w["m_iBullets"]),
    cycleTime: nOrNull(w["m_flCycleTime"]),
    clipSize: nOrNull(w["m_iClipSize"]),
    reloadDuration: nOrNull(w["m_reloadDuration"]),
    bulletSpeed: nOrNull(w["m_flBulletSpeed"]),
    range: nOrNull(w["m_flRange"]),
    burstShotCount: nOrNull(w["m_iBurstShotCount"]),
    burstShotCooldown: nOrNull(w["m_flBurstShotCooldown"]),
    falloff: {
      startRange: nOrNull(w["m_flDamageFalloffStartRange"]),
      endRange: nOrNull(w["m_flDamageFalloffEndRange"]),
      startScale: nOrNull(w["m_flDamageFalloffStartScale"]),
      endScale: nOrNull(w["m_flDamageFalloffEndScale"]),
      bias: nOrNull(w["m_flDamageFalloffBias"]),
    },
    crit: {
      bonusStart: nOrNull(w["m_flCritBonusStart"]),
      bonusEnd: nOrNull(w["m_flCritBonusEnd"]),
      startRange: nOrNull(w["m_flCritBonusStartRange"]),
      endRange: nOrNull(w["m_flCritBonusEndRange"]),
      bonusAgainstNPCs: nOrNull(w["m_flCritBonusAgainstNPCs"]),
    },
    spread: nOrNull(w["m_Spread"]),
    standingSpread: nOrNull(w["m_StandingSpread"]),
    canZoom: w["m_bCanZoom"] === true,
    shootMoveSpeedPercent: nOrNull(w["m_flShootMoveSpeedPercent"]),
    reloadMoveSpeed: nOrNull(w["m_flReloadMoveSpeed"]),
    bulletGravityScale: nOrNull(w["m_flBulletGravityScale"]),
    bulletRadius: nOrNull(w["m_flBulletRadius"]),
    bulletLifetime: nOrNull(w["m_flBulletLifetime"]),
  };
}

export function parseAbilities(abilitiesPath: string, upstreamCommit: string): AbilitiesFile {
  const root = readVdata(abilitiesPath);

  const abilities: Record<string, Ability> = {};
  for (const key of Object.keys(root)) {
    const raw = root[key];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const typeRaw = (raw as Kv3Object)["m_eAbilityType"];
    // アイテムは items.json 側で扱う
    if (typeRaw === "EAbilityType_Item") continue;
    if (typeof typeRaw !== "string") continue;

    const e = resolveEntry(root, key);
    const kindRaw = stripEnumPrefix(typeRaw, "EAbilityType_") as AbilityKind;
    const kind = KINDS.includes(kindRaw) ? kindRaw : "Unknown";

    abilities[key] = {
      id: key,
      nameToken: key,
      descToken: `${key}_desc`,
      kind,
      activation: stripEnumPrefix(
        String(e["m_eAbilityActivation"] ?? ""),
        "CITADEL_ABILITY_ACTIVATION_",
      ),
      maxLevel: nOrNull(e["m_iMaxLevel"]),
      abilityPointsCost: nOrNull(e["m_nAbilityPointsCost"]),
      // Valve側のフィールド名が m_nAbillityUnlocksCost と綴り違いなので、そのまま参照する
      abilityUnlocksCost: nOrNull(e["m_nAbillityUnlocksCost"]),
      properties: parseProperties(e["m_mapAbilityProperties"]),
      passiveProperties: parsePassiveProperties(e["m_AutoIntrinsicModifiers"]),
      upgrades: parseUpgrades(e["m_vecAbilityUpgrades"]),
      tooltip: parseTooltip(e["m_vecTooltipSectionInfo"]),
      weapon: kind === "Weapon" ? parseWeapon(e["m_WeaponInfo"]) : null,
      image: str(e["m_strAbilityImage"]),
      alternateFormAbilities: parseAlternateFormAbilities(e),
    };
  }

  return {
    schemaVersion: 1,
    upstreamCommit,
    generatedAt: new Date().toISOString(),
    abilities,
  };
}
