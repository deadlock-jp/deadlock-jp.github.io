/** アイテム・スキル共通のプロパティ抽出 */

import type { Kv3Object, Kv3Value } from "./kv3.ts";
import { stripEnumPrefix } from "./vdata.ts";
import type {
  AbilityProperty,
  PropertyScale,
  PropertyUpgrade,
  TooltipSection,
} from "../types/property.ts";

export function obj(v: Kv3Value | undefined): Kv3Object {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Kv3Object) : {};
}
export function arr(v: Kv3Value | undefined): Kv3Value[] {
  return Array.isArray(v) ? v : [];
}
export function str(v: Kv3Value | undefined): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}
export function strList(v: Kv3Value | undefined): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}

/** "2.0m" や "30" を数値にする。解釈できなければ null */
export function toNumber(raw: string): number | null {
  const m = /^-?\d+(\.\d+)?/.exec(raw.trim());
  return m ? Number(m[0]) : null;
}

function parseScale(v: Kv3Value | undefined): PropertyScale | null {
  const s = obj(v);
  const fn = str(s["_class"]);
  if (!fn) return null;
  const raw = s["m_flStatScale"];
  return {
    fn,
    statScale: typeof raw === "number" ? raw : typeof raw === "string" ? toNumber(raw) : null,
    statType: str(s["m_eSpecificStatScaleType"]),
    scalingStats: strList(s["m_vecScalingStats"]),
  };
}

/** m_mapAbilityProperties → プロパティ辞書 */
export function parseProperties(v: Kv3Value | undefined): Record<string, AbilityProperty> {
  const out: Record<string, AbilityProperty> = {};
  for (const [name, raw] of Object.entries(obj(v))) {
    const e = obj(raw);
    // m_strValue は名前に反して数値のことがある(Damage = { m_strValue = 125 })。
    // 文字列だけを受け取っていた頃は、スキルの主ダメージが丸ごと欠落していた。
    const v = e["m_strValue"];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const rawValue = String(v);
    out[name] = {
      name,
      rawValue,
      value: toNumber(rawValue),
      providedType: str(e["m_eProvidedPropertyType"]),
      displayType: str(e["m_eDisplayType"]),
      units: str(e["m_eDisplayUnits"]),
      cssClass: str(e["m_strCSSClass"]),
      scale: parseScale(e["m_subclassScaleFunction"]),
      // このスキルの「主ダメージ」。ゲーム内のスピリットパワー影響値の一覧はこれを並べている
      isAbilityDamage: e["m_bIsAbilityDamageProperty"] === true,
      labelOverride: str(e["m_strLocTokenOverride"]),
    };
  }
  return out;
}

/**
 * 装備・習得するだけで常時乗るプロパティ名。
 * m_AutoIntrinsicModifiers に登録されたものだけが常時パッシブ。
 */
export function parsePassiveProperties(v: Kv3Value | undefined): string[] {
  const names = new Set<string>();
  for (const mod of arr(v)) {
    for (const n of strList(obj(mod)["m_vecAutoRegisterModifierValueFromAbilityPropertyName"])) {
      if (n !== "") names.add(n);
    }
  }
  return [...names];
}

export function parseTooltip(v: Kv3Value | undefined): TooltipSection[] {
  return arr(v).map((sec) => {
    const s = obj(sec);
    const properties: string[] = [];
    const elevated: string[] = [];
    for (const attr of arr(s["m_vecSectionAttributes"])) {
      const a = obj(attr);
      properties.push(...strList(a["m_vecAbilityProperties"]));
      elevated.push(...strList(a["m_vecElevatedAbilityProperties"]));
    }
    return {
      area: stripEnumPrefix(String(s["m_eAbilitySectionType"] ?? ""), "EArea_"),
      properties,
      elevatedProperties: elevated,
    };
  });
}

/** m_vecAbilityUpgrades → 段階ごとの強化内容 */
export function parseUpgrades(v: Kv3Value | undefined): PropertyUpgrade[][] {
  return arr(v).map((step) =>
    arr(obj(step)["m_vecPropertyUpgrades"]).map((u) => {
      const e = obj(u);
      return {
        property: String(e["m_strPropertyName"] ?? ""),
        bonus: String(e["m_strBonus"] ?? ""),
      };
    }),
  );
}
