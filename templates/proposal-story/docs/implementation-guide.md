# 実装ガイド

## 実装目的

テーマが変わっても、スライドにテキストが反映されない問題を防ぐため、汎用レイアウトを論理役割別に固定し、layout_id、JSON Schema、文字数制限、要素数制限で制御する。

## Codexでの実装順

1. config/layout-registry.json を読み込む
2. config/layout-selection-rules.json を読み込む
3. config/chapter-layout-map.json を読み込む
4. 各スライドの main_message / logical_role / item_count / has_numeric_data を判定する
5. agents/16_slide_layout_selector/prompt.md で layout_id を選ぶ
6. agents/17_slide_json_builder/prompt.md でスライドJSONを生成する
7. agents/20_content_fit_validator/prompt.md で文字数と要素数を検証する
8. agents/18_slide_validation/prompt.md で最終検証する
9. proposal_layout_management.xlsx で人間が確認する

## 必須ルール

- layout_id は必ず layout-registry.json にあるものだけを使う
- 各章の最初は chapter_overview にする
- 1スライド = 1メッセージ
- max_items を超えたらスライド分割
- body_max を超えたら短縮
- データがない場合は chart 系を使わない
- 不明な場合は standard_table にフォールバックする
