# Proposal Story Template

企画書ストーリー設計用テンプレートです。

## 入力

- `inputs/user-theme.json`
- `questions.json`: Codexがユーザーに質問する項目
- `phases.json`: Excelまでの分析フェーズと、確認後のスライド作成フェーズ

## 推奨実行フロー

1. Codexがテンプレート一覧を提示します。
2. ユーザーが `proposal-story` を選びます。
3. Codexが `questions.json` に沿ってテーマ、読者、目的などを質問します。
4. 回答を `inputs/user-theme.json` に反映します。
5. `npm run analysis:proposal-story` でExcel出力まで実行します。
6. Codexが「スライド作成まで進めますか？」と確認します。
7. Yesの場合、`npm run slides:proposal-story -- --run-dir <analysis_run_dir>` でPowerPointを生成します。

## エージェント

- `agents/00_orchestrator/`
- `agents/01_theme_interpreter/`
- `agents/02_environment_research/`
- `agents/03_issue_objective/`
- `agents/04_story_generator/`
- `agents/05_solution_generator/`
- `agents/06_evidence_research/`
- `agents/07_evaluation/`
- `agents/08_recommendation/`
- `agents/09_deck_outline/`
- `agents/10_validation/`
- `agents/11_chapter_designer/`
- `agents/12_chapter_summary/`
- `agents/13_argument_builder/`
- `agents/14_evidence_mapping/`
- `agents/15_slide_message_builder/`
- `agents/16_slide_layout_selector/`
- `agents/17_slide_json_builder/`
- `agents/18_slide_validation/`

## 階層型OSルール

- 章 -> 第二階層 -> 第三階層 -> 根拠 -> スライドの順で生成します。
- 各章の冒頭に章全体像スライドを置きます。
- 1スライド = 1メッセージを固定します。
- スライドJSONは `schemas/slide-schema.json` に合わせます。
- `layout_id` は `config/layout-registry.json` に定義されたものだけを使います。
- レイアウトはテーマではなく、論理役割と要素数で選びます。
- 文字数・要素数は `20_content_fit_validator` で検証します。
- デザイン参照は `assets/design/slide_layout_collection_native.pptx` です。

## レイアウト関連ファイル

- `config/layout-registry.json`
- `config/layout-selection-rules.json`
- `config/chapter-layout-map.json`
- `config/layout-content-rules.json`
- `schemas/layout-schema.json`
- `schemas/slide-schema.json`
- `renderer/SlideRenderer.tsx`

## PowerPoint出力

`npm run start` 実行時に、`proposal_story_slides.pptx` を同じ出力フォルダへ生成します。

- 元デザイン: `assets/design/slide_layout_collection_native.pptx`
- 方式: `layout_id` に対応する元PPTX内スライドを複製し、テキストを差し替え
- 未対応 `layout_id`: `standard_table` へフォールバック

## 出力

`outputs/proposal-story/YYYYMMDD_HHMMSS/` に一式を保存します。
