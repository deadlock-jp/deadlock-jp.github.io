/**
 * 自前で配信するフォント(Noto Sans JP・JetBrains Mono・Cinzel)を、サイトで使う文字だけに絞って作る。
 * npm run build の後に自動で走る(package.json の postbuild)。日本語・英語ページが読む(韓国語・中国語ページは Google Fonts のまま)。
 *
 * ■ 元のフォント
 *   fonts/ の可変フォント(google/fonts の ofl/ から取得したもの。SIL Open Font License。ライセンス文も同じ場所)。
 *   太さはここで固定の太さに取り出す(静的)。可変のまま出すと、CSS の 600 が本当に 600 で描かれて見た目が変わる
 *   (以前の Google Fonts は 400/500/700 だけを読み、600 は 700 で描かれていた)。
 * ■ 文字の集め方
 *   ビルド後の dist/ のうち、日本語・英語ページの HTML、JSON(ホバーカード等)、JS、CSS に出てくる文字すべて
 *   (&#x..; や \uXXXX も戻して数える)。さらに ASCII・全角英数・かな・よく使う記号は常に入れる。
 * ■ 分け方(unicode-range)
 *   全部を1ファイルにすると1太さ約310KBになり、どのページも全部読むことになる。
 *   多くのページ(30%以上)で使う文字とトップページの文字・常に入れる文字を「基本」に、残りを使われる頻度の順に
 *   SLICE_SIZE 字ずつの「追加」に分け、unicode-range でページに出る文字のファイルだけを読ませる(Google Fonts と同じ方式)。
 * ■ 出力
 *   dist/fonts/ に woff2(名前に中身のハッシュ)、fonts.css(@font-face)、ライセンス文。
 *   HTML の preload のプレースホルダ(__FONT_PRELOAD_NOTO400__)を、基本・400 のファイル名に置き換える。
 *   開発用に public/fonts/ にも同じものを写す(gitignore 済み)。
 * ■ 安全装置
 *   最後に、作った woff2 を実際に読み直して、dist/ の文字のうち元のフォントにある文字が全部入っているかを確かめる。
 *   1文字でも欠けていればビルドを失敗させる(本番は前回のまま残る。欠けたまま公開して豆腐を出すよりよい)。
 *   元のフォントにそもそも無い文字(絵文字など)は、以前と同じく端末の書体で出る。件数だけ表示する。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import fontverter from "fontverter";
import { Blob as HbBlob, Face as HbFace } from "harfbuzzjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const outDir = path.join(dist, "fonts");
const devDir = path.join(root, "public/fonts");
const SLICE_SIZE = 100;
const CORE_PAGE_SHARE = 0.3;

/** 配信する書体。family は CSS の名前、weights は配信する太さ */
const FAMILIES = [
  { family: "Noto Sans JP", file: "NotoSansJP[wght].ttf", slug: "noto-sans-jp", weights: [400, 500, 700], slice: true, license: "OFL-NotoSansJP.txt" },
  { family: "JetBrains Mono", file: "JetBrainsMono[wght].ttf", slug: "jetbrains-mono", weights: [400, 500], slice: false, license: "OFL-JetBrainsMono.txt" },
  { family: "Cinzel", file: "Cinzel[wght].ttf", slug: "cinzel", weights: [700], slice: false, license: "OFL-Cinzel.txt" },
];

/** 常に入れる文字: ASCII・全角英数・かな・よく使う記号 */
const ALWAYS = (() => {
  const s = new Set();
  const add = (a, b) => { for (let c = a; c <= b; c++) s.add(String.fromCodePoint(c)); };
  add(0x20, 0x7e); // ASCII
  add(0xa0, 0xff); // ラテン1(×・° など)
  add(0x2010, 0x2027); // ダッシュ・引用符・…
  add(0x2190, 0x2199); // 矢印
  add(0x25a0, 0x25ff); // ■□▲▼◆○● など
  add(0x2605, 0x2606); // ★☆
  add(0x3000, 0x303f); // 和文の句読点・括弧
  add(0x3041, 0x3096); // ひらがな
  add(0x30a0, 0x30ff); // カタカナ
  add(0xff01, 0xff5e); // 全角英数・記号
  return s;
})();

const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const rel = (f) => path.relative(dist, f).split(path.sep).join("/");

/** 文字列に出てくる文字(エスケープを戻したものも含める) */
function charsOf(s) {
  const decoded = s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return new Set([...s, ...decoded]);
}

