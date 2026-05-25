# 実行コマンド

## Phase 1: 企画書設計・Excel出力

```bash
npm run analysis:proposal-story
```

## Phase 2: スライド作成・PowerPoint出力

```bash
npm run slides:proposal-story -- --run-dir outputs/proposal-story/YYYYMMDD_HHMMSS
```

## 一括実行

```bash
npm run start
```

## 処理順

1. `inputs/user-theme.json` を読む
2. 設定ファイルを読む
3. テーマ解釈を生成する
4. 背景・環境変化の調査観点を生成する
5. 課題・目的を抽出する
6. 複数ストーリー案を生成する
7. 施策案を生成する
8. エビデンス調査タスクを生成する
9. 比較評価する
10. 推奨案を選ぶ
11. 企画書構成へ変換する
12. 検証結果を作る
13. 章構造を生成する
14. 章サマリーを生成する
15. 第二階層・第三階層の論点構造を生成する
16. 論点と根拠をマッピングする
17. 1スライド1メッセージへ変換する
18. スライドレイアウトを選定する
19. スライドJSONを生成する
20. スライド構造を検証する
21. layout-registry.json の整合性を検証する
22. 文字数・要素数の収まりを検証する
23. Excel出力シート構成を生成する
24. `outputs/proposal-story/YYYYMMDD_HHMMSS/` フォルダを作成する
25. Markdown、Excel、承認用ファイル、layout_registry.csv、final_slide_plan.json を同じ出力フォルダへ保存する
