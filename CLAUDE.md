# solfege-pro-docs — Project Rules

このファイルは solfege-pro-docs ディレクトリで作業する全 conversation の system prompt に自動注入されます。短く保つ。詳細は `.claude/rules/` を参照。

---

## CRITICAL: Responsive layout discipline

**CSS / HTML をコミットする前に必ず以下を実行する。スキップ禁止。**

```bash
npm run check-css      # 静的リンタ (< 1s) — Hard rules 違反を検出
npm run check-layout   # Playwright sweep — 12 viewport × 4 lang で overflow / direction を検証
npm run test:visual    # スクショ回帰 — 主要ページ × {mobile/tablet/desktop} × {ja, de} の視覚崩れを検出
```

`check-layout` は ja/en/fr/de 全言語を sweep する（独語の長語が ja では出ない overflow を起こすため）。`test:visual` は計測不能な視覚崩れ（グリッドずれ・画像潰れ・CLS・装飾位置）を捕捉する。**意図した見た目変更のときだけ** `npm run test:visual:update` で baseline 更新。3つすべて PASS しない限り `git commit` してはならない。Hooks は `.githooks/pre-commit` に既に仕込んであり、`git config core.hooksPath .githooks` 済みのリポでは自動的に走る (未設定なら手動で `npm run check-css` だけは絶対に走らせる)。

### Hard rules（違反したら commit 禁止）

1. flex セルに固定 px 幅を使わない → `display: grid; grid-template-columns: <label> repeat(N, minmax(0, 1fr)) <suffix>`。`minmax(0, 1fr)` は省略不可
2. `.article-body` 内のコンテナに `min-width` > 280px を置かない（article column は ~720px max）
3. `overflow-x: auto` は使わない（症状であって解決ではない）
4. Pseudo-element 矢印は gap の中に置く: `gap: 32px` + `right: -22px`。next item の background に隠れる位置に置くな
5. `@media` で `flex-direction: column` に切替えるとき、同じ media query 内で `content: "→"` → `content: "↓"` も flip させる
6. cell 内固定サイズの装飾は `width: clamp(min, %, max); aspect-ratio: 1` で scale させる
7. 新規 `@media` ルールを追加する前に **必ず同じセレクタの既存 media query を grep**。breakpoint 不一致で 761-768px のような dead zone を作るな

### Pre-commit verification の必須テスト viewport

```
375 / 480 / 600 / 720 / 740 / 760 / 765 / 768 / 770 / 800 / 1024 / 1440
```

境界の **720 / 740 / 760 / 765 / 768 / 770 / 780** は省略禁止。375 と 1440 だけで OK 判定するな（過去に 761-768 dead zone を見逃した）。

詳細・経緯: `.claude/rules/responsive-layout-discipline.md`

---

## CRITICAL: Content must be evidence-based (since 2026-05-30)

**記事の実質的な主張は必ずエビデンス（研究・調査結果・確立した理論）に基づく。感情論・無出典の意見で書かない。信頼性が最優先。**

- 主張は「研究が示す X（出典）」の形に。「X のはず／感覚的に X」で書かない
- 新規・拡張いずれも References / 出典を付ける（既存記事は Repp 2005, Logan 1988, Roediger &amp; Karpicke 等を引用済み。同水準を維持）
- エビデンスが薄い／無い箇所は **正直にそう書く**。誇張禁止（誇大表現はブランド規約違反でもある）
- 数値（％・期間・効果量）は出典付き。恣意的な数字を置かない

詳細・経緯: `.claude/rules/content-evidence-discipline.md`

---

## CRITICAL: Language purity (since 2026-05-29)

**出力 HTML には対象言語のテキストだけが含まれるよう、source / build / verify の三層で防御する。**

```bash
npm run check-lang     # python3 tools/lang-purity-check.py — 全 output HTML を audit
```

実質的な leak はゼロが前提。許容される finding は (a) References 内の英語論文タイトル、(b) `404.html` の 4-lang fallback のみ。

### Hard rules

1. **source の本文に bare text を書くな**: visible body 領域は常に `<span lang="ja"></span><span lang="en"></span><span lang="fr"></span><span lang="de"></span>` の 4 つで wrap。short label (chip, dt, table cell) も例外なし
2. **build の depth-tracking parser を壊すな**: `stripOrUnwrapLangSpans()` / `stripOtherLangMermaid()` を lazy regex に戻すと、ネスト span / 4 言語 mermaid block が全 lang に漏洩する (2026-05-29 に発生)
3. **mermaid 図は 4 言語分書いてよい**: build が `<div class="mermaid-lang" lang="X">` を target lang 以外 strip する
4. **新規 label の翻訳は アプリの `Localizable.strings` を正準とする**

