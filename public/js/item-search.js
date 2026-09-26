/*
 * アイテム検索の共通処理(アイテム一覧 /items/ とビルドページのショップで共用)。
 *
 * 入力語をそのまま部分一致させるだけでなく、次の2種類の広げ方をする。
 *
 * - 言い換え(SYNONYMS / ALIASES)… どれで検索しても同じ結果になる。直接ヒット扱い。
 *   ゲーム内の表記(スロウ・ディスアーム等)を別の言い方で探しても当たるようにする。
 * - 関連(GROUPS)… 個別の効果を調べた人に、その上位概念・下位概念に当たるアイテムも
 *   「関連」として見せる。例: サイレンスで調べると、デバフ全般への対策アイテム
 *   (デバフ耐性・デバフ解除など)も関連として出る。
 *   「デバフ」という語をそのまま広げると、自分がデバフを付ける側のアイテム
 *   (スピリットシュレッダー等)まで混ざるので、関連の判定は対策を表す
 *   言い回し(phrases)で行う。
 *
 * ここは検索のヒット条件だけを決める辞書で、画面の表記は一切変えない
 * (表示はゲーム内の日本語のまま)。語を足すときは、実際の説明文に
 * その言い回しがあるかを /items/ で確かめてから足す。
 */
(() => {
  /** 言い換え。グループ内のどれで検索しても、全部の語で探す */
  const SYNONYMS = [
    ["スロウ", "減速"],
    ["ディスアーム", "武装解除"],
    ["デバフ", "状態異常"],
    ["スタン", "気絶"],
    ["ステルス", "透明", "不可視"],
    ["回復", "ヒール", "治癒"],
    ["hp", "体力", "ヘルス"],
  ];

  /** 片方向の言い換え。左の語で検索したときだけ右の語に置き換える(短い英字は誤爆するため) */
  const ALIASES = {
    cd: ["クールダウン"],
    ct: ["クールダウン"],
    cc: ["スタン", "サイレンス", "スロウ", "ディスアーム", "睡眠", "束縛", "移動不能"],
  };

  /**
   * 関連。members のどれかで検索したとき、phrases のどれかを含むアイテムを関連として出す。
   * label はヒット件数の横と、カードの「関連」印のツールチップに出る。
   */
  const GROUPS = [
    {
      label: "デバフ対策",
      members: ["サイレンス", "スロウ", "スタン", "ディスアーム", "睡眠", "束縛", "移動不能", "デバフ", "状態異常"],
      phrases: [
        "デバフ耐性",
        "デバフをすべて解除",
        "デバフは軽減",
        "状態異常の継続時間",
        "状態異常を一時的に抑制",
      ],
    },
    {
      label: "デバフの種類",
      members: ["デバフ", "状態異常"],
      phrases: ["サイレンス", "スロウ", "スタン", "ディスアーム", "睡眠", "束縛", "移動不能"],
    },
  ];

  /** 全角英数→半角、ひらがな→カタカナ、小文字化。検索語と対象文字列の両方にかける */
  function norm(s) {
    return String(s)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  }

  const synOf = new Map();
  for (const g of SYNONYMS) {
    const ng = g.map(norm);
    for (const w of ng) synOf.set(w, ng);
  }
  const groups = GROUPS.map((g) => ({
    label: g.label,
    members: new Set(g.members.flatMap((m) => synOf.get(norm(m)) ?? [norm(m)])),
    phrases: g.phrases.map(norm),
  }));

  /** 1語ぶんの探し方: 直接当てる語の一覧と、関連として当てる語の一覧 */
  function compileWord(w) {
    const terms = ALIASES[w] ? ALIASES[w].map(norm) : synOf.get(w) ?? [w];
    const related = [];
    for (const g of groups) {
      if (terms.some((t) => g.members.has(t))) related.push(g);
    }
    return { terms, related };
  }

  window.itemSearch = {
    /** 対象文字列(名前・説明・内部ID)を検索用に整える。行ごとに1回だけ呼ぶ */
    prepare: norm,

    /** 入力欄の値を検索条件にする。空なら null */
    compile(q) {
      const words = norm(q).trim().split(/\s+/).filter(Boolean);
      return words.length === 0 ? null : words.map(compileWord);
    },

    /**
     * 1件を判定する。
     * - null … 当たらない
     * - []   … 直接ヒット
     * - ["デバフ対策", …] … 関連ヒット(当たった関連の名前)
     * 複数語はすべての語が(直接か関連で)当たったものだけ残す。
     */
    match(compiled, hay) {
      const labels = [];
      for (const w of compiled) {
        if (w.terms.some((t) => hay.includes(t))) continue;
        const g = w.related.find((g) => g.phrases.some((p) => hay.includes(p)));
        if (!g) return null;
        if (!labels.includes(g.label)) labels.push(g.label);
      }
      return labels;
    },

    /** ヒット件数の表示文。例: 「8 件 ＋ 関連 4 件(デバフ対策)」 */
    summary(direct, related, labels, total) {
      let s = `${direct}${total ? ` / ${total}` : ""} 件`;
      if (related > 0) s += ` ＋ 関連 ${related} 件(${[...labels].join("・")})`;
      return s;
    },
  };
})();
