# 実行コマンド

## Phase 1: 企画書設計・Excel出力

```bash
npm run analysis:proposal-story
```

## Phase 2: スライド作成・PowerPoint出力

```bash
npm run continue -- outputs/proposal-story/YYYYMMDD_HHMMSS
```

Web調査が不足している場合、既定では approve できず停止します。例外的に進める場合だけ以下を使います。

```bash
npm run continue:yes -- outputs/proposal-story/YYYYMMDD_HHMMSS --allow-incomplete-research
```

## 起動

```bash
npm run start
```

`npm run start` は Phase 1 のExcel出力で必ず停止します。Excelと確認用Markdownを人間が確認し、承認した場合だけ `npm run continue -- ...` でPhase 2へ進みます。

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
26. ここで停止し、PowerPointは生成しない
27. `approval_decision.json` が `approve` になった場合だけ、PowerPointを生成する
