/**
 * トップページの「プレイ動画」(X の投稿の紹介)。一覧は data/featured-clips.json を手で管理する。
 *
 * ここでは中身を検査して、表示に使う形にするだけ。書き方の誤り(URL の形・ハンドルの食い違い・
 * 存在しないヒーローのキー・日付の形)はビルドを止める(誤ったまま公開するより、前回のまま残す方がよい)。
 * X のものはビルド時に何も取りに行かない。埋め込みは、押された人のブラウザで初めて読む(PlayClips.astro)。
 */
import clipsJson from "../../data/featured-clips.json" with { type: "json" };
import { releasedHeroes } from "./data.ts";
import type { Hero } from "../types/hero.ts";

interface FeaturedClipEntry {
  url: string;
  handle: string;
  hero?: string;
  title: string;
  added: string;
}

export interface FeaturedClip {
  /** 投稿の ID(x.com/<ハンドル>/status/<ID>) */
  id: string;
  /** 「X で見る」のリンク先(x.com の正規の形にそろえたもの) */
  url: string;
  /** @ 付き */
  handle: string;
  title: string;
  added: string;
  hero: Hero | null;
}

/** 表示する最大件数 */
export const MAX_CLIPS = 10;

const URL_RE = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?(?:\?.*)?$/;

export function featuredClips(): FeaturedClip[] {
  const entries = (clipsJson as { clips: FeaturedClipEntry[] }).clips;
  const clips = entries.map((e, i): FeaturedClip => {
    const where = `data/featured-clips.json の ${i + 1} 件目`;
    const m = URL_RE.exec(e.url ?? "");
    if (!m) throw new Error(`${where}: url が x.com/<ハンドル>/status/<ID> の形ではありません (${e.url})`);
    const [, user, id] = m as unknown as [string, string, string];
    const handle = (e.handle ?? "").replace(/^@?/, "@");
    if (handle.slice(1).toLowerCase() !== user.toLowerCase()) {
      throw new Error(`${where}: handle (${e.handle}) が url のユーザー (${user}) と食い違っています`);
    }
    if (!e.title?.trim()) throw new Error(`${where}: title が空です`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.added ?? "")) throw new Error(`${where}: added は YYYY-MM-DD で書きます (${e.added})`);
    let hero: Hero | null = null;
    if (e.hero) {
      hero = releasedHeroes().find((h) => h.key === e.hero) ?? null;
      if (!hero) throw new Error(`${where}: hero (${e.hero}) という実装済みヒーローのキーがありません`);
    }
    return { id, url: `https://x.com/${user}/status/${id}`, handle, title: e.title.trim(), added: e.added, hero };
  });
  // 追加した日付の新しい順。同じ日付ならファイルの順(sort は安定)
  return clips.sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : 0)).slice(0, MAX_CLIPS);
}
