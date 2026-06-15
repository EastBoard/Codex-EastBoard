# Consulting Deck Planner Template

経営層向け企画書の骨子、章構成、論点設計、分析、意思決定、示唆、提案、スライド構成を生成するテンプレートです。

## 目的

テーマから以下の流れを一貫して設計します。

```text
リサーチ
↓
企画書骨子
↓
章構成
↓
論点構造
↓
分析
↓
評価
↓
意思決定
↓
示唆
↓
提案
↓
スライド構成
```

## 編集する場所

- `references/prompt-template.md`: 完成版プロンプト
- `references/layout-selection-rules.md`: レイアウト選択ルール
- `references/output-format.md`: 出力形式
- `references/chapter-structure.md`: 章構成ルール
- `inputs/user-brief.json`: 既定入力
- `questions.json`: CLIで聞く項目

## 実行

```bash
npm run analysis:consulting-deck-planner
```

または、共通CLIから選択します。

```bash
npm start
```

## 出力

`outputs/consulting-deck-planner/YYYYMMDD_HHMMSS/` にMarkdown中心で保存します。

- `research_plan.md`
- `deck_outline.md`
- `slide_design.md`
- `review_checklist.md`
- `agent_workflow.md`
- `deck.json`
- `consulting_deck_slides.pptx`
- `consulting_deck_slides.json`
- `22_powerpoint_exporter.json`
- `preview.html`
- `qa_report.md`
