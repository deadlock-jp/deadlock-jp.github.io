/**
 * 背景の静止画(スマホ・「視差効果を減らす」用)を、PC の背景アニメーション(public/js/deadlock-bg.js)から書き出す。
 * デザインを描き直さず、同じスクリプトにそのまま描かせて撮る。背景を変えたらこれを回し直す。
 *
 *   npm i --no-save playwright      (package.json には入れない。終わったら戻す)
 *   node tools/gen-bg-static.mjs [--master <png の保存先>]
 *
 * ■ 撮り方
 *   - 1600×900 の画面をデバイスピクセル比2で描かせる(3200×1800)。網点・ビルの幅は CSS px 固定なので、
 *     画素を増やすときは画面を広げずにピクセル比で上げる(画面を広げると網点が細かくなり、見た目が変わる)
 *   - motion: false で止める。止めた状態は t=0 の1コマで、サーチライトは画面の左外、窓明かりは点いている
 *   - グレイン(overlay で重ねた Canvas)と周辺減光は、画面ごと撮るので焼き込まれる
 * ■ 出力(public/images/bg/)
 *   - bg-tall.{webp,jpg} … スマホ用。左端から縦長(3:4)に切り出す(中央は見出し裏のスクリムで暗いため)。高さは全部使う
 *   - bg-wide.{webp,jpg} … 横長の画面用(PC で「視差効果を減らす」が有効なとき)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright がありません。npm i --no-save playwright で入れてから実行してください");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/images/bg");
const masterArg = process.argv.indexOf("--master");
const masterPath = masterArg > 0 ? process.argv[masterArg + 1] : null;

const CSS_W = 1600;
const CSS_H = 900;
const DPR = 2;

/** 出力の幅と画質 */
const SIZES = {
  tall: { width: 1350, webp: 85, jpeg: 85 },
  wide: { width: 2560, webp: 80, jpeg: 80 },
};

// 背景の色は tokens.css と同じものを使う(Base.astro は --c-bg-accent を渡して mount している)
const tokens = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
const token = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim();
const accent = token("--c-bg-accent");
const bg = token("--c-bg");
if (!accent || !bg) throw new Error("tokens.css から --c-bg-accent / --c-bg を読めません");

const script = fs.readFileSync(path.join(root, "public/js/deadlock-bg.js"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:${bg}}
  .dlbg{position:fixed;inset:0;overflow:hidden;background:${bg}}
</style></head><body><div id="dlbg" class="dlbg"></div></body></html>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: CSS_W, height: CSS_H }, deviceScaleFactor: DPR });
await page.setContent(html);
// setContent に直接埋めると日本語のコメントで構文エラーになるので、別に読み込ませる
page.on("pageerror", (e) => { throw e; });
await page.addScriptTag({ content: script });
await page.evaluate((accent) => {
  window.DeadlockBG.mount(document.getElementById("dlbg"), { accent, glow: 0.5, motion: false });
}, accent);
// 最初のフレームで網点の空を組み立てるので、数フレーム待つ
await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok)))));
const master = await page.screenshot({ type: "png" });
await browser.close();
if (masterPath) fs.writeFileSync(masterPath, master);

fs.mkdirSync(outDir, { recursive: true });
const W = CSS_W * DPR;
const H = CSS_H * DPR;

/** 書き出し。容量の目安は1枚200KB */
async function write(name, pipeline, { width, webpQuality, jpegQuality }) {
  const resized = pipeline.clone().resize({ width });
  const webp = await resized.clone().webp({ quality: webpQuality, effort: 6 }).toBuffer();
  const jpg = await resized.clone().jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
  fs.writeFileSync(path.join(outDir, `${name}.webp`), webp);
  fs.writeFileSync(path.join(outDir, `${name}.jpg`), jpg);
  const meta = await sharp(webp).metadata();
  console.log(`${name}: ${meta.width}x${meta.height}  webp ${(webp.length / 1024).toFixed(0)}KB  jpg ${(jpg.length / 1024).toFixed(0)}KB`);
}

/*
 * スマホ用: 3:4 で左端から切り出す(ビルは下端まで描かれているので高さは全部)。
 * 中央は見出しの裏を暗くするスクリム(deadlock-bg.js の buildBase)が掛かっていて網点の空がほとんど見えないため、
 * 左端に寄せる。スマホ(縦横比 0.46 前後)ではこの中央の約75%(元の絵の左から5〜37%)が見える
 */
const tallW = Math.round((H * 3) / 4);
const tall = sharp(master).extract({ left: 0, top: 0, width: tallW, height: H });
await write("bg-tall", tall, { width: SIZES.tall.width, webpQuality: SIZES.tall.webp, jpegQuality: SIZES.tall.jpeg });

// 横長の画面用
await write("bg-wide", sharp(master), { width: SIZES.wide.width, webpQuality: SIZES.wide.webp, jpegQuality: SIZES.wide.jpeg });
