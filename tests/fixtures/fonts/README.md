# 画像比較用のNoto Sans JP

画像テストだけで使う固定フォント。公開ページのCSS・フォント取得先は変更しない。

2026-10-07の検証で、同一Google Fonts URLに異なるCSSが返り、font応答のcontent-typeにも差が記録された。変更していないページでも文字の画素差が生じたため、画像比較はこのfixtureを使い、400/500/700の読み込み成功を確認してから撮影する。`maxDiffPixels: 0`は維持する。

出典・固定commit・元TTF/配布WOFF2のSHA-256は`source.json`、ライセンスは`OFL.txt`。Google Fontsの元TTFをFontToolsでWOFF2へ変換し、文字・ウェイトの部分削除は行っていない。

更新時は新しい公式フォントとOFLを取得し、hashを記録する。`fontTools.ttLib.TTFont`の`flavor='woff2'`で保存し、見た目を確認してから`npm run test:visual:update`で基準を更新する。公開ページの外部フォント取得に問題がある場合の診断は通常のブラウザ検証で扱う。
