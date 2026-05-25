# Proposal Story Agent

ユーザー入力テーマから、複数の企画書ストーリー案を作り、比較評価し、最も採用しやすい企画書構成へ変換する Codex 用プロジェクトです。

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

## 使い方

1. `inputs/user-theme.json` を編集します。
2. 以下を実行します。

```bash
npm run start
```

## 入力

`inputs/user-theme.json`

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

- `outputs/final_report.md`
- `outputs/proposal_story_analysis.xlsx`
- `outputs/01_theme_interpreter.json` から `outputs/10_validation.json`
- `PendingApproval/selected_story_review.md`

## 注意

この実装は、Codex 上で企画書ストーリー設計を進めるための土台です。外部Web検索APIには接続しません。実際のURL付き根拠は、出力された検索クエリを使ってCodexやブラウザで確認し、必要に応じて追記してください。
