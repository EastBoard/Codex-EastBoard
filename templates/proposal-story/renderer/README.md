# Renderer Reference

`SlideRenderer.tsx` は、`17_slide_json_builder.json` の slide JSON を React/HTML/Remotion などで描画するための参照実装です。

## 重要

- `layout_id` ごとに描画コンポーネントを切り替えます。
- 未対応 `layout_id` は `StandardTableSlide` にフォールバックします。
- PowerPoint出力時は `assets/design/slide_layout_collection_native.pptx` のデザインを参照してください。
- 現時点ではプロジェクトの `npm run start` ではビルド対象にしていません。