/**
 * dist/ の日本語・英語ページ側のファイル(韓国語・中国語ページと、フォント自身は除く)。
 * /data/ のページ用データ(src/pages/data/[file].json.ts)は言語がファイル名にある(<種類>-<lang>.<ハッシュ>.json)
 */
function targetFiles() {
  return walk(dist).filter(
    (f) =>
      /\.(html|json|js|css)$/.test(f) &&
      !/^(ko|zh-cn|fonts)\//.test(rel(f)) &&
      !/^data\/[^/]+-(ko|zh-cn)\.[^/]+$/.test(rel(f)),
  );
}

/** dist/ で使われている文字と、HTML ページごとの出現数 */
function collect() {
  const all = new Set();
  const pageCount = new Map();
  let pages = 0;
  const topChars = new Set();
  for (const f of targetFiles()) {
    const set = charsOf(fs.readFileSync(f, "utf8"));
    for (const c of set) all.add(c);
    if (f.endsWith(".html")) {
      pages++;
      for (const c of set) pageCount.set(c, (pageCount.get(c) ?? 0) + 1);
      if (rel(f) === "index.html" || rel(f) === "en/index.html") for (const c of set) topChars.add(c);
    }
  }
  return { all, pageCount, pages, topChars };
}

/** unicode-range の書き方(連続する範囲をまとめる) */
function unicodeRange(chars) {
  const cps = [...new Set([...chars].map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const hex = (n) => n.toString(16).toUpperCase();
    parts.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j + 1;
  }
  return parts.join(",");
}

/** フォント(ttf/woff2)が持っている文字 */
async function cmapOf(buf) {
  const sfnt = buf.subarray(0, 4).toString("latin1") === "wOF2" ? await fontverter.convert(buf, "truetype") : buf;
  const face = new HbFace(new HbBlob(sfnt), 0);
  return new Set([...face.collectUnicodes()].map((cp) => String.fromCodePoint(cp)));
}

const t0 = Date.now();
if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("gen-fonts: dist/ がありません。astro build の後に実行してください");
  process.exit(1);
}
const { all, pageCount, pages, topChars } = collect();
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const css = [
  "/* tools/gen-fonts.mjs が作る。サイトで使う文字だけに絞ったフォント(SIL Open Font License。同じ場所の OFL-*.txt) */",
];
/** 確かめるため: [書体, 太さ, ファイル, unicode-range の文字] */
const made = [];
let preload400 = null;
let totalBytes = 0;
const notInSource = new Map();

for (const fam of FAMILIES) {
  const src = fs.readFileSync(path.join(root, "fonts", fam.file));
  const srcChars = await cmapOf(src);
  // 元のフォントにある文字だけが対象(無い文字は端末の書体で出る。以前と同じ)
  const want = new Set([...all, ...ALWAYS].filter((c) => srcChars.has(c)));
  notInSource.set(fam.family, [...all].filter((c) => !srcChars.has(c) && c.codePointAt(0) > 0x20));

  /** [名前, 文字の集合] */
  let groups;
  if (fam.slice) {
    // 基本: 実際に使っていて、トップに出るか多くのページで使う文字(かな・ASCII など常に入れる文字のうち、使っているものも)
    const used = (c) => all.has(c);
    const core = new Set([...want].filter((c) => used(c) && ((ALWAYS.has(c) && ((pageCount.get(c) ?? 0) > 0 || c.codePointAt(0) < 0x7f)) || topChars.has(c) || (pageCount.get(c) ?? 0) / pages >= CORE_PAGE_SHARE)));
    // 常に入れる文字のうち、いまは使っていないもの。念のため配信はするが、基本から外して使うページだけが読む
    const spare = [...want].filter((c) => !core.has(c) && !used(c));
    const rest = [...want].filter((c) => !core.has(c) && used(c)).sort((a, b) => (pageCount.get(b) ?? 0) - (pageCount.get(a) ?? 0) || a.codePointAt(0) - b.codePointAt(0));
    groups = [["core", core]];
    for (let i = 0; i < rest.length; i += SLICE_SIZE) groups.push([`s${groups.length}`, new Set(rest.slice(i, i + SLICE_SIZE))]);
    if (spare.length) groups.push(["spare", new Set(spare)]);
  } else {
    groups = [["all", want]];
  }

  for (const w of fam.weights) {
    for (const [name, chars] of groups) {
      const out = await subsetFont(src, [...chars].join(""), { targetFormat: "woff2", variationAxes: { wght: w } });
      const hash = crypto.createHash("sha256").update(out).digest("hex").slice(0, 10);
      const file = `${fam.slug}-${w}-${name}.${hash}.woff2`;
      fs.writeFileSync(path.join(outDir, file), out);
      totalBytes += out.length;
      made.push({ family: fam.family, weight: w, file, chars });
      if (fam.family === "Noto Sans JP" && w === 400 && name === "core") preload400 = file;
      css.push(
        `@font-face{font-family:"${fam.family}";font-style:normal;font-weight:${w};font-display:swap;` +
          `src:url(/fonts/${file}) format("woff2");unicode-range:${unicodeRange(chars)}}`,
      );
    }
  }
  fs.copyFileSync(path.join(root, "fonts", fam.license), path.join(outDir, fam.license));
}

