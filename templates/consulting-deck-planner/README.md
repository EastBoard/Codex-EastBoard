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

### まず見る場所

- `README.md`: このテンプレートの入口
- `template.json`: テンプレートID、入力、出力、関連資料の定義
- `questions.json`: CLIでユーザーに確認する質問
- `inputs/user-brief.json`: 既定の入力値
- `knowledge/`: 人間が編集しやすいプロンプト・ルール・サンプル資料
- `references/`: 実行時にランナーが直接読む軽量参照ファイル
- `agents/`: 将来のエージェント分割実行に使うプロンプト
- `config/`: エージェント順序とワークフロー定義
- `commands/`: 実行手順の説明

### よく編集するファイル

- `references/prompt-template.md`: 完成版プロンプト
- `references/layout-selection-rules.md`: レイアウト選択ルール
- `references/output-format.md`: 出力形式
- `references/chapter-structure.md`: 章構成ルール
- `knowledge/00_共通ルール/`: MECE、意思決定、Insight、Recommendationなどの共通ルール
- `knowledge/01_企画書/`: 企画書テンプレート、章構成、出力フォーマット
- `knowledge/02_リサーチ/`: リサーチプロンプト、情報源評価、エビデンス抽出
- `knowledge/04_スライド/`: スライド表示内容、文字量、レイアウト選択ルール
- `knowledge/05_フレームワーク/`: 3C、SWOT、STP、AARRR、TAM/SAM/SOM
- `knowledge/99_サンプル/`: サンプル出力
- `inputs/user-brief.json`: 既定入力
- `questions.json`: CLIで聞く項目

## ディレクトリ構造

```text
consulting-deck-planner/
├── agents/          # エージェント別プロンプト
├── commands/        # 実行手順
├── config/          # 実行順・ワークフロー定義
├── inputs/          # 既定入力
├── knowledge/       # 編集しやすい業務知識・ルール・サンプル
├── references/      # ランナーが直接読む軽量参照
├── phases.json      # 実行フェーズ
├── questions.json   # CLI質問
└── template.json    # テンプレート定義
```

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
