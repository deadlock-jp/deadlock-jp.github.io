// @ts-check
/**
 * アイテムの売却・強化の集計(tools/fetch-item-sales.mjs)の「取得部分」。
 * deadlock-api.com の SQL エンドポイント(GET /v1/sql、ClickHouse)に1回だけ問い合わせ、
 * 集計済みの行を返す。行を data/item-sales.json の形に整えるのは呼び出し側の仕事。
 *
 * SQL エンドポイントはドキュメントで「Deprecated. Direct SQL access will be removed」とされている。
 * 代わりは公開データレイク(https://data.deadlock-api.com、DuckDB / DuckLake)。
 * 差し替えるときは、このファイルと同じ fetchItemSalesRows(params) → SalesRow[] を持つ別の取得部分を作り、
 * fetch-item-sales.mjs の import を替えるだけで済むようにしてある。
 *
 * ■ 上限
 * IP あたり 2回/分・20回/時。ここでは1回の取得で1回しか投げない。
 * 429(上限)は取り直さない(取り直すと上限を食うだけなので、呼び出し側が前回分を使う)。
 * 通信エラー・5xx だけ、31秒空けて1回だけ取り直す(2回/分に収まる間隔)。
 *
 * ■ 集計の定義(試合データの items の各行)
 *   - ショップのアイテムだけ: upgrade_id = 1(スキルの行は 0 か別の値、正体不明の行は 3、ブローカーの腐敗版は 129)
 *     腐敗版の行(upgrade_info の bit 23)は数えない
 *   - 1プレイヤー × 1試合 × 1アイテム を1件にし、次のどれか1つに分ける(上から順に判定)
 *       売却 … flags = 0 で sold_time_s があり、保持時間(sold − game_time)が cancelSeconds を超える行が1つでもある
 *       強化 … flags = 1(上位アイテムの素材として消えた)の行がある
 *       保持 … 最後まで持っていた(sold_time_s = 0)行がある。ブローカーに腐敗版と交換された行も保持として扱う
 *              (交換された元のアイテムは、交換の時刻が sold_time_s に入り flags = 0 なので、そのままだと売却に見える。
 *               同じプレイヤーの腐敗版の購入と、アイテムIDと時刻が一致するもので見分ける。2026-10-02 の実測で全件一致)
 *       取り消し … 上のどれにも当たらない(cancelSeconds 以内の売却だけ)。件数だけ数え、割合には入れない
 *   - 時刻(秒): 購入 = その件の最初の購入(取り消しの購入は除く)、売却 = 最初の売却、保持 = その売却の保持時間
 *   - ヒーローの試合数: 各プレイヤーの items の先頭に番兵(item_id = 0)を足し、その件数で数える。
 *     行の itemId = 0 が「そのヒーロー(heroId = 0 なら全ヒーロー)の、その帯の試合数」(n に入る)
 *   - ランク帯: 試合の平均バッジ(average_badge)が帯の下限以上・上限以下(bandCondition の説明を参照。
 *     下限 11 以下・上限 116 以上は絞らない)。all はすべての試合
 */

const SQL_URL = "https://api.deadlock-api.com/v1/sql";
/** ブローカーの腐敗版の印(upgrade_info の bit 23)。deadlock-api のマイグレーション 42 と同じ判定 */
const CORRUPTED_BIT = 8388608;

/**
 * @typedef {{ key: string, minBadge: number, maxBadge: number }} Band
 * @typedef {{ start: number, end: number, cancelSeconds: number, bands: Band[] }} SalesParams
 * @typedef {{
 *   band: string, itemId: number, heroId: number,
 *   n: number, sold: number, upgraded: number, held: number, canceled: number,
 *   buy: number[], sell: number[], hold: number[]
 * }} SalesRow
 *   heroId 0 = 全ヒーロー。n = 売却 + 強化 + 保持(取り消しは含まない)。buy / sell / hold は [25%, 50%, 75%] の秒
 */

/**
 * 帯の条件。試合の平均バッジ(average_badge)で絞る。
 * analytics の item-stats は両チームの平均バッジ(average_badge_team0/1)の小さい方・大きい方で絞っているが、
 * match_player のその2列は直近の試合で全件 0 だった(2026-10-02 の実測)ので、試合全体の average_badge を使う。
 * 下限 11 以下・上限 116 以上は絞らない(item-stats と同じ)
 * @param {Band} b
 */
function bandCondition(b) {
  const conds = [];
  if (b.minBadge > 11) conds.push(`average_badge >= ${Number(b.minBadge)}`);
  if (b.maxBadge < 116) conds.push(`average_badge <= ${Number(b.maxBadge)}`);
  // 平均バッジが無い試合は、帯で絞るときは除く(比較が NULL になり if は偽)
  return conds.length ? conds.join(" AND ") : "1";
}

