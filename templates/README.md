# Codex EastBoard Templates

このフォルダは、人間がMarkdownで編集する業務テンプレート資産と、Codex CLIから実行するテンプレートを置く場所です。

## 基本方針

- コード編集なしで、プロンプト・ルール・フレームワークを更新できる状態を優先する
- テンプレートはフォルダ名で用途が分かるようにする
- 長いプロンプトは `references/` や用途別Markdownへ分割する
- 実行テンプレートは `template.json`、`questions.json`、`phases.json` を持つ

## 管理フォルダ

```text
templates/
├── 00_共通ルール/
├── 01_企画書/
├── 02_リサーチ/
├── 04_スライド/
├── 05_フレームワーク/
├── 99_サンプル/
├── consulting-deck-planner/
└── proposal-story/
```

## 使い分け

- `00_共通ルール` から `99_サンプル` は、人間が編集するテンプレート資産です。
- `consulting-deck-planner` は、経営層向け企画書骨子を生成する実行テンプレートです。
- `proposal-story` は、既存の企画書ストーリー設計テンプレートです。
