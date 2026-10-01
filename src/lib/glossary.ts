/**
 * 用語集(/mechanics/glossary/、日本語のみ)の中身。
 *
 * ■ 表記
 *   - ゲーム内の用語は、ゲーム内の日本語(ローカライズのトークン)から引く。英語の綴りは付けない
 *   - MOBA・FPS の用語と略語だけ、英語の綴り・正式な形を添える
 *   - ヒーロー名・アイテム名・スキル名は収録しない(それぞれのページがあるため)
 * ■ 説明
 *   - ゲーム内に説明文(ゲーム内ガイド guide_*_desc)があるものはそれを使う(source: "game")
 *   - 無いものはこのサイトで書いた文(source: "site")。第三者のサイト・Wiki の定義は書き写さない
 *   - 数値はゲームデータから引く(ルール6)。手で書かない
 *   - 状態異常は説明を短くして、状態異常・効果ページ(src/lib/effects.ts)の該当箇所へリンクする
 */
import { t, souls, heroesFile, item, bindingName } from "./data.ts";
import { matchFlow, clock, duration } from "./matchFlow.ts";
import { economyTable } from "./souls.ts";
import { effectIndex, effectName } from "./effects.ts";
import { L } from "../i18n/index.ts";

export type GlossaryCategory = "game" | "system" | "effect" | "moba" | "abbr";
export const GLOSSARY_CATEGORIES: { id: GlossaryCategory; label: string; lead: string }[] = [
  { id: "game", label: "ゲーム内の用語", lead: "マップや建造物など、Deadlock の中で使われている呼び名です。" },
  { id: "system", label: "ゲームシステム・ステータス", lead: "戦闘や成長の仕組みと、ステータスの用語です。" },
  { id: "effect", label: "状態異常・効果", lead: "詳しい一覧は状態異常・効果のページにあります。" },
  { id: "moba", label: "MOBA・FPS の用語", lead: "プレイヤーの間でよく使われる言い回しです。ゲーム内の正式な名前ではありません。" },
  { id: "abbr", label: "略語", lead: "チャットや攻略の文章でよく見かける略語です。" },
];

export interface GlossaryLink {
  label: string;
  /** サイト内のパス(base を除いたもの)。# 付きでもよい */
  path: string;
}
export interface GlossaryEntry {
  id: string;
  category: GlossaryCategory;
  term: string;
  /** 英語の綴り・正式な形(MOBA・FPS の用語と略語だけ) */
  en?: string;
  desc: string;
  /** game = ゲーム内の説明文 / site = このサイトで書いた文 */
  source: "game" | "site";
  /** ゲーム内の説明文に、このサイトで書き足した補足(desc がゲーム内の文のときに分けて出す) */
  note?: string;
  links: GlossaryLink[];
  /** 関連するヒーロー・スキル・アイテム(アイコンを並べて各ページへリンクする) */
  related?: { heroes?: number[]; abilities?: string[]; items?: string[] };
}