詳細・経緯: `.claude/rules/lang-purity-discipline.md` / `.claude/docs/build-pipeline.md` / `.claude/docs/session-2026-05-29-lang-purity.md`

---

## Pricing source-of-truth (since 2026-05-23)

価格表記は **`data/prices.json` が単一の source of truth**。HTML に直書きしない。

- `data/prices.json` — 編集対象。各言語の `price` / `trial` 文字列を保持
- `data/prices.fallback.json` — 不変。`data/prices.json` が破損/欠落/不正値の時の最終 fallback
- `data/prices.previous.json` — build 自動管理。**手で触らない**

**価格変更ワークフロー**:
1. `data/prices.json` の該当 lang を編集 (例: `"price": "月額 1280 円"`)
2. `npm run build` (または commit すれば pre-commit hook が走る)
3. build が previous.json と diff して、source HTML 全 31 ファイル + 93 variants を literal find/replace で更新
4. sitemap.xml も自動更新

**fallback 動作**:
- `prices.json` パース失敗 / 必須 field 欠落 / 異常に長い値 (>80 char) → 警告ログ + `prices.fallback.json` で続行
- ビルドは絶対にブロックしない

**将来の App Store Connect API 統合**:
- 別 script (`tools/fetch-prices.js`) で App Store Connect API → `data/prices.json` を上書きするだけで全自動化可能
- API キー (`.p8` / `KEY_ID` / `ISSUER_ID`) は **GitHub Actions Secrets** に置き、static HTML / git には絶対露出させない
- `.gitignore` に `*.p8`、`.env` を追加 (現在は未追加なので追加要)

## URL & content language convention (since 2026-05-23)

各記事は **path-based URL** で言語分離:

| Lang | URL pattern | ファイル |
|---|---|---|
| ja | `/guides/foo.html` (従来通り) | source (multi-lang, 4 lang spans) |
| en | `/guides/foo.en.html` | generated (en spans のみ) |
| fr | `/guides/foo.fr.html` | generated (fr spans のみ) |
| de | `/guides/foo.de.html` | generated (de spans のみ) |

**source 編集ルール**:
- 編集対象は **source HTML (foo.html)** のみ。`<span lang="ja|en|fr|de">...</span>` の 4 つを全部更新
- `foo.en.html` / `foo.fr.html` / `foo.de.html` は **生成ファイル** — 手で編集禁止
- `npm run build` (または pre-commit hook 経由で自動) で source から regen
- sitemap.xml も同じ build スクリプトで自動生成 (124 URLs)
- `?lang=X` 形式は廃止。lang-toggle.js が legacy URL を `.X.html` に自動 redirect

**URL switching**: lang dropdown は同一 page の lang を変えるのではなく、**該当言語ファイルへナビゲート** する (full page load)。

詳細: `tools/build-langs.js` / `lang-toggle.js`

## Skill usage in this project

Global にインストール済みの skill が auto-invoke される可能性に備えての防御:

- **design-heavy skills** (`frontend-design`, `theme-factory`, `web-artifacts-builder`, `canvas-design`, `algorithmic-art` 等) は **auto-invoke 禁止**。user が明示的に `/skill-name` で起動した場合のみ使用可
- skill の指示と本ファイル / `.claude/rules/` の規約が衝突したら **本ファイルの規約を優先**
- `web-design-reviewer` (global, install 済み) は **読み取り専用 review** として使用可。修正提案は本プロジェクトの brand restraint (gold/dark/Noto Sans JP、AI-design tropes 禁止) と responsive-layout-discipline に従う
- `skill-creator` (global, install 済み) は新規 skill 作成時に使用可。本プロジェクトの規約 (`tools/check-responsive-css.sh`, `tests/responsive-sweep.spec.js` 等) を skill 化したい場合に活用

## Language

- 思考・コード・コミットメッセージ: 英語
- ユーザー対話: 日本語

## Pricing / Branding constraints

- 自社アプリ Solfege PRO の価格は常に「月額 980 円（1 週間無料トライアル）」と明記。「App Store で要確認」のような曖昧表現禁止
- "Berklee" / "バークリー" は user-facing コンテンツで一切禁止
- デザインは既存ブランド（gold #D4AF37 + dark + Noto Sans JP）を尊重。glassmorphism / 多色 / 装飾的 SVG アニメ等の「AI 風デザイン」追加禁止
- **例外: 音楽教育的な data viz の意味的カラー** (e.g. interval を完全系=緑/長短系=橙/トライトーン=赤 で色分け、コード機能を T/SD/D で色分け、モード比較で特性音を強調) は、ブランド規約の「多色禁止」の対象外。教育コンテンツの可読性を優先する。装飾用途では引き続き gold + dark のみ
