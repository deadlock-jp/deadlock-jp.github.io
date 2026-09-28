/**
 * 日本語以外のページ(/en/ /ko/ /zh-cn/)で使う絞り込み。
 *
 * 日本語版の item-search.js と同じ形(window.itemSearch の prepare / compile / match / summary)
 * を持つが、日本語の言い換え・関連語の辞書は使わない。検索対象の文字列(その言語の名前・英語名・
 * 説明・内部ID)に、空白で区切ったすべての語が含まれるものを残すだけ。
 *
 * 件数の表示文は、読み込み元の <script data-summary='{"hits": "...", "hitsOfTotal": "..."}'>
 * から受け取る({n} = 件数、{total} = 全件)。
 */
(() => {
  const own = document.currentScript;
  let text = { hits: "{n}", hitsOfTotal: "{n} / {total}" };
  try {
    text = { ...text, ...JSON.parse(own?.dataset.summary || "{}") };
  } catch {
    /* 文言が読めなくても件数は出す */
  }

  /** 全角→半角・小文字化。検索語と対象文字列の両方にかける */
  function norm(s) {
    return String(s).normalize("NFKC").toLowerCase();
  }

  window.itemSearch = {
    prepare: norm,

    /** 入力欄の値を検索条件にする。空なら null */
    compile(q) {
      const words = norm(q).trim().split(/\s+/).filter(Boolean);
      return words.length === 0 ? null : words;
    },

    /** 当たれば [](直接ヒット)、当たらなければ null。関連ヒットは無い */
    match(compiled, hay) {
      return compiled.every((w) => hay.includes(w)) ? [] : null;
    },

    /** ヒット件数の表示文 */
    summary(direct, _related, _labels, total) {
      const t = total ? text.hitsOfTotal : text.hits;
      return t.replace("{n}", String(direct)).replace("{total}", String(total));
    },
  };
})();
