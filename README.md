# DEADLOCK-JP DB

Valve の『Deadlock』のヒーロー・アイテム・スキルの数値を、日本語で引けるようにした
データベース型サイトとビルドシミュレーターです。

公開先: https://deadlock-jp.github.io/

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

## データの出どころ

| 種類 | 出どころ |
|---|---|
| ヒーロー・アイテム・スキルの数値 | [GameTracking-Deadlock](https://github.com/SteamDatabase/GameTracking-Deadlock) の `.vdata`（KV3テキスト） |
| 日本語の表示テキスト | ゲーム本体の `citadel_*_japanese.txt`（公式ローカライズ） |
| アイコン画像・ヒーロー肖像 | ゲーム本体の VPK から抽出 |

数値は人手で書き写しておらず、すべてパーサーが自動で取り出しています。
どのフィールドをどう解釈したかは `src/parsers/` のコードとコメントに書いてあります。

## 開発

Node.js 22.6 以上が必要です。

```bash
npm ci
npm run dev        # ローカルプレビュー
npm run build      # dist/ に静的サイトを出力
npm run typecheck  # 型チェック
```

データの再生成には、別途 clone した GameTracking-Deadlock を指定します。

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
