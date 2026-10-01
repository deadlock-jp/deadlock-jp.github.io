# DEADLOCK-JP DB

Valve の『Deadlock』のヒーロー・アイテム・スキルの数値を、日本語で引けるようにした
データベース型サイトとビルドシミュレーターです。

公開先: https://deadlock-jpdb.com/

## これは何か

**ファンの有志が作っている非公式サイトです。Valve Corporation とは一切関係がなく、
許諾も受けていません。**

やっていることは、ゲーム本体とデータリポジトリから数値を機械的に取り出し、
ゲーム内の公式日本語表記で引けるように並べ替えることだけです。
攻略の解説や考察は載せません。数値がそのまま出ているかどうかがすべてです。

## 権利表示

『Deadlock』および本サイトが表示するゲーム内のデータ・画像・テキストの著作権は、
**Valve Corporation** に帰属します。
Deadlock、Steam、Valve は Valve Corporation の商標または登録商標です。

本サイトはそれらを、ファンサイトとして参照・表示する目的でのみ利用しています。
日本語の表記はゲーム本体に収録されている公式のものをそのまま用いており、
当サイトが独自に翻訳・改変したものではありません。

権利者からご連絡をいただいた場合は、速やかに該当箇所を削除または修正します。

### ソースコードの扱い

このリポジトリのうち、**ソースコード（`src/`、`tools/`、設定ファイル）は MIT ライセンス**です。
`LICENSE` を参照してください。

MIT ライセンスが及ぶのはコードだけで、`data/` と `public/images/` に置かれている
ゲーム由来のデータ・画像は対象外です。これらの権利は上記のとおり Valve Corporation にあります。

`fonts/` のフォント（Noto Sans JP・JetBrains Mono・Cinzel）も MIT の対象外で、SIL Open Font License 1.1 です（`fonts/OFL-*.txt`）。

## データの出どころ

| 種類 | 出どころ |
|---|---|
| ヒーロー・アイテム・スキルの数値 | ゲーム本体の `.vdata`（KV3テキスト）を直接 decompile |
| 日本語の表示テキスト | ゲーム本体の `citadel_*_japanese.txt`（公式ローカライズ） |
| アイコン画像・ヒーロー肖像 | ゲーム本体の VPK から抽出 |

数値は人手で書き写しておらず、すべてパーサーが自動で取り出しています。
どのフィールドをどう解釈したかは `src/parsers/` のコードとコメントに書いてあります。

パッチごとのスナップショットは `data/snapshots/<ClientVersion>/` に保存し、
`data/latest.json` が現在サイトに出ている版を指します。
最新版のスナップショットは全ファイルを持ち、過去版はバージョン比較と差分生成に使う
ヒーロー・アイテム・スキル・経済の数値（`heroes` `items` `abilities` `economy` `meta`）だけを残します。
表示テキスト（ローカライズ）はスナップショットの外、`data/localization/<言語>.json` に
最新版の1セットだけを置きます。
[GameTracking-Deadlock](https://github.com/SteamDatabase/GameTracking-Deadlock) は
検算と過去バージョンの補完に使う副次ソースです。

### 対戦統計（ゲーム本体由来ではないもの）

アイテムの採用率・勝率、ヒーローのピック率・勝率・BAN率、人気のビルドは
[deadlock-api.com](https://deadlock-api.com/) の公開APIから取る数値です（文章は取り込みません）。
「今の値」だけあればよいので **Git には入れず**（`.gitignore`）、デプロイのたびに
`.github/workflows/deploy.yml` が API から取ってビルドに使います（main への push・手動実行・6時間おきの定期実行）。
取得に失敗したファイルは、前回成功分（actions/cache）を使い、それも無ければ統計なしでビルドします。

| ファイル | 取得スクリプト |
|---|---|
| `data/item-stats.json` | `tools/fetch-item-stats.mjs` |
| `data/hero-stats.json` | `tools/fetch-hero-stats.mjs` |
| `data/hero-builds.json` | `tools/fetch-hero-builds.mjs` |

## 開発

Node.js 22.6 以上が必要です。

```bash
npm ci
npm run dev        # ローカルプレビュー
npm run build      # dist/ に静的サイトを出力
npm run typecheck  # 型チェック
npm run fetch:stats  # 対戦統計を deadlock-api.com から取る(1分ほど。Git には入らない)
```

対戦統計のファイルが無くても `dev` / `build` は通ります（統計を使う欄が出ないだけ）。

データの再生成は、このゲームがインストールされたPC上で行います
(`tools/extract/extract-local.mjs` が Steam のインストール先から `.vdata` を decompile します)。

```bash
node tools/extract/extract-local.mjs   # ローカル抽出ルートを作る(パスを標準出力に出す)
npm run parse -- --local <上記のパス>   # data/snapshots/<ClientVersion>/ と data/localization/ を生成
```

検算や過去バージョンの補完には、別途 clone した GameTracking-Deadlock も使えます。

```bash
npm run parse -- --gt <GameTracking-Deadlockのパス>
```

## 構成

```
src/parsers/   .vdata → data/*.json のパーサー
src/pages/     Astroのページ
src/lib/       表示テキストの解決（トークンID → 日本語）
src/components/  アイコン・肖像の表示
data/          パース済みJSON
public/images/ ゲームから抽出した画像
tools/         ゲーム本体から画像を取り出すためのバッチ
```

`data/image-manifest.json` が「どの画像がどこから来てどこに置かれるか」の対応表です。
`tools/make-arrange-bat.ts` はこの対応表から取り出し用のバッチを生成します。
