# 実行コマンド

## 企画書骨子・スライド構成生成

```bash
npm run analysis:consulting-deck-planner
```

## 起動

```bash
npm start
```

`npm start` から `consulting-deck-planner` を選ぶと、`questions.json` に沿って入力を更新し、Markdown成果物を生成します。

## 処理順

1. `inputs/user-brief.json` を読む
2. `references/` のプロンプト、章構成、分析フロー、レイアウトルールを読む
3. リサーチ観点を作る
4. Executive Summaryを作る
5. Story Lineを作る
6. Chapter Structureを作る
7. Chapter Designを作る
8. Slide Designを作る
9. MECE、Decision、Insight、Recommendationの確認リストを出力する
