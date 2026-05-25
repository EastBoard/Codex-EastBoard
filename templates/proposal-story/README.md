# Proposal Story Template

企画書ストーリー設計用テンプレートです。

## 入力

- `inputs/user-theme.json`

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

## 出力

`outputs/proposal-story/YYYYMMDD_HHMMSS/` に一式を保存します。
