# Codex EastBoard Templates

このフォルダは、Codex CLIから実行するテンプレートを置く場所です。

## 基本方針

- コード編集なしで、プロンプト・ルール・フレームワークを更新できる状態を優先する
- テンプレートはフォルダ名で用途が分かるようにする
- 長いプロンプトは各テンプレート配下の `references/` や `knowledge/` へ分割する
- 実行テンプレートは `template.json`、`questions.json`、`phases.json` を持つ

## 管理フォルダ

```text
templates/
├── consulting-deck-planner/
└── proposal-story/
```

## 使い分け

- `consulting-deck-planner` は、経営層向け企画書骨子を生成する実行テンプレートです。
  - 関連する共通ルール、企画書、リサーチ、スライド、フレームワーク、サンプルは `consulting-deck-planner/knowledge/` にまとまっています。
- `proposal-story` は、既存の企画書ストーリー設計テンプレートです。

## テンプレートとして認識される条件

CLIは `templates/*/template.json` を持つフォルダだけを実行テンプレートとして認識します。
そのため、現在の実行テンプレートは `consulting-deck-planner` と `proposal-story` の2個です。
