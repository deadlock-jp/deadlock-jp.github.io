/**
 * 攻略ページ(日本語)の本文から、用語集(/mechanics/glossary/)への自動リンク。
 * src/middleware.ts がビルド時にページの HTML を受け取ってリンクを埋め込む(開いたときに JS で書き換えない)。
 * 本文の文章は変えず、用語に <a> を被せるだけ。
 *
 * ■ 規則
 *   - 対象は <main> の中だけ。見出し・表・既存のリンク・ボタン・コード・キャプション・ナビ・ラベル・
 *     用語の見出し(dt)・フォームの中には付けない
 *   - 用語ごとに、そのページで最初に出てきた1回だけ
 *   - 長い語を先に当てる(「スピリットパワー」を「スピリット」より先に)
 *   - 語の前後が同じ種類の文字(カタカナ・漢字・英数字)なら当てない。
 *     「スタンバースト」の中の「バースト」や、「キャリーカート」の中の「キャリー」を拾わないため
 *   - data/glossary-autolink-exclude.json の語は当てない
 * ■ 見た目
 *   点線の下線(.glink、src/styles/global.css)。title に用語集の説明の1文目を出す
 */
import excludeJson from "../../data/glossary-autolink-exclude.json" with { type: "json" };
import { glossary } from "./glossary.ts";

/** 自動リンクを付けるページ(base を除いたパス。日本語版のみ) */
export const GLOSSARY_LINK_PAGES = new Set([
  "/mechanics/beginner/",
  "/mechanics/match/",
  "/mechanics/farm/",
  "/mechanics/objects/",
  "/mechanics/controls/",
  "/mechanics/effects/",
]);

/** この中のテキストにはリンクを付けない要素 */
const SKIP_TAGS = new Set([
  "a", "h1", "h2", "h3", "h4", "h5", "h6", "table", "button", "code", "pre", "kbd", "figcaption",
  "script", "style", "nav", "select", "option", "label", "textarea", "svg", "dt", "summary", "template", "title",
]);
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

type CharClass = "kata" | "kanji" | "latin" | "other";
function charClass(ch: string | undefined): CharClass {
  if (!ch) return "other";
  if (/[゠-ヿㇰ-ㇿｦ-ﾟ]/.test(ch)) return "kata"; // カタカナ・長音
  if (/[一-鿿㐀-䶿々]/.test(ch)) return "kanji";
  if (/[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/.test(ch)) return "latin";
  return "other";
}

interface Term {
  term: string;
  id: string;
  tip: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let termsCache: Term[] | null = null;
function terms(): Term[] {
  if (termsCache) return termsCache;
  const excluded = new Set((excludeJson as { terms: string[] }).terms);
  const seen = new Set<string>();
  termsCache = glossary()
    .filter((e) => !excluded.has(e.term))
    .filter((e) => (seen.has(e.term) ? false : (seen.add(e.term), true)))
    .map((e) => {
      // 説明の1文目(「。」まで)
      const first = e.desc.split("。")[0];
      return { term: e.term, id: e.id, tip: first ? `${first}。` : e.desc };
    })
    .sort((a, b) => b.term.length - a.term.length);
  return termsCache;
}

/** 語の前後の文字が、語の端の文字と同じ種類なら当てない */
function boundaryOk(text: string, start: number, term: string): boolean {
  const first = charClass(term[0]);
  const last = charClass(term[term.length - 1]);
  const before = charClass(text[start - 1]);
  const after = charClass(text[start + term.length]);
  return !(first !== "other" && before === first) && !(last !== "other" && after === last);
}

/**
 * HTML に自動リンクを付ける。戻り値はリンクを付けた HTML と、付けた語の一覧(確認用)。
 * base はサイトの BASE_URL(末尾の / なし)
 */
export function addGlossaryLinks(html: string, base: string): { html: string; linked: string[] } {
  const all = terms();
  const used = new Set<string>();
  const linked: string[] = [];
  /*
   * 開いている要素をすべて積み、それぞれが「この中は付けない」要素かを持つ。
   * data-noautolink を付けた div の中に div が入れ子になっていても、正しく範囲を追えるようにするため
   */
  const stack: { tag: string; skip: boolean }[] = [];
  let skipDepth = 0;
  let inMain = false;
  let out = "";

  for (const m of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    const tok = m[0];
    if (tok.startsWith("<")) {
      out += tok;
      if (tok.startsWith("<!--")) continue;
      const tag = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(tok)?.[1]?.toLowerCase();
      if (!tag) continue;
      const closing = tok.startsWith("</");
      if (tag === "main") inMain = !closing;
      if (closing) {
        // 対応する開きタグまで戻る(閉じ忘れの要素があっても崩れないように)
        let i = stack.length - 1;
        while (i >= 0 && stack[i]!.tag !== tag) i--;
        if (i >= 0) {
          for (const e of stack.splice(i)) if (e.skip) skipDepth--;
        }
      } else if (!VOID_TAGS.has(tag) && !tok.endsWith("/>")) {
        const skip = SKIP_TAGS.has(tag) || /\sdata-noautolink\b/.test(tok);
        stack.push({ tag, skip });
        if (skip) skipDepth++;
      }
      continue;
    }
    if (!inMain || skipDepth > 0) {
      out += tok;
      continue;
    }
    // テキスト: まだ使っていない語のうち、最も手前に出てくるものから順に当てる(同じ位置なら長い語)
    let text = tok;
    let result = "";
    for (;;) {
      const remaining = all.filter((x) => !used.has(x.term));
      if (remaining.length === 0) break;
      const re = new RegExp(remaining.map((x) => reEsc(x.term)).join("|"), "g");
      let hit: { index: number; t: Term } | null = null;
      for (const mm of text.matchAll(re)) {
        const t = remaining.find((x) => x.term === mm[0])!;
        if (boundaryOk(text, mm.index!, t.term)) {
          hit = { index: mm.index!, t };
          break;
        }
      }
      if (!hit) break;
      used.add(hit.t.term);
      linked.push(hit.t.term);
      result +=
        text.slice(0, hit.index) +
        `<a class="glink" href="${base}/mechanics/glossary/#${hit.t.id}" title="${esc(hit.t.tip)}">${hit.t.term}</a>`;
      text = text.slice(hit.index + hit.t.term.length);
    }
    out += result + text;
  }
  return { html: out, linked };
}
