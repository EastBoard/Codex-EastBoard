# Codex EastBoard Templates

Codex 上で使う、プロンプト連続実行型テンプレート集です。

現在は `proposal-story` テンプレートを実装しています。ユーザー入力テーマから、複数の企画書ストーリー案を作り、比較評価し、最も採用しやすい企画書構成へ変換します。
要件定義2の拡張として、章構造、第二階層/第三階層の論点構造、Web根拠マッピング、1スライド1メッセージのスライドJSON生成まで対応しています。
要件定義3の拡張として、論理役割別の汎用 `layout_id` レジストリ、文字数・要素数の収まり検証、Renderer参照、PPTXデザイン参照にも対応しています。

## ディレクトリ構成

```txt
templates/
└── proposal-story/
    ├── template.json
    ├── README.md
    ├── agents/
    ├── commands/
    ├── config/
    └── inputs/

outputs/
└── proposal-story/
    └── YYYYMMDD_HHMMSS/
```

## できること

1. テーマを企画書論点へ変換
2. 背景・環境変化の調査観点を整理
3. 課題と目的を抽出
4. 最低3つのストーリー案を生成
5. 各ストーリーに対応する施策案を生成
6. Webエビデンス収集用の検索クエリと確認項目を生成
7. 固定評価軸で比較評価
8. 推奨ストーリーを選定
9. 企画書の章立て・スライド構成へ変換
10. Markdown と Excel 形式で出力
11. 章構造、章サマリー、論点構造を生成
12. スライドメッセージ、レイアウト、スライドJSONを生成
13. layout_id をレジストリで管理
14. content_fit_validator で文字数・要素数を検証
15. 指定PPTXをデザイン参照として保持

## 起動時のふるまい

`npm start` は `templates/` を起点にした対話CLIを起動します。Codexまたは利用者は、起動後に以下の順で進めます。

1. `templates/*/template.json` から利用可能なテンプレートを読み込む
2. テンプレートメニューを表示し、実行するテンプレートを選ぶ
3. 選択テンプレートの `questions.json` に沿って質問する
4. 回答をテンプレートの入力JSONへ反映する
5. 未定の回答はCodexが仮説化し、Excelに確認事項として残す
6. Phase 1 の分析・Excel出力を実行する
7. Excel確認ゲートで必ず停止する
8. 人間が `proposal_story_analysis.xlsx` と `selected_story_review.md` を確認する
9. 承認する場合だけ `npm run continue -- <analysis_run_dir>` でPhase 2へ進む

現在選べるテンプレートは `proposal-story` です。

```bash
npm start
```

確認なしで既定値・既存入力を使って分析フェーズまで試す場合は以下を使えます。

```bash
node src/template-cli.js --defaults
```

Excel確認後にPowerPoint生成へ進める場合は以下を使います。

```bash
npm run continue -- outputs/proposal-story/YYYYMMDD_HHMMSS
```

コマンドや入力反映の流れだけ確認する場合は以下を使えます。

```bash
node src/template-cli.js --dry-run
```

テンプレート一覧だけを見る場合は以下です。

```bash
node src/template-cli.js --list
```

## 直接実行

1. `templates/proposal-story/inputs/user-theme.json` を編集します。
2. 以下を実行します。

```bash
npm run generate:proposal-story
```

または明示的に以下を実行します。

```bash
npm run run:proposal-story
```

実運用では2フェーズ実行を推奨します。

```bash
npm run analysis:proposal-story
```

Excelと確認用ファイルを見て、承認する場合だけ以下を実行します。

```bash
npm run continue -- outputs/proposal-story/YYYYMMDD_HHMMSS
```

将来テンプレートが増えた場合は、共通入口として以下を使います。

```bash
npm run template
```

## 入力

`templates/proposal-story/inputs/user-theme.json`

```json
{
  "theme": "AIを活用したBtoB営業支援",
  "target_reader": "経営者・決裁者・事業責任者",
  "proposal_goal": "企画書で意思決定を得る",
  "industry": "",
  "company_context": "",
  "constraints": {
    "region": "日本",
    "language": "ja",
    "must_use_web_evidence": true,
    "minimum_story_options": 3
  }
}
```

## 出力

実行ごとに、秒まで含むフォルダ名で一式を保存します。

```txt
outputs/
└── proposal-story/
    └── YYYYMMDD_HHMMSS/
        ├── run_manifest.json
        ├── 00_orchestrator.json
        ├── 01_theme_interpreter.json
        ├── ...
        ├── 10_validation.json
        ├── final_report.md
        ├── agent_prompt_chain.json
        ├── approval_request.json
        ├── approval_decision.json
        ├── proposal_story_analysis.xlsx
        ├── proposal_story_slides.pptx
        ├── layout_registry.csv
        ├── final_slide_plan.json
        └── selected_story_review.md
```

例:

```txt
outputs/proposal-story/20260525_101234/final_report.md
outputs/proposal-story/20260525_101234/proposal_story_analysis.xlsx
outputs/proposal-story/20260525_101234/selected_story_review.md
```

## テンプレート追加方針

新しいテンプレートは `templates/<template-id>/` に作成します。

```txt
templates/<template-id>/
├── template.json
├── questions.json
├── phases.json
├── README.md
├── agents/
├── commands/
├── config/
└── inputs/
```

出力先は `outputs/<template-id>/YYYYMMDD_HHMMSS/` に揃えます。

## 今後の実装予定

`proposal-story` の未実装・改善予定は `templates/proposal-story/docs/roadmap.md` に履歴として管理します。

## 注意

この実装は、`templates/proposal-story/config/web-research.json` に従ってWeb検索とページ取得を試み、`web_research_plan.json`、`web_research_results.json`、`06_evidence_research.json`、ExcelのWeb調査シートへ結果を出力します。ネットワーク制限、検索エンジン側の応答、取得先サイトの制限により根拠が不足した場合は、Excel確認ゲートで追加調査として扱います。

Web調査が不足している状態では、既定ではPowerPoint生成を承認できません。例外的に進める場合だけ `--allow-incomplete-research` を指定してください。

```bash
# 例: Web調査が0/3のままでもスライド生成を進める（非推奨）
npm run continue:yes -- outputs/proposal-story/YYYYMMDD_HHMMSS --allow-incomplete-research
```
