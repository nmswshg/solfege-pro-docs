# 公開とリポジトリの非公開化

移行先は Cloudflare Pages の無料プランとし、`solfegepro.com` と既存URLを維持する。
GitHub リポジトリを Private にするのは、Cloudflare への切替と本番確認が完了した後。

## ビルド設定

- 本番ブランチ: `main`
- フレームワーク: なし
- ビルドコマンド: `npm run build:site`
- 出力ディレクトリ: `dist`

`build:site` は Web 用 GA4 設定を確認し、Git 管理下の公開ファイルだけを `dist/` にコピーする。
`src/`、`data/`、`tests/`、`tools/`、開発設定、プレビュー用HTMLは配信しない。
本文を変更したときは従来どおり `npm run build` で各言語を生成してからコミットする。

## 切替手順

1. Cloudflare の既存 Pages プロジェクトと GitHub 連携を確認し、上記ビルド設定を適用する。
2. 仮URLで8言語の表示、画像・CSS・JavaScript、言語切替、404、サイトマップを確認する。
3. Pages に `solfegepro.com` を登録し、既存DNSの接続先を Pages に変更する。
4. 本番で表示・リンク・HTTPSを確認してから、GitHub Pages の自動公開を停止し、リポジトリを Private にする。
5. Private 変更後も、GitHub から Pages の自動ビルド・公開が成功することを確認する。

ルートの `_redirects` は移行前の Pages 設定用に残し、`dist/` にはコピーしない。
この一括転送を `dist/` に入れると、本番ドメインも自身に転送される。
`pages.dev` や `www` からの転送が必要な場合は、Cloudflare のホスト名条件付きルールで設定する。

移行中の切り戻し用に GitHub Pages のワークフローは残している。
こちらも `dist/` だけを公開するため、リポジトリ全体は配信しない。

## 参考

- [Cloudflare Pages の GitHub 連携（Private 対応）](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [無料枠の上限](https://developers.cloudflare.com/pages/platform/limits/)
- [GitHub の非公開化に伴う Pages の公開停止](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
