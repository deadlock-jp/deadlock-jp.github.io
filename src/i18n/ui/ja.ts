/**
 * UI 文言の辞書(日本語・原本)。
 *
 * ほかの言語(en.ts / ko.ts / zh-cn.ts)はこのオブジェクトと同じ形(`Dict`)を満たす。
 * キーの抜けは npm run typecheck で分かる。
 *
 * - ゲームのローカライズのトークンで引ける語は、ここに書かない(src/i18n/terms.ts)。
 *   gameTerms にあるのは、トークンが見つからなかったゲーム用語だけ。
 * - 関数になっているものは、数や名前を差し込む文。語順が言語ごとに違うので、
 *   組み立ては各言語の関数に任せる。
 * - clientXxx はブラウザ側の JS に渡す文言(関数は渡せないので "{n}" の差し込み書式)。
 */
import propertyLabelsJson from "../../../data/property-labels.json" with { type: "json" };

export const ja = {
  site: {
    /** 既定の meta description */
    description:
      "Valve『Deadlock（デッドロック）』のヒーロー・アイテム・スキルの数値を日本語で引ける非公式データベース。",
    /** 構造化データ WebSite の alternateName */
    ldAlternateName: "Deadlock 日本語データベース",
    ldDescription:
      "Deadlock（デッドロック）のヒーロー・アイテム・スキルの数値を日本語で引けるデータベースとビルドシミュレーター。数値はゲームの生データから自動生成した非公式ファンサイト。",
    /** 構造化データ VideoGame の alternateName。空なら出さない */
    gameAltName: "デッドロック",
    /** 共通 OGP 画像の alt(「DEADLOCK-JP DB — 」の後ろ) */
    ogAlt: "Deadlock 日本語データベース",
    crumbTop: "トップ",
  },
  nav: {
    heroes: "ヒーロー",
    items: "アイテム",
    build: "ビルド",
    mechanics: "攻略情報",
    patchNotes: "パッチノート",
  },
  footer: {
    /** ClientVersion の番号の前後 */
    sourceBefore: "データ出典: ゲーム本体クライアントから直接抽出 (ClientVersion ",
    sourceAfter: ")。数値はゲームの生データから自動抽出しています。",
    disclaimer:
      "本サイトはファンによる非公式サイトで、Valve Corporation とは関係がなく、許諾も受けていません。 『Deadlock』および本サイトが表示するデータ・画像・テキストの著作権は Valve Corporation に帰属します。",
    about: "このサイトについて",
    support: "サーバー代のカンパ",
  },
  /** 日本語版にしか無いページへのリンク・日本語のままの補足メモに添える印(日本語版では出さない) */
  jaOnly: "日本語のみ",
  /** この辞書の言語の lang 属性値(lang="ja" の中にページの言語の文言を置くときに使う) */
  langTag: "ja",
  langSwitch: {
    /** 切り替えボタンの読み上げ名 */
    label: "言語を切り替える",
    /** 日本語のみのページで、各言語の横に添える注記(その言語の辞書の文言を使う) */
    jaOnlyPage: "このページは日本語のみ",
  },
  common: {
    noDesc: "（説明なし）",
    memo: "メモ",
    related: "関連",
    tier: (n: number | string) => `ティア${n}`,
    ultimate: "アルティメット",
    heroNotSelected: "ヒーロー未選択",
    /** 一覧に並べる名前の区切り */
    listSep: "、",
    /** 「武器・ティア1・800ソウル」のような短い項目の区切り */
    dot: "・",
    /** 値の単位 */
    sec: "秒",
    minute: "分",
    /** m/秒(ヒーロー一覧・ティア表) */
    mpsShort: "m/秒",
    /** m／秒(ステータス欄・バランス調整) */
    mps: "m／秒",
    shotsPerSec: "発/秒",
    perLv: "/Lv",
    /** 距離の単位(ゲームの表記。中国語は「米」) */
    meter: "m",
    /** ホバー時の title「ヒーロー名｜スキル名」の区切り */
    titleSep: "｜",
    radarChart: "レーダーチャート",
  },
  /** ゲームのローカライズにトークンが見つからなかったゲーム用語 */
  gameTerms: {
    headshotMultiplier: "ヘッドショット倍率",
    crouchSpeed: "しゃがみ速度",
    weaponPower: "武器パワー",
    reloadSpeed: "リロード速度",
    falloffStart: "減衰開始",
    falloffEnd: "減衰終了",
    range: "射程",
    skillScale: "スキル係数",
    skillSpiritScale: "スキルのスピリット係数",
    altFireBulletDamage: "サブ射撃1発ダメージ",
    attackRange: "攻撃射程",
    groundDashDistance: "地上ダッシュ距離",
    groundDashDuration: "地上ダッシュ時間",
    airDashDistance: "空中ダッシュ距離",
    airDashDuration: "空中ダッシュ時間",
    damage: "ダメージ",
    price: "価格",
    slotCost: "枠",
    growth: "成長度",
    /** 主武器の生の数値(ability.weapon)。ゲーム側にトークンが無いもの */
    weaponFields: {
      bulletsPerShot: "1トリガーの弾数",
      cycleTime: "発射間隔",
      range: "射程",
      burstShotCount: "バースト弾数",
      burstShotCooldown: "バースト間隔",
      "falloff.startRange": "減衰開始距離",
      "falloff.endRange": "減衰終了距離",
      "falloff.startScale": "減衰開始倍率",
      "falloff.endScale": "減衰終了倍率",
      "falloff.bias": "減衰カーブ",
      "crit.bonusStart": "ヘッドショット倍率",
      "crit.bonusEnd": "ヘッドショット倍率(遠距離)",
      "crit.startRange": "ヘッドショット減衰開始",
      "crit.endRange": "ヘッドショット減衰終了",
      "crit.bonusAgainstNPCs": "対NPCヘッドショット倍率",
      spread: "拡散",
      standingSpread: "静止時の拡散",
    },
  },
  /**
   * ゲーム側にどの言語の表示名も無いプロパティの名前。
   * 日本語は data/property-labels.json が原本(このファイルはそれを読むだけ)。
   */
  propertyLabels: propertyLabelsJson.labels,
  /** ヒーロー一覧・ティア表の項目名の組み立て */
  rank: {
    /** 「リロード(速い順)」のような補足付きの項目名 */
    withNote: (label: string, note: string) => `${label}(${note})`,
    fasterFirst: "速い順",
    /** 「武器ダメージ成長/Lv」 */
    growthPerLv: (label: string) => `${label}成長/Lv`,
    boonHp: "HP成長",
    boonWeapon: "武器成長",
    boonSpirit: "スピリット成長",
  },
  adjust: {
    kind: {
      buff: "バフ",
      nerf: "ナーフ",
      mixed: "混在",
      neutral: "調整",
      rework: "リワーク",
    },
    baseStats: "基礎ステータス",
    mainWeapon: "主武器",
    components: "構成素材",
    /** 「(AP強化の)〜のスピリット倍率」 */
    spiritScale: (label: string) => `${label}のスピリット倍率`,
    /** アイテムの upgrades(ストリートブロウルのエンハンスド版のボーナス)の項目名 */
    enhanced: (label: string, enhanced: string) => `${enhanced}時の${label}`,
    system: "システム全体の調整",
    tagBase: "基礎",
    deleted: "削除",
    added: "(新規)",
    /** 変更前の値を括弧で添える */
    before: (text: string) => `(${text})`,
    more: (n: number) => `ほか ${n} 件`,
    /** アップデートの題(日本語版は公式ノートの題をそのまま出すので、ほかの言語でだけ使う) */
    minorUpdate: "マイナー アップデート",
    initialImport: "初回データ取り込み",
    update: "アップデート",
    historyTitle: "バランス調整",
    historyNote:
      "ゲームデータの差分から自動生成しています。公式の文面に無い変更も含みます。 サーバー側だけの調整はここに出ないことがあります。",
  },
  /** トップページ(src/pages/index.astro) */
  top: {
    /** <title> と パンくず。トップは <title> がサイト名だけになる */
    title: "トップ",
    description:
      "Deadlock（デッドロック）のヒーロー・アイテム・スキルの数値を日本語で引ける非公式データベース。ヒーローの基礎ステータス、ショップアイテムの効果と価格、スキルのダメージとスピリット係数を、ゲームの生データから自動生成。ビルドシミュレーターつき。",
    h1: "DEADLOCK 日本語データベース",
    seeAll: "一覧を見る →",
    allUpdates: "すべてのアップデート →",
    seeReference: "リファレンスを見る →",
    map: "マップ",
    mapLead: "キャンプ・箱・黄金像・橋バフの位置。拡大と、地上・地下の切り替えができます。",
    /** マップ改修(2026-09-29)で最新の地図を描けない間、地図の代わりに出す */
    mapRenovating: "マップ改修に対応中です",
    laning: "レーン戦",
    farming: "ファーミング",
    lategame: "終盤",
    controls: "キャラクターコントロール",
  },
  /** ヒーロー一覧(src/pages/heroes/index.astro) */
  heroes: {
    title: "ヒーロー一覧",
    description:
      "Deadlock（デッドロック）の実装済みヒーロー全員の基礎ステータス（最大HP・移動速度・スタミナ）とスキル、項目別ステータスランクを日本語で。レベル1・アイテムなしの素の数値。",
    usage: "使用状況",
    rankBand: "ランク帯",
    allRanks: "全ランク",
    /** ゲームにランク名のトークンが無いときの代わり */
    rankN: (n: number) => `ランク${n}`,
    pickRate: "ピック率",
    winRate: "勝率",
    banRate: "BAN率",
    statusRank: "ステータスランク",
    metric: "項目",
    list: "一覧",
    searchPlaceholder: "ヒーロー名・スキルの効果で絞り込む(例: サイレンス)",
    searchAria: "ヒーローの絞り込み",
    legendBase: "基本の効果",
    legendUp: "AP強化で付く効果",
    /** 絞り込み件数(検索スクリプトの「N 件」)の単位をヒーロー用に言い換える */
    countFrom: "件",
    countTo: "人",
    tierEmpty: "該当なし",
    /** {n} 試合数 / {date} 取得日 */
    statsNote: "直近30日 / {n}試合 / {date}時点。",
    banNote: "BAN率は{note}。",
    lowSample: "　※このランク帯は母数が少なく、数値がぶれます。",
    /** BAN率の注記(日本語版は data/hero-stats.json の banRateNote をそのまま使う) */
    banRateNote: "",
  },
  /** ビルドシミュレーター(src/pages/build/index.astro) */
  build: {
    title: "ビルドシミュレーター",
    description: "アイテムを選んでビルドを組み、URLで共有する",
    hero: "ヒーロー",
    choose: "選択してください",
    saveLoad: "保存 / 呼び出し",
    saveImage: "画像を保存",
    compare: "バージョン比較",
    clear: "クリア",
    buildName: "ビルド名",
    buildNamePlaceholder: "例: 序盤スピリット型（画像にも載ります）",
    save: "＋ 保存",
    slotNote:
      "枠のアイコンをタップすると外れます。ショップはタップで詳細、もう一度タップで追加します。 枠はゲームと同じく12個です。",
    spiritImpact: "スピリットパワーの影響値",
    invested: "投資額",
    totalStats: "合計ステータス",
    all: "すべて",
    sort: "並び替え",
    popularity: "人気率",
    /** ショップのカードに出す短い表記 */
    pickShort: "人気",
    shopSearchAria: "ショップのアイテムを絞り込む",
    /** ブラウザ側の JS に渡す文言。{n} などは差し込み位置 */
    client: {
      copyUrl: "共有URLをコピー",
      copied: "コピーしました",
      savedEmpty: "まだ保存がありません。ビルドを組んで「＋ 保存」を押すと、この端末にだけ残ります。",
      untitled: "（無題）",
      /** 保存一覧の「3個 / 4,800」 */
      savedMeta: "{n}個 / {souls}",
      load: "呼び出し",
      del: "削除",
      nothingToSave: "保存するものがありません",
      saveLimit: "保存は{n}件までです。古いものを削除してください",
      saveFailed: "保存できませんでした（保存領域がいっぱいの可能性）",
      saved: "保存しました",
      /** 名前を付けずに保存したときの名前 */
      defaultLabel: "{name} {n}個",
      buildWord: "ビルド",
      cellTitle: "{name}（{cost}ソウル） — クリックで外す",
      pickHero: "ヒーローを選ぶと表示されます",
      weaponPct: " / 武器 +{n}%",
      falloff: "減衰",
      spiritBreakdown: "レベル {level} + 購入ボーナス {bonus} + アイテム {items}",
      base: "基礎",
      flat: "平坦",
      noDamage: "ダメージなし",
      sample: "サンプル {n}試合",
      sampleLow: "サンプル {n}試合(少ないため参考値)",
      itemValue: "アイテム価値",
      creating: "作成中…",
      createFailed: "作成できませんでした",
    },
  },
  /** 日本語以外の検索(public/js/item-search-intl.js)の件数表示。{n} 件数・{total} 全件 */
  search: {
    hits: "{n} 件",
    hitsOfTotal: "{n} / {total} 件",
  },
  /** アイテム一覧(src/pages/items/index.astro) */
  items: {
    title: "アイテム一覧",
    description: "Deadlockのショップアイテムの効果と価格",
    searchPlaceholder: "アイテム名・効果で絞り込む",
    searchAria: "アイテムの絞り込み",
    /** 「ストリートブロウルのランダムビルドドラフトに出現」。モード名はゲームのトークン */
    legendaryNote: (streetBrawl: string) => `${streetBrawl}のランダムビルドドラフトに出現`,
  },
  /** アイテム詳細(src/pages/items/[id].astro) */
  itemPage: {
    metaDesc: (a: {
      name: string;
      category: string | null;
      tier: number;
      legendary: { streetBrawl: string; legendary: string } | null;
      cost: string;
      slotCost: number;
      passives: string;
    }) =>
      `Deadlock（デッドロック）のアイテム「${a.name}」の効果・強化を日本語で。` +
      `${a.category ? a.category + "・" : ""}ティア${a.tier}` +
      (a.legendary ? `／${a.legendary.streetBrawl}の${a.legendary.legendary}` : `／${a.cost}ソウル／枠${a.slotCost}`) +
      "。" +
      (a.passives ? `常時パッシブ: ${a.passives}。` : ""),
    back: "← アイテム一覧",
    /** 「レジェンダリー（ストリートブロウル）」 */
    legendaryFact: (legendary: string, streetBrawl: string) => `${legendary}（${streetBrawl}）`,
    slotCost: (n: number) => `枠 ${n}`,
    passivesNote: "装備するだけで常に乗る効果。ビルドの合計ステータスに加算されるのはこれだけです。",
    conditional: "条件付きの効果",
    conditionalNote: "発動条件があるため、合計ステータスには加算していません。",
    enhancedLead: (streetBrawl: string, enhanced: string) =>
      `${streetBrawl}限定で、アイテムが確率で強化状態（${enhanced}）になって手に入ることがある。 アビリティのようなスキルポイントによる段階的な強化ではなく、以下の効果がまとめて1回だけ乗る。`,
    related: "関連アイテム",
    usedIn: "これを素材にするアイテム",
    /** 後ろに内部IDの <code> が続く */
    internalId: "内部ID ",
  },
  /** スキル詳細(src/pages/abilities/[id].astro) */
  abilityPage: {
    metaDesc: (name: string, heroName: string) =>
      `Deadlock（デッドロック）のスキル「${name}」（${heroName}）の効果・数値・アップグレード・バランス調整を日本語で。`,
    /** 変身後の形態でだけ持つスキル(今のところシルバーの人狼形態のみ) */
    altForm: (heroName: string) => `人狼形態(${heroName})のスキルです`,
  },
  /** ヒーロー詳細ページ(src/pages/heroes/[id].astro・HeroStrip.astro) */
  heroPage: {
    switchHero: "ヒーローを切り替え",
    metaDesc: (name: string, hp: number | undefined, move: number | undefined, tags: string[], skills: string[]) =>
      `Deadlock（デッドロック）のヒーロー「${name}」の基礎ステータス・スキル・レベル成長を日本語で。` +
      `最大HP ${hp}／移動速度 ${move}m。` +
      (tags.length ? `特徴: ${tags.join("・")}。` : "") +
      (skills.length ? `スキル: ${skills.join("・")}。` : ""),
    back: "← ヒーロー一覧",
    stats: "ステータス",
    growthRadar: "成長度／Lv",
    misc: "その他",
    extraGrowth: (list: string) => `このヒーローは成長度の4項目に加えて、レベルごとに${list}も上がります。`,
    skills: "スキル",
    /** 変身の切り替えボタン。ゲームのトークン(ability_header_human 等)が無いときだけ使う */
    formHuman: "人間時",
    formWerewolf: "人狼時",
  },
  /** ヒーローのホバーカード(HeroHoverCard.astro) */
  heroCard: {
    growthSpirit: "成長/スピリット",
    /** 「成長が高い: 」の後ろに太字で項目が続く */
    boonHigh: "成長が高い: ",
  },
  /** アイテムのホバーカード(ItemHoverCard.astro・ビルド画面)。{n} は数値 */
  itemCard: {
    cost: "{n}ソウル",
    slotCost: "枠{n}",
    passives: "常時パッシブ",
    conditional: "条件付き",
  },
  /** ヒーロー詳細の「強みと対策」(src/lib/matchup.ts・HeroMatchup.astro) */
  matchup: {
    title: "強みと対策",
    features: "特徴",
    noStandout: "突出した軸はありません。上位3軸を出しています",
    standout: "全38体の中で上位12.5%に入る軸",
    topPercent: (n: number) => `上位${n}%`,
    sharesLabel: "よく積まれるアイテム",
    counters: "対策",
    countersNote: "スキルの中身と実際のビルド構成から",
    why: "根拠: ",
    manualTag: "手動タグ",
    foot: "全ヒーロー中の順位・スキルの数値・実際のビルドの構成比から機械的に出しています。",
    method: "算出方法",
    evidenceHealing: (abilities: string, pool: number, top: number) =>
      `${abilities}（回復を持つ${pool}体中 上位${top}%）`,
    /** cc はゲームの状態異常名を並べたもの。日本語版は以前からの表記(スタン・睡眠・拘束)のまま */
    evidenceCc: (_cc: string, seconds: string, pool: number, top: number) =>
      `スタン・睡眠・拘束 合計 ${seconds}秒（${pool}体中 上位${top}%）`,
    evidenceComposition: (slot: string, percent: number, pool: number, top: number) =>
      `${slot}構成比 ${percent}%（全${pool}体中 上位${top}%）`,
    /** 日本語は data/matchup-rules.json が原本なので空。ほかの言語はルールIDごとに title と why を持つ */
    rules: {} as Record<string, { title: string; why: string }>,
  },
  compare: {
    title: "ビルド比較",
    description: "Deadlock（デッドロック）のビルドを、パッチ間の数値差分で比較する。",
    back: "← ビルドに戻る",
    /** 「ビルドシミュレーター」へのリンクを挟む前後 */
    noBuildBefore: "比較するビルドがありません。",
    noBuildAfter: "でヒーローとアイテムを選んでから、このページへの導線を使ってください。",
    missing:
      "⚠ 一部のアイテムは OLDER 側のバージョンに存在しません(未実装または削除済み)。 該当アイテムはグレーアウトし、合計値には含めていません。",
    caveat:
      "表示しているのはクライアント側のデータです。サーバー側だけで調整された変更は、 ここには反映されないことがあります。",
    client: {
      /** 「Lv12・4,800ソウル」 */
      verInfo: "Lv{lv}・{souls}ソウル",
    },
    /** 公式アップデートに結び付かない版の表示名 */
    snapshotLabel: (version: string, date: string | null) => `build ${version}${date ? `・${date} 抽出` : ""}`,
  },
  /** システム全体の調整(economy.json)の表示名。建造物・オブジェクトの名前はトークンから引く */
  economy: {
    bucket: {
      objective: "建造物破壊のソウル",
      kill: "キルのソウル分配",
      rift: "不安定な裂け目のカムバック",
      breakable: "破壊可能オブジェクトの出現",
    },
    /** 「ガーディアン（Tier1）」 */
    withTier: (name: string, tier: string) => `${name}（${tier}）`,
    patronPhase1: "第1形態",
    nearSplit: "破壊に関わった付近のプレイヤーへの配分率",
    goldKill: (name: string) => `${name}を破壊した際のソウル`,
    goldOrbs: (name: string) => `${name}のオーブ配分`,
    trooperShare: (trooper: string, n: string) => `${trooper}キルの取り分（${n}人絡んだ場合）`,
    heroShare: (n: string) => `ヒーローキルの取り分（${n}人絡んだ場合）`,
    rejuvBuff: (rejuv: string) => `${rejuv}のバフ持続時間`,
    rejuvWarn: (rejuv: string) => `${rejuv}消滅の警告タイミング`,
    rejuvTrooperHp: (rejuv: string, trooper: string, n: string) => `${rejuv}中の${trooper}HP倍率（${n}段目）`,
    rejuvRespawn: (rejuv: string, n: string) => `${rejuv}保持中のリスポーン時間倍率（${n}段目）`,
    rift: {
      bounty: "劣勢時のボーナス賞金",
      techResist: "スピリット耐性（一律）",
      bulletResist: "弾薬耐性（一律）",
      statusResist: "状態異常耐性（一律）",
      resistMaxAtStart: "耐性上限（試合開始時）",
      resistMaxPerMinute: "耐性上限の増加（1分ごと）",
      resistMaxCap: "耐性上限の頭打ち",
    } as Record<string, string>,
    breakableInitial: (n: string) => `破壊可能オブジェクトの初回出現（配置${n}）`,
    breakableRespawn: (n: string) => `破壊可能オブジェクトの再出現間隔（配置${n}）`,
  },
};

export type Dict = typeof ja;