/*
 * フォントが届く前の代わりの書体(端末の日本語書体)。縦の寸法を Noto Sans JP(ascent 1160 / descent 288、1em=1000)に
 * 合わせ、差し替わったときに行の位置がずれないようにする。和文は全角で幅が同じなので size-adjust は 100% のまま
 */
css.push(
  `@font-face{font-family:"Noto Sans JP Fallback";src:local("Hiragino Sans"),local("HiraginoSans-W3"),local("Hiragino Kaku Gothic ProN"),` +
    `local("Yu Gothic"),local("YuGothic"),local("Meiryo"),local("Noto Sans CJK JP"),local("Noto Sans JP");` +
    `ascent-override:116%;descent-override:28.8%;line-gap-override:0%;size-adjust:100%}`,
);
fs.writeFileSync(path.join(outDir, "fonts.css"), css.join("\n") + "\n");

// HTML の preload を、基本・400 のファイルに差し替える
let rewritten = 0;
for (const f of walk(dist).filter((x) => x.endsWith(".html"))) {
  const s = fs.readFileSync(f, "utf8");
  if (!s.includes("__FONT_PRELOAD_NOTO400__")) continue;
  fs.writeFileSync(f, s.replaceAll("__FONT_PRELOAD_NOTO400__", preload400));
  rewritten++;
}

// ---- 安全装置: 作ったファイルを読み直して、使っている文字が全部入っているか ----
const after = collect().all; // 差し替え後の dist/ をもう一度読む
const missing = [];
for (const fam of FAMILIES) {
  const srcChars = await cmapOf(fs.readFileSync(path.join(root, "fonts", fam.file)));
  for (const w of fam.weights) {
    const files = made.filter((m) => m.family === fam.family && m.weight === w);
    const covered = new Set();
    for (const m of files) {
      const cmap = await cmapOf(fs.readFileSync(path.join(outDir, m.file)));
      // unicode-range に書いた文字が、そのファイルに実際に入っているものだけを数える
      for (const c of m.chars) if (cmap.has(c)) covered.add(c);
    }
    for (const c of after) if (srcChars.has(c) && !covered.has(c)) missing.push(`${fam.family} ${w}: U+${c.codePointAt(0).toString(16).toUpperCase()} ${c}`);
  }
}

// 開発用に public/fonts/ にも写す(npm run dev で同じフォントを使うため)
fs.rmSync(devDir, { recursive: true, force: true });
fs.cpSync(outDir, devDir, { recursive: true });

const sec = ((Date.now() - t0) / 1000).toFixed(1);
const jp = made.filter((m) => m.family === "Noto Sans JP");
console.log(
  `gen-fonts: 文字 ${all.size} 種(HTML ${pages} ページ)→ ${made.length} ファイル ${(totalBytes / 1024).toFixed(0)}KB` +
    `(Noto Sans JP: 基本 ${jp.find((m) => m.file.includes("-core."))?.chars.size} 字 + 追加 ${jp.filter((m) => !m.file.includes("-core.")).length / 3} 個)` +
    ` preload 差し替え ${rewritten} ページ ${sec}秒`,
);
for (const [fam, list] of notInSource) if (fam === "Noto Sans JP" && list.length) console.log(`gen-fonts: Noto Sans JP に無い文字 ${list.length} 種(端末の書体で出る): ${list.slice(0, 20).join(" ")}`);
if (missing.length) {
  console.error(`gen-fonts: 絞ったフォントに入っていない文字が ${missing.length} 件あります。ビルドを失敗にします`);
  for (const m of missing.slice(0, 30)) console.error("  " + m);
  process.exit(1);
}
console.log("gen-fonts: 文字の欠け 0 件");
