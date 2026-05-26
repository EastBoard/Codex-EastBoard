# Proposal Story Roadmap

この文書は、現在の実装で到達している範囲と、次回以降に実装予定の改善タスクを残すための履歴です。

## 現在できていること

- `templates/` 起点の対話CLIでテンプレートを選択する
- 資料タイプと獲得したい判断から逆算して質問する
- 未定回答をCodex側で仮説化し、Excelの `00_作成仮説` に残す
- Web調査計画を `web_research_plan.json` に出力する
- Web検索・ページ取得を試み、結果を `web_research_results.json` とExcelへ出力する
- `proposal_story_analysis.xlsx`、`selected_story_review.md`、`approval_request.json` を出力して必ず停止する
- 承認後のみ `npm run continue -- <run-dir>` でPowerPoint生成へ進む
- Excelの `01_承認確認` を読み戻し、`approval_decision.json` に反映する
- `additional_research`、`merge_options`、`revise_story` の場合は後続タスクJSONを出力して停止する
- Web根拠の有無に基づき、比較評価スコアを補正してExcelへ出力する

## 次回以降の実装予定

### 1. Excel品質の改善

- 列幅、折り返し、見出しスタイル、フィルター、固定行を設定する
- 入力・確認が必要なセルを色分けする
- `00_レビュー手順`、`00_作成仮説`、`03_Web調査結果`、`07_比較評価`、`08_推奨案` をレビューしやすい順・体裁に整える
- 現在の自前XML生成から、より表現力のあるExcel生成方式への移行を検討する

### 2. Web調査品質の改善

- 公的機関、企業公式、業界団体、調査会社を優先するスコアリングを実装する
- 検索結果の重複URL、低品質記事、広告的ページを除外する
- 出典ごとに `source_type`、`source_quality_score`、`usable_for_slide` を付与する
- 調査不足時に、追加で必要な検索クエリを自動生成する

### 3. 評価再計算の高度化

- 現在はWeb根拠がない評価軸を1点減点する簡易補正
- 次は出典品質、根拠タイプ、根拠の新しさを加味してスコアを再計算する
- 複数根拠がある場合の加点、低品質根拠の減点、矛盾根拠の警告を実装する

### 4. Excel確認結果の反映強化

- 現在は `01_承認確認` の固定項目を読み戻す
- 次はExcel上のストーリー案・評価・スライド構成の修正セルも読み戻す
- Excel修正がある場合は、PowerPoint生成前に `17_slide_json_builder.json` を再生成する

### 5. agents prompt の実LLM連続実行

- `config/agent-pipeline.json` を実行計画として読み、各 `agents/*/prompt.md` を順番に実行する
- 各agentの入力JSON、出力JSON、失敗時リトライ、検証を共通化する
- 現在のローカル固定生成ロジックを、LLM実行とローカルfallbackの二層構成にする

### 6. 質問精度のさらなる改善

- 資料タイプごとに質問セットを切り替える
- 回答が未定の場合、Codexが2から3個の仮説候補を提示して選ばせる
- 回答内容に応じて追加質問を分岐する
- 質問ごとに「この回答がどのシート・スライドへ反映されるか」を表示する

## 優先順位

1. Excel品質の改善
2. Excel確認結果の反映強化
3. 評価再計算の高度化
4. Web調査品質の改善
5. agents prompt の実LLM連続実行
6. 質問分岐の高度化