/** ゲーム内の文。キー割り当ての差し込みは [ジャンプ／乗り越え] のように、ゲーム内のキー名で読める形にする */
function gameText(token: string): string {
  return t(token, "")
    .replace(/\{g:citadel_binding:'([A-Za-z0-9_]+)'\}/g, (_m, key: string) => `[${bindingName(key)}]`)
    .replace(/\{g:citadel_inline_attribute:'([A-Za-z0-9_]+)'\}/g, (_m, attr: string) => t(`InlineAttribute_${attr}`, attr))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 「メタる」の例: 空中に浮くヒーロー(セレステ・ヴィンディクタ)に対してノックダウンを買う(2026-10-01 にユーザー指定)。
 * 名前は表示のたびにローカライズから引くので、ここは実IDだけ持つ
 */
const META_EXAMPLE_KEYS = { heroes: ["hero_unicorn", "hero_hornet"], item: "upgrade_target_stun" };
const heroIdByKey = (k: string) => Object.values(heroesFile.heroes).find((h) => h.key === k)?.id;
const META_EXAMPLE = {
  heroes: META_EXAMPLE_KEYS.heroes.map(heroIdByKey).filter((x): x is number => x !== undefined),
  item: META_EXAMPLE_KEYS.item,
};
const heroName = (id: number) => {
  const h = heroesFile.heroes[String(id)];
  return h ? t(h.nameToken, h.key) : String(id);
};
const itemName = (id: string) => t(item(id)?.nameToken ?? id, id);
/** 状態異常の項目に並べるアイコンの上限(スロウは59スキルあるので、全部は並べない) */
const RELATED_MAX = 12;

const P = {
  beginner: "/mechanics/beginner/",
  match: "/mechanics/match/",
  farm: "/mechanics/farm/",
  objects: "/mechanics/objects/",
  controls: "/mechanics/controls/",
  effects: "/mechanics/effects/",
  build: "/build/",
  items: "/items/",
  heroes: "/heroes/",
};

export function glossary(): GlossaryEntry[] {
  const f = matchFlow();
  const economy = economyTable();
  const soulWord = t("Citadel_Hero_Stats_Souls", "ソウル");
  const tiers = economy.itemPrices.map((p) => `ティア${p.tier} ${souls(p.cost)}${soulWord}`).join("、");
  const boon = t("Citadel_Player_Level_PowerIncrease", "恩恵");
  const snackPct = f.healingSnackPct;
  const key = (k: string) => `[${bindingName(k)}]`;
  /** 防衛建造物の順番(前線から)。はじめての Deadlock の「全体像」と同じ並び */
  const nth = (n: number) => `前線から数えて${n}つ目の防衛建造物です。`;
  const midboss = t("Objective_MidBoss", "ミッド・ボス");
  const urn = t("ability_golden_idol", "魂の壺");
  const rift = t("HeroTesting_Rift", "不安定な裂け目");

  /* game: ゲーム内の説明文があるものはそれを使う */
  const fromGame = (
    id: string,
    category: GlossaryCategory,
    termToken: string,
    descToken: string,
    links: GlossaryLink[],
    termFallback = "",
  ): GlossaryEntry => ({ id, category, term: t(termToken, termFallback), desc: gameText(descToken), source: "game", links });
  const site = (
    id: string,
    category: GlossaryCategory,
    term: string,
    desc: string,
    links: GlossaryLink[] = [],
    en?: string,
  ): GlossaryEntry => ({ id, category, term, desc, source: "site", links, ...(en ? { en } : {}) });

  const entries: GlossaryEntry[] = [
    // ================= ゲーム内の用語 =================
    {
      ...fromGame("soul", "game", "Citadel_Hero_Stats_Souls", "guide_upgrades_last_hit_desc", [
        { label: "ソウルの仕組み", path: `${P.farm}#souls` },
        { label: "数値表", path: `${P.farm}#tables` },
      ]),
      note: `アイテムを買うための通貨でもあります。また、稼いだ${soulWord}の累計に応じて${boon}のレベルが上がり、アビリティポイントの獲得やステータスの上昇につながります。`,
    },
    site("tier", "game", "ティア", `アイテムの段階です。価格は${tiers}。上のティアほど効果が大きくなります。`, [
      { label: "アイテム一覧", path: P.items },
      { label: "数値表", path: `${P.farm}#tables` },
    ]),
    {
      ...fromGame("guardian", "game", "Citadel_Hud_KillFeedGuardian", "guide_the_map_guardians_desc", [
        { label: "建造物の数値", path: `${P.objects}#lane` },
        { label: "レーン戦", path: `${P.match}#laning` },
      ]),
      note: nth(1),
    },
    {
      ...fromGame("walker", "game", "Citadel_Hud_KillFeedWalker", "guide_the_map_walkers_desc", [
        { label: "建造物の数値", path: `${P.objects}#lane` },
      ]),
      note: nth(2),
    },
    site(
      "base-guardian",
      "game",
      t("Citadel_Hud_KillFeedBarracksBoss", "ベース・ガーディアン"),
      `${nth(3)}ウォーカーの先、拠点の入口を守っています。これを壊すとシュラインに攻撃が届くようになります。`,
      [
        { label: "建造物の数値", path: `${P.objects}#lane` },
        { label: "全体像", path: `${P.beginner}#overview` },
      ],
    ),
    site(
      "shrine",
      "game",
      t("Citadel_Hud_KillFeedShieldName", "シュライン"),
      `${nth(4)}パトロンを守る建造物で、拠点に左右2つあります。両方を壊すまでパトロンは攻撃を受け付けません。`,
      [
        { label: "建造物の数値", path: `${P.objects}#shrine` },
        { label: "全体像", path: `${P.beginner}#overview` },
      ],
    ),
    {
      ...fromGame("patron", "game", "Citadel_Hud_KillFeedTitan", "guide_the_map_core_alt_desc", [
        { label: "全体像", path: `${P.beginner}#overview` },
      ]),
      note: `${nth(5)}これを壊したチームの勝ちです。`,
    },
    fromGame("trooper", "game", "Citadel_AttackerClass_CLASS_TROOPER", "guide_the_map_troopers_desc", [
      { label: "トルーパーの数値", path: `${P.objects}#trooper` },
    ]),
    // ゲーム内ガイドの文はミッド・ボスの話も含むので使わない(ミッド・ボスは別項目)
    site(
      "haunt",
      "game",
      t("Citadel_TeamName_Neutral", "ホーント"),
      "マップに数多く点在する中立モンスターです。倒すとソウルが入ります。",
      [
        { label: "中立キャンプの数値", path: `${P.objects}#neutral` },
        { label: "稼ぎ方", path: `${P.farm}#farming` },
      ],
    ),
    fromGame("midboss", "game", "Objective_MidBoss", "guide_the_map_midboss_desc", [
      { label: "全体像", path: `${P.beginner}#overview` },
    ]),
    site(
      "urn",
      "game",
      urn,
      `マップに出現する壺です。拾って持ち帰るとソウルが入ります${f.urnOrbs !== null ? `（ソウルオーブが${f.urnOrbs}個出ます）` : ""}。` +
        "このソウルオーブは相手にディナイされることがあるので、納品したら忘れずにオーブを撃って確保しましょう。運んでいる間は狙われやすくなります。",
      [
        { label: "中盤で意識すること", path: `${P.match}#postlane` },
        { label: "ディナイ", path: `/mechanics/glossary/#deny` },
      ],
    ),
    site(
      "rift",
      "game",
      rift,
      `試合の途中で開く場所で、確保したチームにソウルが入ります。${f.rift ? `${clock(f.rift.initial)}から${duration(f.rift.interval)}ごとに出現します。` : ""}`,
      [{ label: "中盤で意識すること", path: `${P.match}#postlane` }],
    ),
    // ゲーム内ガイドの文は飛び乗り・飛び降りの説明が一部だけなので、実際の操作(2026-10-01 に確認)で書く
    site(
      "zipline",
      "game",
      t("guide_movement_zipline_header", "ジップライン"),
      `レーンに沿って張られたロープで、${key("Mantle")}の長押しで飛び乗ると素早く移動できます。降りるときは${key("Mantle")}・${key("Crouch")}・${key("Roll")}のどれかを押します。`,
      [{ label: "ジップラインの操作", path: `${P.controls}#zipline` }],
    ),
    site(
      "shop",
      "game",
      t("citadel_settings_shop", "ショップ"),
      `${soulWord}を使ってアイテムを買う場所です。前線のガーディアンが破壊されるまではレーンの前線近くに置かれていて、そのほかマップ上の決まった場所と拠点にもあります。`,
      [
        { label: "ショップの場所（マップ）", path: `${P.farm}?show=facility#map` },
        { label: "アイテム一覧", path: P.items },
        { label: "ビルドシミュレーター", path: P.build },
      ],
    ),
    site(
      "golden-statue",
      "game",
      t("Citadel_ShopStats_GoldenStatues", "黄金像"),
      "壊すとステータス上昇（ロール）が手に入るオブジェクトです。",
      [{ label: "マップ", path: `${P.farm}#map` }],
    ),
    site(
      "sinners",
      "game",
      t("neutral_sinners", "罪人の供物"),
      "スロットマシンの台です。近接攻撃で壊すオブジェクトで、スロットの絵柄がそろったタイミングで壊すとステータス上昇が手に入ります。",
      [
        { label: "稼ぎ方", path: `${P.farm}#farming` },
        { label: "近接攻撃", path: "/mechanics/glossary/#melee" },
      ],
    ),
    site(
      "healing-snack",
      "game",
      t("HeroTesting_HealingSnacks", "ヒーリングスナック"),
      `マップに置かれている回復アイテムです。${snackPct !== null ? `1つ拾うと最大HPの${snackPct}%を回復します。` : "拾うとHPが回復します。"}`,
      [{ label: "マップ", path: `${P.farm}#map` }],
    ),

    // ================= ゲームシステム・ステータス =================
    fromGame("ability-point", "system", "guide_upgrades_killing_guardians_header", "guide_upgrades_killing_guardians_desc", [
      { label: "スキルの強化（ヒーローページ）", path: P.heroes },
    ]),
    site(
      "ultimate",
      "system",
      "アルティメット",
      `ヒーローごとの最も強力なアビリティです。${f.ultimate?.totalGold ? `所持ソウルの総額が ${souls(f.ultimate.totalGold)}${soulWord} に達すると解放されます。` : ""}`,
      [{ label: "用語（はじめての Deadlock）", path: `${P.beginner}#terms` }],
    ),
    site(
      "spirit-power",
      "system",
      t("OverflowTechPower_label", "スピリットパワー"),
      "アビリティの効果を強めるステータスです。ダメージや効果時間などに、スキルごとの係数をかけた分が加わります。主にスピリット系のアイテムで上がります。",
      [{ label: "ビルドシミュレーター", path: P.build }],
    ),
    site(
      "weapon-damage",
      "system",
      t("BaseAttackDamagePercentBonus_label", "武器ダメージ"),
      "銃で与えるダメージを上げるステータスです。主に武器系のアイテムで上がります。",
      [{ label: "ビルドシミュレーター", path: P.build }],
    ),
    site(
      "bullet-resist",
      "system",
      t("FervorBulletResist_label", "弾薬耐性"),
      "銃で受けるダメージを減らすステータスです。下げる効果もあります。",
      [{ label: "弾薬耐性低下", path: `${P.effects}#bullet-resist-down` }],
    ),
    site(
      "spirit-resist",
      "system",
      t("BuffTechResist_label", "スピリット耐性"),
      "スピリットダメージ（アビリティなど）で受けるダメージを減らすステータスです。下げる効果もあります。",
      [{ label: "スピリット耐性低下", path: `${P.effects}#spirit-resist-down` }],
    ),
    site(
      "headshot",
      "system",
      t("citadel_build_tag_headshots", "ヘッドショット"),
      "頭に弾を当てることです。通常より大きなダメージになり、倍率はヒーローの銃ごとに決まっています。",
      [{ label: "ヒーロー一覧", path: P.heroes }],
    ),
    // ゲーム内ガイドで減衰に触れているのは射撃の説明(guide_basics_shoot_desc)だけで、用語の説明にはならないので書く
    site(
      "falloff",
      "system",
      t("CitadelHeroStats_Weapon_Falloff", "減衰距離"),
      "銃のダメージが距離で下がり始める距離です。これより遠い相手には、銃のダメージが少しずつ小さくなります。ヒーローの銃ごとに決まっています。",
      [{ label: "ヒーロー一覧", path: P.heroes }],
    ),
    fromGame("melee", "system", "guide_basics_melee_header", "guide_basics_melee_desc", [
      { label: "近接強攻撃のテクニック", path: `${P.controls}#heavy-melee` },
    ]),
    fromGame("parry", "system", "citadel_ability_melee_parry", "guide_advanced_parry_desc", [
      { label: "パリィの操作", path: `${P.controls}#parry` },
      { label: "スタン", path: `${P.effects}#stun` },
    ]),
    site(
      "stamina",
      "system",
      t("StaminaHungry_label", "スタミナ"),
      "ダッシュや空中ジャンプに使うゲージです。レティクルの下に表示され、時間で回復します。",
      [{ label: "ダッシュ", path: `${P.controls}#dash` }],
    ),
    fromGame("dash", "system", "citadel_ability_dash", "guide_movement_dodge_desc", [
      { label: "ダッシュのテクニック", path: `${P.controls}#dash` },
    ]),
    fromGame("air-dash", "system", "guide_movement_airdash_header", "guide_movement_airdash_desc", [
      { label: "ダッシュのテクニック", path: `${P.controls}#dash` },
    ]),
    fromGame("dash-jump", "system", "guide_movement_dodge_jump_header", "guide_movement_dodge_jump_desc", [
      { label: "ジャンプのテクニック", path: `${P.controls}#jump` },
    ]),
    {
      ...fromGame("slide", "system", "citadel_ability_slide", "guide_movement_slide_desc", [
        { label: "スライディングのテクニック", path: `${P.controls}#slide` },
      ]),
      note: "スライディング中は弾薬を消費しません。",
    },
    fromGame("mantle", "system", "guide_movement_mantle_header", "guide_movement_mantle_desc", [
      { label: "乗り越えのテクニック", path: `${P.controls}#mantle` },
    ]),
    site(
      "enhanced",
      "system",
      t("Citadel_ItemDraft_Enhanced", "エンハンスド"),
      `${t("Citadel_Play_StreetBrawl_Title", "ストリートブロウル")}で、アイテムが確率で強化された状態で手に入ることがあります。その強化状態のことです。`,
      [{ label: "アイテム一覧", path: P.items }],
    ),

    // ================= MOBA・FPS の用語 =================
    {
      id: "last-hit",
      category: "moba",
      term: t("Citadel_LaneStats_LastHits", "ラストヒット"),
      en: "last hit",
      desc: "敵のトルーパーや中立モンスターにとどめを刺すことです。Deadlock ではとどめを刺すとソウルオーブが出て、撃って回収するとソウルが入ります。",
      source: "site",
      links: [{ label: "ソウルの仕組み", path: `${P.farm}#souls` }],
    },
    {
      id: "deny",
      category: "moba",
      term: t("Citadel_Hud_Denied", "ディナイ"),
      en: "deny",
      desc: gameText("guide_upgrades_deny_desc") + (f.deny ? `（取った側に${f.deny.denierPct}%、取られた側に${f.deny.deniedPct}%）` : ""),
      source: "game",
      links: [{ label: "最初に覚える3つのこと", path: `${P.beginner}#first` }],
    },
    {
      id: "lane",
      category: "moba",
      term: t("guide_the_map_lanes_header", "レーン"),
      en: "lane",
      desc: gameText("guide_the_map_lanes_desc"),
      source: "game",
      note: `3つのレーンには色にちなんだ名前があります（黄：${t("Citadel_LaneNameYellow", "ヨーク")}、青：${t("Citadel_LaneNameBlue", "ブロードウェイ")}、緑：${t("Citadel_LaneNameGreen", "グリニッジ")}）。`,
      links: [
        { label: "レーン戦", path: `${P.match}#laning` },
        { label: "マップ", path: `${P.farm}#map` },
      ],
    },
    site("farm", "moba", "ファーム", "トルーパーや中立モンスターを倒してソウルを稼ぐことです。", [{ label: "稼ぎ方", path: `${P.farm}#farming` }], "farm"),
    site("wave", "moba", "ウェーブ", "一定の間隔でレーンに送り出されるトルーパーの集団です。", [{ label: "トルーパーの数値", path: `${P.objects}#trooper` }], "wave"),
    site(
      "push",
      "moba",
      "プッシュ",
      "ウェーブを早く倒して、レーンを相手の建造物の方へ押し込むことです。建造物を攻撃しやすくなる一方、自分は前に出ることになります。",
      [{ label: "レーン戦", path: `${P.match}#laning` }],
      "push",
    ),
    site(
      "lane-freeze",
      "moba",
      "フリーズ",
      "トルーパー同士のぶつかる位置を、自分の建造物の近くに留めておくことです。相手は前に出ないとソウルを取れなくなります。状態異常の「凍結」とは別の意味です。",
      [{ label: "稼ぎ方", path: `${P.farm}#farming` }],
      "freeze",
    ),
    site("gank", "moba", "ガンク", "別のレーンや中立エリアから移動して、少ない人数の相手を襲うことです。", [{ label: "レーン後・中盤", path: `${P.match}#postlane` }], "gank"),
    site(
      "rotation",
      "moba",
      "ローテーション",
      "今いる場所を離れて、別のレーンや目標に移ることです。ガーディアンが落ちてレーン戦が終わると増えます。",
      [{ label: "レーン後・中盤", path: `${P.match}#postlane` }],
      "rotation",
    ),
    site("objective", "moba", "オブジェクト", "建造物や" + midboss + "など、試合の勝敗に関わる目標のことです。", [{ label: "建造物の数値", path: P.objects }], "objective"),
    site(
      "snowball",
      "moba",
      "スノーボール",
      "有利がさらに有利を呼んで、差が雪だるま式に広がることです。特に序盤にパワースパイクを迎えると起こりやすく、終盤に強くなるキャリーが多いチームは、相手にスノーボールされやすくなります。",
      [
        { label: "パワースパイク", path: "/mechanics/glossary/#power-spike" },
        { label: "試合の流れ", path: P.match },
      ],
      "snowball",
    ),
    site("power-spike", "moba", "パワースパイク", "アイテムの購入やアルティメットの解放などで、ヒーローが急に強くなる時点のことです。", [{ label: "ビルドシミュレーター", path: P.build }], "power spike"),
    site("carry", "moba", "キャリー", "ソウルを集めて終盤に大きな火力を出し、チームを勝たせる役のことです。", [], "carry"),
    site("support", "moba", "サポート", "回復や行動阻害などで味方を助ける役のことです。", [], "support"),
    site("tank", "moba", "タンク", "HPや耐性が高く、前に出てダメージを受け止める役のことです。", [], "tank"),
    site("peel", "moba", "ピール", "味方に飛びかかってきた相手を、行動阻害などで引きはがして守ることです。", [{ label: "行動を止める効果", path: `${P.effects}#cat-control` }], "peel"),
    site("engage", "moba", "エンゲージ", "集団戦を自分たちから仕掛けることです。", [], "engage"),
    site("dive", "moba", "ダイブ", "相手の建造物の近くや後衛の奥まで踏み込んで、狙った相手を倒しに行くことです。", [], "dive"),
    site("kite", "moba", "カイト", "距離を取りながら攻撃し、近づいてくる相手に反撃させずに戦うことです。", [{ label: "スロウ", path: `${P.effects}#slow` }], "kite"),
    site("focus", "moba", "フォーカス", "チームで同じ相手を集中して攻撃することです。", [], "focus"),
    site("poke", "moba", "ポーク", "遠くから少しずつダメージを与えて、相手を弱らせることです。", [], "poke"),
    site("burst", "moba", "バースト", "短い時間に大きなダメージをまとめて与えることです。", [], "burst"),
    site("harass", "moba", "ハラス", "レーン戦で相手を撃って、ソウルを取りにくくさせることです。", [{ label: "レーン戦", path: `${P.match}#laning` }], "harass"),
    site("trade", "moba", "トレード", "レーン戦でダメージを与え合うことです。与えた量が受けた量より多ければ得をしたことになります。", [{ label: "レーン戦", path: `${P.match}#laning` }], "trade"),
    site("zoning", "moba", "ゾーニング", "相手を一定の範囲に入りにくくさせて、ソウルや場所を取らせないことです。", [], "zoning"),
    site("split-push", "moba", "スプリットプッシュ", "チームとは別のレーンを1人で押し、相手の人手を分けさせることです。", [], "split push"),
    site("jungle", "moba", "ジャングル", "レーンの外にある中立モンスターのいる場所のことです。Deadlock では中立キャンプやホーントがこれに当たります。", [{ label: "中立キャンプの数値", path: `${P.objects}#neutral` }], "jungle"),
    site("backdoor", "moba", "バックドア", "守る側のプレイヤーがいない間に建造物を攻撃することです。Deadlock の防衛建造物には、これを防ぐ保護があります。", [{ label: "全体像", path: `${P.beginner}#overview` }], "backdoor"),
    site("net-worth", "moba", "ネットワース", "そのプレイヤーが稼いだソウルの合計のことです。チームの有利不利を見る目安になります。", [{ label: "ソウルの仕組み", path: `${P.farm}#souls` }], "net worth"),
    site("respawn", "moba", "リスポーン", "倒されたあと、拠点で復活することです。試合が進むほど待ち時間が長くなります。", [], "respawn"),
    site("counter-pick", "moba", "カウンターピック", "相手のヒーローに強いヒーローを選ぶことです。", [{ label: "ヒーロー一覧", path: P.heroes }], "counter pick"),
    {
      ...site(
        "meta",
        "moba",
        "メタ",
        `その時点で強いとされ、多く使われているヒーローやビルドの傾向のことです。` +
          `また、相手に合わせて対策を取ることを「メタる」ともいいます。たとえば、${heroName(META_EXAMPLE.heroes[0]!)}や${heroName(META_EXAMPLE.heroes[1]!)}のように空中に浮くヒーローに対して、${itemName(META_EXAMPLE.item)}を買うことです。`,
        [
          { label: "ヒーロー一覧（使用状況）", path: P.heroes },
          { label: "相性（各ヒーローページの「強みと対策」）", path: P.heroes },
        ],
        "meta",
      ),
      related: { heroes: META_EXAMPLE.heroes, items: [META_EXAMPLE.item] },
    },
    site("aim", "moba", "エイム", "照準を相手に合わせることや、その上手さのことです。", [], "aim"),

    // ================= 略語 =================
    site("cc", "abbr", "CC", "相手の行動を止めたり制限したりする効果の総称です。スタン・サイレンス・移動不能などが当たります。", [{ label: "行動を止める効果", path: `${P.effects}#cat-control` }], "crowd control"),
    site("dps", "abbr", "DPS", "1秒あたりに与えるダメージのことです。", [{ label: "ビルドシミュレーター", path: P.build }], "damage per second"),
    site("hp", "abbr", "HP", "体力のことです。0になると倒されます。", [], "hit points"),
    site("cd", "abbr", "CD", "アビリティやアイテムを使ってから、次に使えるまでの待ち時間（クールダウン）のことです。", [], "cooldown"),
    site("ap", "abbr", "AP", "アビリティポイントのことです。アビリティの強化に使います。", [], "ability point"),
    site("aoe", "abbr", "AoE", "一定の範囲にまとめて効果を与えることです。", [], "area of effect"),
    site("dot", "abbr", "DoT", "一定時間、継続してダメージを与える効果のことです。", [{ label: "燃焼", path: `${P.effects}#burn` }], "damage over time"),
    site("ks", "abbr", "KS", "味方が削った相手に、横からとどめを刺してキルを取ることです。", [], "kill steal"),
    site("kda", "abbr", "KDA", "キル・デス・アシストの数、またはその比率のことです。", [], "kills / deaths / assists"),
    site("ttk", "abbr", "TTK", "相手を倒しきるまでにかかる時間のことです。", [], "time to kill"),
    site("ads", "abbr", "ADS", "武器を構えてズームすることです。", [{ label: "ズーム（キャラクターコントロール）", path: P.controls }], "aim down sights"),
    site("mmr", "abbr", "MMR", "マッチングに使われる、プレイヤーの実力の目安となる値のことです。", [], "matchmaking rating"),
    site("gg", "abbr", "GG", "試合の終わりにお互いをたたえるあいさつです。", [], "good game"),
  ];

  // ================= 状態異常・効果(状態異常・効果ページの定義から自動で作る) =================
  const effectDesc = L().effects.desc as Record<string, string>;
  for (const { def, abilities, items } of effectIndex()) {
    const more = Math.max(0, abilities.length - RELATED_MAX) + Math.max(0, items.length - RELATED_MAX);
    entries.push({
      id: def.id,
      category: "effect",
      term: effectName(def),
      desc: effectDesc[def.id] ?? "",
      source: "site",
      links: [
        {
          label: `持っているスキル・アイテム（スキル ${abilities.length}・アイテム ${items.length}）${more > 0 ? "の一覧" : ""}`,
          path: `${P.effects}#${def.id}`,
        },
      ],
      related: {
        abilities: abilities.slice(0, RELATED_MAX).map((r) => r.abilityKey),
        items: items.slice(0, RELATED_MAX).map((r) => r.item.id),
      },
    });
  }
  return entries;
}
