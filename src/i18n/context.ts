/**
 * いま描いているページの言語。
 *
 * src/middleware.ts が URL から言語を決め、そのリクエストの描画全体を
 * AsyncLocalStorage の中で走らせる。子コンポーネントや src/lib/ の関数は
 * 引数で言語を受け取らなくても currentLang() で引ける(非同期の描画をまたいでも保たれる)。
 * 描画の外(tools/ から lib を使う場合など)は常に日本語。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Lang } from "./langs.ts";

const store = new AsyncLocalStorage<Lang>();

export function runWithLang<T>(lang: Lang, fn: () => T): T {
  return store.run(lang, fn);
}

export function currentLang(): Lang {
  return store.getStore() ?? "ja";
}
