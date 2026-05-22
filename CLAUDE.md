# solfege-pro-docs — Project Rules

このファイルは solfege-pro-docs ディレクトリで作業する全 conversation の system prompt に自動注入されます。短く保つ。詳細は `.claude/rules/` を参照。

---

## CRITICAL: Responsive layout discipline

**CSS / HTML をコミットする前に必ず以下を実行する。スキップ禁止。**

```bash
npm run check-css      # 静的リンタ (< 1s) — Hard rules 違反を検出
npm run check-layout   # Playwright sweep — 12 viewport で overflow / direction を検証
```

両方 PASS しない限り `git commit` してはならない。Hooks は `.githooks/pre-commit` に既に仕込んであり、`git config core.hooksPath .githooks` 済みのリポでは自動的に走る (未設定なら手動で `npm run check-css` だけは絶対に走らせる)。

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

## Language

- 思考・コード・コミットメッセージ: 英語
- ユーザー対話: 日本語

## Pricing / Branding constraints

- 自社アプリ Solfege PRO の価格は常に「月額 980 円（1 週間無料トライアル）」と明記。「App Store で要確認」のような曖昧表現禁止
- "Berklee" / "バークリー" は user-facing コンテンツで一切禁止
- デザインは既存ブランド（gold #D4AF37 + dark + Noto Sans JP）を尊重。glassmorphism / 多色 / 装飾的 SVG アニメ等の「AI 風デザイン」追加禁止