/** @param {SalesParams} p */
export function buildSql(p) {
  const C = Math.floor(Number(p.cancelSeconds));
  const bandList = [
    `['all']`,
    ...p.bands.map((b) => `if(${bandCondition(b)}, ['${String(b.key).replace(/[^a-z]/g, "")}'], [])`),
  ].join(", ");
  return `
SELECT
  band,
  item_id,
  hero_id,
  countIf(cat != 'cancel') AS n,
  countIf(cat = 'sold') AS sold,
  countIf(cat = 'up') AS upgraded,
  countIf(cat = 'held') AS held,
  countIf(cat = 'cancel') AS canceled,
  quantilesExactIf(0.25, 0.5, 0.75)(buy, cat != 'cancel') AS buy_q,
  quantilesExactIf(0.25, 0.5, 0.75)(sell, cat = 'sold') AS sell_q,
  quantilesExactIf(0.25, 0.5, 0.75)(hold, cat = 'sold') AS hold_q
FROM (
  SELECT
    match_id, account_id, hero_id, item_id,
    any(bands) AS bands,
    multiIf(max(is_sale), 'sold', max(flags = 1), 'up', max(sold = 0 OR is_swap), 'held', 'cancel') AS cat,
    minIf(t, NOT is_cancel) AS buy,
    minIf(sold, is_sale) AS sell,
    argMinIf(sold - t, sold, is_sale) AS hold
  FROM (
    SELECT
      match_id, account_id, hero_id, bands, item_id, t, sold, flags,
      sold > 0 AND flags = 0 AND has(cpairs, (item_id, sold)) AS is_swap,
      sold > 0 AND flags = 0 AND NOT is_swap AND sold - t > ${C} AS is_sale,
      sold > 0 AND flags = 0 AND NOT is_swap AND sold - t <= ${C} AS is_cancel
    FROM (
      SELECT
        match_id, account_id, hero_id,
        arrayConcat(${bandList}) AS bands,
        arrayMap((x, t) -> (x, t),
          arrayFilter((x, u) -> bitAnd(u, ${CORRUPTED_BIT}) != 0, items.item_id, items.upgrade_info),
          arrayFilter((t, u) -> bitAnd(u, ${CORRUPTED_BIT}) != 0, items.game_time_s, items.upgrade_info)) AS cpairs,
        -- 先頭に番兵(item_id = 0)を1行足す。アイテムを1つも買っていないプレイヤーも1件として残り、
        -- 番兵の件数がそのまま「そのヒーロー(全体)の試合数」になる(問い合わせを増やさずに分母を取るため)
        arrayPushFront(arrayMap(x -> toUInt32(x), items.item_id), toUInt32(0)) AS s_ids,
        arrayPushFront(items.game_time_s, toUInt32(1)) AS s_ts,
        arrayPushFront(items.sold_time_s, toUInt32(0)) AS s_sold,
        arrayPushFront(items.flags, toUInt32(0)) AS s_flags,
        arrayPushFront(items.upgrade_id, toUInt32(1)) AS s_up,
        arrayPushFront(items.upgrade_info, toUInt32(0)) AS s_ui
      FROM match_player
      WHERE start_time >= toDateTime(${Math.floor(p.start)}) AND start_time <= toDateTime(${Math.floor(p.end)})
        AND match_mode = 'Ranked' AND game_mode = 'Normal'
    )
    ARRAY JOIN s_ids AS item_id, s_ts AS t, s_sold AS sold, s_flags AS flags, s_up AS up, s_ui AS ui
    WHERE up = 1 AND t > 0 AND bitAnd(ui, ${CORRUPTED_BIT}) = 0
  )
  GROUP BY match_id, account_id, hero_id, item_id
)
ARRAY JOIN bands AS band
GROUP BY GROUPING SETS ((band, item_id, hero_id), (band, item_id))
`.trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {SalesParams} p
 * @returns {Promise<{ rows: SalesRow[], seconds: number, bytes: number, sql: string }>}
 */
export async function fetchItemSalesRows(p) {
  const sql = buildSql(p);
  const url = `${SQL_URL}?${new URLSearchParams({ query: sql })}`;
  const started = Date.now();
  let text = "";
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      if (attempt >= 2) throw e;
      console.error(`  通信エラー。31秒後に1回だけ取り直す: ${e instanceof Error ? e.message : e}`);
      await sleep(31_000);
      continue;
    }
    text = await res.text();
    if (res.ok) break;
    // 429 は取り直さない(上限を食うだけ)。5xx だけ1回取り直す
    if (res.status >= 500 && attempt < 2) {
      console.error(`  HTTP ${res.status}。31秒後に1回だけ取り直す`);
      await sleep(31_000);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const raw = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error(`想定外の応答: ${text.slice(0, 300)}`);
  /** @type {SalesRow[]} */
  const rows = raw.map((r) => ({
    band: r.band,
    itemId: Number(r.item_id),
    heroId: Number(r.hero_id),
    n: Number(r.n),
    sold: Number(r.sold),
    upgraded: Number(r.upgraded),
    held: Number(r.held),
    canceled: Number(r.canceled),
    buy: (r.buy_q ?? []).map(Number),
    sell: (r.sell_q ?? []).map(Number),
    hold: (r.hold_q ?? []).map(Number),
  }));
  return { rows, seconds: (Date.now() - started) / 1000, bytes: text.length, sql };
}
