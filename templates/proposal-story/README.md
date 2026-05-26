# Proposal Story Template

企画書ストーリー設計用テンプレートです。

## 入力

- `inputs/user-theme.json`
- `questions.json`: Codexがユーザーに質問する項目
- `phases.json`: Excelまでの分析フェーズと、確認後のスライド作成フェーズ

質問は、資料タイプと獲得したい判断から逆算して設計します。ユーザーが未定と答えた項目は、Codexが仮説として補い、`00_作成仮説` シートと `approval_request.json` に確認事項として残します。

今後の改善予定は `docs/roadmap.md` に履歴として残します。

## 推奨実行フロー

`npm start` で対話CLIを起動します。CLIはこのテンプレート定義を読み、以下を実行します。

1. テンプレート一覧に `proposal-story` を表示します。
2. ユーザーが `proposal-story` を選びます。
3. `questions.json` に沿ってテーマ、読者、目的などを質問します。
4. 回答を `inputs/user-theme.json` に反映します。
5. `phases.json` の `analysis` フェーズを実行し、Excel出力まで生成します。
6. Web調査が必要な根拠は `config/web-research.json` に従って検索・ページ取得を試み、結果を `web_research_results.json` とExcelへ出力します。
7. `proposal_story_analysis.xlsx`、`selected_story_review.md`、`approval_request.json` を表示して必ず停止します。
8. ユーザーがExcelを確認し、承認する場合だけ `npm run continue -- <analysis_run_dir>` を実行します。
9. `approval_decision.json` に `approve` が記録された場合だけPowerPointを生成します。

`01_承認確認` シートは次工程への入力です。`decision` に `approve / revise_story / merge_options / additional_research / stop` のいずれかを入力すると、`npm run continue -- <analysis_run_dir>` がその内容を読み取り、`approval_decision.json` と必要な後続タスクJSONへ反映します。

個別に実行したい場合は、従来通り以下も使えます。

```bash
npm run analysis:proposal-story
npm run continue -- outputs/proposal-story/YYYYMMDD_HHMMSS
```

`npm run slides:proposal-story` は内部用の低レベルコマンドです。承認なしでは失敗します。

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
- `agents/19_layout_registry_manager/`
- `agents/20_content_fit_validator/`
- `agents/21_excel_exporter/`

連続プロンプトの実行契約は `config/agent-pipeline.json` に定義します。各agentの `prompt.md`、入力、出力、実行フェーズ、Excel確認ゲートを機械可読にしたものです。実行結果には `agent_prompt_chain.json` として保存します。

Web調査の件数、タイムアウト、承認ゲートは `config/web-research.json` に定義します。

## 階層型OSルール

- 章 -> 第二階層 -> 第三階層 -> 根拠 -> スライドの順で生成します。
- 各章の冒頭に章全体像スライドを置きます。
- 1スライド = 1メッセージを固定します。
- 第二階層（論点）スライドとは別に、第三階層（根拠・事実）は1項目=1枚で `evidence` スライドとして分解します。
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

Excel確認後に `npm run continue -- <analysis_run_dir>` で承認した場合に、`proposal_story_slides.pptx` を同じ出力フォルダへ生成します。

- 元デザイン: `assets/design/slide_layout_collection_native.pptx`
- 方式: `layout_id` に対応する元PPTX内スライドを複製し、テキストを差し替え
- 未対応 `layout_id`: `standard_table` へフォールバック

## 出力

`outputs/proposal-story/YYYYMMDD_HHMMSS/` に一式を保存します。
