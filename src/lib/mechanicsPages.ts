/**
 * 攻略情報(日本語のみ)の目的別ページ。共通のサブメニュー(MechanicsNav)と
 * ページ末尾の「次に読む」(MechanicsNext)が読む。
 */
export const MECH_PAGES: { path: string; label: string; title: string; body: string }[] = [
  { path: "/mechanics/beginner/", label: "はじめて", title: "はじめての Deadlock", body: "勝利条件・全体像・最初に覚える3つのこと・用語" },
  { path: "/mechanics/match/", label: "試合の流れ", title: "試合の流れ", body: "レーン戦・中盤・終盤で意識すること" },
  { path: "/mechanics/farm/", label: "マップとファーム", title: "マップとファーム", body: "マップ・ソウルの仕組み・稼ぎ方・数値表" },
  { path: "/mechanics/objects/", label: "オブジェクト", title: "オブジェクト", body: "建造物・トルーパー・ホーントの数値" },
  { path: "/mechanics/controls/", label: "キャラクターコントロール", title: "キャラクターコントロール", body: "ダッシュ・マントルなど操作の実演動画" },
];

/** 各ページの末尾に出す「次に読む」(2〜3件) */
export const MECH_NEXT: Record<string, string[]> = {
  "/mechanics/beginner/": ["/mechanics/match/", "/mechanics/farm/", "/mechanics/controls/"],
  "/mechanics/match/": ["/mechanics/farm/", "/mechanics/objects/", "/mechanics/controls/"],
  "/mechanics/farm/": ["/mechanics/objects/", "/mechanics/match/"],
  "/mechanics/objects/": ["/mechanics/farm/", "/mechanics/match/"],
  "/mechanics/controls/": ["/mechanics/beginner/", "/mechanics/match/"],
};
