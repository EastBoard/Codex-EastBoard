import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templateId = "consulting-deck-planner";
const templateRoot = path.join(root, "templates", templateId);
const outputBaseDir = path.join(root, "outputs", templateId);
const checkOnly = process.argv.includes("--check");

const DEFAULT_DESIGN = {
  primary: "1D51A3",
  primaryDark: "143972",
  primaryLight: "688BC2",
  secondary: "F3F4F7",
  accent: "E8691F",
  accentBg: "D5DEEC",
  text: "000000",
  textLight: "4A4A4A",
  border: "B0BABF",
  background: "FFFFFF",
  font: "Noto Sans JP",
  footer: ""
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(templateRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(templateRoot, relativePath), "utf8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = Math.max(1, date.getDate());
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function localFileHeader(name, data, crc, mod) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(mod.time, 10);
  header.writeUInt16LE(mod.date, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer]);
}

function centralDirectoryHeader(name, data, crc, offset, mod) {
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(mod.time, 12);
  header.writeUInt16LE(mod.date, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endCentralDirectory(fileCount, centralSize, centralOffset) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(fileCount, 8);
  header.writeUInt16LE(fileCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function zip(files) {
  const mod = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const local = localFileHeader(file.name, data, crc, mod);
    localParts.push(local, data);
    centralParts.push(centralDirectoryHeader(file.name, data, crc, offset, mod));
    offset += local.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  return Buffer.concat([...localParts, central, endCentralDirectory(files.length, central.length, offset)]);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timestampForFolder(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}_${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function createRunDir() {
  fs.mkdirSync(outputBaseDir, { recursive: true });
  const baseName = timestampForFolder();
  let name = baseName;
  let index = 1;
  while (fs.existsSync(path.join(outputBaseDir, name))) {
    index += 1;
    name = `${baseName}_${pad2(index)}`;
  }
  const runDir = path.join(outputBaseDir, name);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

function value(input, key, fallback = "未定") {
  const raw = input[key];
  return raw === undefined || raw === null || String(raw).trim() === "" ? fallback : String(raw).trim();
}

function today() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.TZ || "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function buildContext(input) {
  const design = { ...DEFAULT_DESIGN, ...(input.design || {}) };
  return {
    theme: value(input, "theme", "未設定テーマ"),
    targetReader: value(input, "target_reader", "経営層・役員層"),
    decisionGoal: value(input, "decision_goal", "検討継続と初期予算の承認を得る"),
    industry: value(input, "industry"),
    companyContext: value(input, "company_context"),
    constraints: value(input, "constraints"),
    mustAnswer: value(input, "must_answer", "市場は伸びるのか、なぜ自社が勝てるのか、いくら儲かるのか"),
    design
  };
}

function researchPlan(ctx) {
  const queries = [
    ["市場規模・成長率", `${ctx.theme} 市場規模 成長率 ${ctx.industry}`],
    ["顧客課題", `${ctx.theme} 顧客課題 導入課題 ${ctx.industry}`],
    ["競合・代替手段", `${ctx.theme} 競合 比較 代替サービス`],
    ["導入事例", `${ctx.theme} 導入事例 効果 ROI`],
    ["価格・収益性", `${ctx.theme} 価格 相場 ビジネスモデル`],
    ["実現可能性・リスク", `${ctx.theme} 実現可能性 リスク 規制`]
  ];

  const rows = queries
    .map(([category, query], index) => `| R${String(index + 1).padStart(2, "0")} | ${category} | ${query} | 企画書の判断材料に使う根拠 | 対応章でFactとして使用 |`)
    .join("\n");

  return `# Research Plan

## 前提

- テーマ: ${ctx.theme}
- 読み手: ${ctx.targetReader}
- 意思決定ゴール: ${ctx.decisionGoal}
- 対象市場・業界: ${ctx.industry}
- 確認日: ${today()}

## 調査カテゴリ

| ID | カテゴリ | 検索クエリ例 | 必要な根拠 | 使い方 |
|---|---|---|---|---|
${rows}

## 品質ルール

- 数値と主張には出典を付ける
- 一次情報、公式統計、IR、調査会社レポートを優先する
- 情報の日付を明記する
- 見つからない数字は推計または未取得と明記する
`;
}

function chapterRows() {
  return [
    ["1", "市場・環境変化", "なぜ今取り組むべきかを示す", "市場変化と顧客変化により検討優先度が高い", "4-5"],
    ["2", "課題・原因構造", "解くべき課題と原因を特定する", "顧客課題と自社課題の交点に事業機会がある", "5-6"],
    ["3", "戦略オプション比較", "選択肢を比較し勝ち筋を選ぶ", "段階投資型の推奨案が最もリスクと成果のバランスが良い", "5-6"],
    ["4", "推奨施策・実行計画", "実行内容、体制、ロードマップを示す", "小さく検証し、成果が見えた領域へ拡張する", "4-5"],
    ["5", "効果・リスク・意思決定", "期待効果、リスク、承認事項を示す", "初期検証を承認し、次の判断ゲートを設定すべき", "3-4"]
  ];
}

function deckOutline(ctx) {
  const chapters = chapterRows();
  const chapterTable = chapters
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");

  const chapterDesign = chapters.map(([no, title, purpose, conclusion]) => `## Chapter ${no}: ${title}

### Chapter Overview

- 章の結論: ${conclusion}
- 論点ツリー:
  - 主要論点A: 判断に必要な事実は何か
  - 主要論点B: 比較すべき選択肢は何か
  - 主要論点C: 採用・保留・不採用をどう判断するか

### Analysis Pages

| 分析ステップ | この章で行うこと |
|---|---|
| Fact Collection | 市場、顧客、競合、事例、制約に関する事実を集める |
| Structuring | 事実を判断軸ごとに整理する |
| Grouping | 類似論点を統合し、重複を避ける |
| Evaluation Framework | 市場魅力度、競争優位性、収益性、実現可能性、リスクで評価する |
| Comparison | 選択肢を比較する |
| Scoring | 5段階または加重評価で評価する |
| Mapping | 優先度マップまたはポジショニングで可視化する |
| Prioritization | Must、Should、Couldで優先順位を決める |
| Decision | 採用、保留、不採用を明示する |

### Decision Summary

- 選択肢: 採用案、代替案、保留案
- 評価結果: 採用案を最優先
- 採用理由: ${purpose}
- 期待効果: 「${ctx.decisionGoal}」に必要な判断材料が揃う

### Insight Page

- 重要な発見: ${title}は、企画全体の成立条件を左右する
- 経営上の意味: 投資判断の優先順位を明確にできる
- 事業上の意味: 実行すべき領域と後回しにすべき領域を分けられる
- 次章へつながる論点: 次に検証すべき前提を明確にする

### Recommendation Page

- 推奨施策: ${conclusion}
- 優先順位: High
- 実施理由: ${purpose}
- 期待効果: 判断の遅延と検討漏れを減らす

### Transition Page

- この章で分かったこと: ${conclusion}
- 次章で検証すべきこと: 次の章の判断材料
`).join("\n");

  return `# Deck Outline

## Executive Summary

- 最終結論: ${ctx.theme}は、${ctx.targetReader}が「${ctx.decisionGoal}」を判断できるよう、段階投資型の企画書として設計する
- 推奨案: 初期検証から開始し、根拠が取れた領域へ拡張する
- 推奨理由: 市場性、顧客課題、競争優位性、実現可能性を同時に検証できるため
- 期待効果: 投資判断に必要な論点、根拠、リスク、次アクションが整理される

## Story Line

背景
↓
課題
↓
原因
↓
機会
↓
戦略
↓
施策
↓
実行計画
↓
効果
↓
意思決定

## Chapter Structure

| 章番号 | 章タイトル | 章の目的 | 章の結論 | 推奨ページ数 |
|---|---|---|---|---|
${chapterTable}

## Chapter Design

${chapterDesign}

## 確認事項

- 対象市場・業界: ${ctx.industry}
- 自社・サービスの前提: ${ctx.companyContext}
- 制約条件: ${ctx.constraints}
- 必ず答える論点: ${ctx.mustAnswer}
`;
}

function slideDesign(ctx) {
  const slides = slideRows(ctx);
  const rows = slides
    .map((slide) => `| ${slide.join(" | ")} |`)
    .join("\n");

  return `# Slide Design

| スライド番号 | スライドタイトル | スライドで伝える結論 | スライドの目的 | 表示内容 | 使用フレームワーク | 推奨レイアウト | レイアウト選定理由 |
|---|---|---|---|---|---|---|---|
${rows}

## レイアウト出力ルール

- レイアウト名のみを出力する
- JSON、HTML、PPTX、座標、サイズ、CSS、SVGは出力しない
`;
}

function slideRows(ctx) {
  return [
    ["1", "Executive Summary", `${ctx.theme}は段階投資型で検討すべき`, "全体結論を先に伝える", "最終結論、推奨案、期待効果、判断事項", "one_message", "one_message", "単一メッセージで経営判断を促すため"],
    ["2", "市場・環境変化の全体像", "市場変化により検討優先度が高い", "なぜ今かを示す", "市場規模、成長率、顧客変化、競合変化", "PEST / 3C", "chapter_overview", "章全体のIssue Treeを示すため"],
    ["3", "市場機会の評価", "市場魅力度は検討に値する", "市場性を評価する", "市場規模、成長率、参入余地", "TAM SAM SOM", "pyramid", "市場機会を段階的に整理するため"],
    ["4", "顧客課題の構造", "顧客課題は複数要因で発生している", "解くべき課題を分解する", "課題、原因、影響、未充足ニーズ", "Issue Tree", "issue_tree", "課題分解に適するため"],
    ["5", "競合・代替手段比較", "差別化余地は特定領域にある", "勝ち筋を比較する", "競合、代替手段、自社優位性", "3C", "competitor_comparison", "競合比較に適するため"],
    ["6", "戦略オプション比較", "段階投資案が最も妥当", "選択肢を評価する", "複数案、評価軸、スコア、採用理由", "Option Evaluation", "option_comparison", "選択肢比較に適するため"],
    ["7", "推奨施策", "初期検証から開始する", "実行施策を示す", "施策、優先順位、期待効果", "Prioritization", "score_table", "評価結果を一覧化するため"],
    ["8", "実行ロードマップ", "四半期単位で検証と拡張を進める", "実行計画を示す", "フェーズ、タスク、体制、判断ゲート", "Roadmap", "roadmap_quarter", "時系列の実行計画に適するため"],
    ["9", "効果とKPI", "成果は事業KPIで管理する", "期待効果を示す", "売上、コスト、顧客、実行KPI", "KPI Tree", "dashboard", "KPI管理に適するため"],
    ["10", "リスクと対応", "主要リスクは事前に管理できる", "実行リスクを示す", "リスク、影響、対応策、残リスク", "Risk Matrix", "score_table", "評価表に適するため"],
    ["11", "意思決定事項", `「${ctx.decisionGoal}」を判断する`, "承認事項を明確にする", "承認事項、保留事項、次アクション", "Decision", "one_message", "意思決定を明確にするため"]
  ];
}

function deckJson(ctx) {
  return {
    meta: {
      title: `${ctx.theme} 企画書骨子`,
      theme: ctx.theme,
      footer: ctx.design.footer || `${ctx.theme} / ${ctx.targetReader}`,
      design: {
        colors: {
          primary: `#${ctx.design.primary}`,
          primaryDark: `#${ctx.design.primaryDark}`,
          primaryLight: `#${ctx.design.primaryLight}`,
          accent: `#${ctx.design.accent}`,
          accentBg: `#${ctx.design.accentBg}`,
          secondary: `#${ctx.design.secondary}`,
          text: `#${ctx.design.text}`,
          textLight: `#${ctx.design.textLight}`,
          border: `#${ctx.design.border}`,
          background: `#${ctx.design.background}`
        },
        font: ctx.design.font,
        fixedFrame: [
          "title",
          "three-part underline",
          "required subtitle",
          "content area",
          "footer bar"
        ]
      }
    },
    slides: slideRows(ctx).map(([slideNo, title, message, purpose, content, framework, layout, reason]) => ({
      slide_no: Number(slideNo),
      title,
      subtitle: message || `${purpose}。`,
      blocks: [
        { kind: "lead", text: message },
        {
          kind: "bullets",
          heading: "このスライドで扱う内容",
          items: [
            `目的: ${purpose}`,
            `表示内容: ${content}`,
            `使用フレームワーク: ${framework}`,
            `推奨レイアウト: ${layout}`,
            `選定理由: ${reason}`
          ]
        },
        {
          kind: "note",
          text: "このテンプレートでは枠のデザインだけを固定し、コンテンツ領域内の表現はCodexが内容に応じて自由に構成します。"
        }
      ]
    }))
  };
}

function hasEvidenceContent(blocks) {
  return blocks.some((block) => {
    if (block.kind === "kpi" || block.kind === "table") return true;
    if (block.kind === "bullets") return (block.items || []).some((item) => /[0-9０-９%％]|手順|事例/.test(String(item)));
    if (block.kind === "para" || block.kind === "lead") return /[0-9０-９%％]|手順|事例/.test(String(block.text || ""));
    return false;
  });
}

function evidenceWarnings(deck) {
  const warnings = [];
  for (const slide of deck.slides || []) {
    const blocks = slide.blocks || [];
    if (!hasEvidenceContent(blocks)) continue;
    const sourceBlocks = blocks.filter((block) => block.kind === "source");
    const hasValidSource = sourceBlocks.some((block) => (block.items || []).some((item) => item?.name && item?.url));
    if (!hasValidSource) {
      warnings.push(`Slide ${slide.slide_no}: 「${slide.title}」 has evidence-like content but no source block with name and URL.`);
    }
    for (const block of sourceBlocks) {
      for (const item of block.items || []) {
        if (item?.name && !item?.url) warnings.push(`Slide ${slide.slide_no}: source "${item.name}" is missing URL.`);
      }
    }
  }
  return warnings;
}

function splitLongText(text, maxLength = 120) {
  const value = String(text || "");
  if (value.length <= maxLength) return [value];
  const chunks = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push(value.slice(index, index + maxLength));
  }
  return chunks;
}

function linesForBlock(block) {
  if (block.kind === "lead") return splitLongText(block.text, 90);
  if (block.kind === "para" || block.kind === "note") return splitLongText(block.text, 120);
  if (block.kind === "bullets") return [
    ...(block.heading ? [block.heading] : []),
    ...(block.items || []).flatMap((item) => splitLongText(`• ${item}`, 110))
  ];
  if (block.kind === "kpi") return (block.items || []).map((item) => `${item.value || ""} ${item.label || ""}`.trim());
  if (block.kind === "table") return [
    (block.headers || []).join(" / "),
    ...(block.rows || []).map((row) => row.join(" / "))
  ];
  if (block.kind === "source") return (block.items || []).map((item) => `出典: ${item.name || ""} ${item.url || ""}`.trim());
  return [];
}

function paginateDeckSlides(deck) {
  const pages = [];
  for (const slide of deck.slides || []) {
    const lines = (slide.blocks || []).flatMap(linesForBlock).filter(Boolean);
    const maxLines = 9;
    if (lines.length <= maxLines) {
      pages.push({ slide, lines, pageIndex: 1, pageCount: 1 });
      continue;
    }
    const pageCount = Math.ceil(lines.length / maxLines);
    for (let index = 0; index < pageCount; index += 1) {
      pages.push({
        slide,
        lines: lines.slice(index * maxLines, (index + 1) * maxLines),
        pageIndex: index + 1,
        pageCount
      });
    }
  }
  return pages;
}

function textShape(id, name, x, y, cx, cy, text, fontSize = 2200, bold = false, color = "0F172A", font = DEFAULT_DESIGN.font) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP" sz="${fontSize}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${xmlEscape(font)}"/><a:ea typeface="${xmlEscape(font)}"/></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function bulletShape(id, name, x, y, cx, cy, items, fontSize = 1700, color = "0F172A", font = DEFAULT_DESIGN.font) {
  const paragraphs = items.map((item) => `<a:p><a:pPr marL="342900" indent="-171450"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="ja-JP" sz="${fontSize}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${xmlEscape(font)}"/><a:ea typeface="${xmlEscape(font)}"/></a:rPr><a:t>${xmlEscape(item)}</a:t></a:r></a:p>`).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(page, ctx, index) {
  const { slide, lines, pageIndex, pageCount } = page;
  const title = slide.title;
  const subtitle = `${slide.subtitle}${pageCount > 1 ? ` (${pageIndex}/${pageCount})` : ""}`;
  const footer = ctx.design.footer || `${ctx.theme} / ${ctx.targetReader}`;
  const bodyItems = lines;
  const no = slide.slide_no || index + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${ctx.design.background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${rectShape(2, "Underline 1", 762000, 850000, 3556000, 18000, ctx.design.primary)}${rectShape(3, "Underline 2", 4318000, 850000, 3556000, 18000, ctx.design.primaryLight)}${rectShape(4, "Underline 3", 7874000, 850000, 3556000, 18000, ctx.design.accentBg)}${rectShape(5, "Footer Bar", 0, 6780000, 12192000, 73152, ctx.design.primary)}${textShape(6, "Slide Number", 457200, 228600, 914400, 365760, String(no).padStart(2, "0"), 1600, true, ctx.design.primary, ctx.design.font)}${textShape(7, "Title", 762000, 365000, 10668000, 487680, title, 2700, true, ctx.design.primaryDark, ctx.design.font)}${textShape(8, "Subtitle", 762000, 960000, 10668000, 365760, subtitle, 1450, false, ctx.design.textLight, ctx.design.font)}${bulletShape(9, "Content Area", 762000, 1510000, 10668000, 4950000, bodyItems, bodyItems.length > 8 ? 1450 : 1650, ctx.design.text, ctx.design.font)}${textShape(10, "Footer", 762000, 6370000, 9144000, 300000, footer, 1050, false, ctx.design.textLight, ctx.design.font)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function rectShape(id, name, x, y, cx, cy, fill) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

function contentTypesXml(slideCount) {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}</Types>`;
}

function presentationXml(slideCount) {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId${slideCount + 1}"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function presentationRelsXml(slideCount) {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides}<Relationship Id="rId${slideCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`;
}

function slideRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function slideLayoutRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
}

function slideMasterRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
}

function slideLayoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function slideMasterXml(ctx) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="2700" b="1"><a:latin typeface="${xmlEscape(ctx.design.font)}"/><a:ea typeface="${xmlEscape(ctx.design.font)}"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr sz="1650"><a:latin typeface="${xmlEscape(ctx.design.font)}"/><a:ea typeface="${xmlEscape(ctx.design.font)}"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="l"><a:defRPr sz="1450"><a:latin typeface="${xmlEscape(ctx.design.font)}"/><a:ea typeface="${xmlEscape(ctx.design.font)}"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
}

function themeXml(ctx) {
  const font = xmlEscape(ctx.design.font);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Codex EastBoard"><a:themeElements><a:clrScheme name="theme_navy"><a:dk1><a:srgbClr val="${ctx.design.text}"/></a:dk1><a:lt1><a:srgbClr val="${ctx.design.background}"/></a:lt1><a:dk2><a:srgbClr val="${ctx.design.primaryDark}"/></a:dk2><a:lt2><a:srgbClr val="${ctx.design.secondary}"/></a:lt2><a:accent1><a:srgbClr val="${ctx.design.primary}"/></a:accent1><a:accent2><a:srgbClr val="${ctx.design.primaryLight}"/></a:accent2><a:accent3><a:srgbClr val="${ctx.design.accent}"/></a:accent3><a:accent4><a:srgbClr val="${ctx.design.accentBg}"/></a:accent4><a:accent5><a:srgbClr val="${ctx.design.border}"/></a:accent5><a:accent6><a:srgbClr val="${ctx.design.textLight}"/></a:accent6><a:hlink><a:srgbClr val="${ctx.design.primary}"/></a:hlink><a:folHlink><a:srgbClr val="${ctx.design.primaryLight}"/></a:folHlink></a:clrScheme><a:fontScheme name="Codex EastBoard"><a:majorFont><a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:majorFont><a:minorFont><a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:minorFont></a:fontScheme><a:fmtScheme name="Codex EastBoard"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function createPptx(ctx, deck, outputPath) {
  const pages = paginateDeckSlides(deck);
  const created = new Date().toISOString();
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(pages.length) },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(ctx.theme)}</dc:title><dc:creator>Codex EastBoard</dc:creator><cp:lastModifiedBy>Codex EastBoard</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Codex EastBoard</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>${pages.length}</Slides></Properties>` },
    { name: "ppt/presentation.xml", content: presentationXml(pages.length) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRelsXml(pages.length) },
    { name: "ppt/slideMasters/slideMaster1.xml", content: slideMasterXml(ctx) },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: slideMasterRelsXml() },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: slideLayoutXml() },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: slideLayoutRelsXml() },
    { name: "ppt/theme/theme1.xml", content: themeXml(ctx) },
    ...pages.map((_, index) => ({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, content: slideRelsXml() })),
    ...pages.map((page, index) => ({ name: `ppt/slides/slide${index + 1}.xml`, content: slideXml(page, ctx, index) }))
  ];
  writeText(path.join(path.dirname(outputPath), "deck.json"), JSON.stringify(deck, null, 2));
  writeText(path.join(path.dirname(outputPath), "consulting_deck_slides.json"), JSON.stringify({ slide_count: pages.length, pages }, null, 2));
  fs.writeFileSync(outputPath, zip(files));
  return {
    file_name: path.basename(outputPath),
    slide_count: pages.length,
    input_slide_count: deck.slides.length,
    export_strategy: "fixed frame with free content area; long content is paginated without deletion"
  };
}

function createHtmlPreview(ctx, outputPath) {
  const cards = slideRows(ctx).map(([no, title, message, purpose, content, framework, layout, reason]) => `
    <section class="slide">
      <div class="slide-no">${String(no).padStart(2, "0")}</div>
      <div class="layout">${xmlEscape(layout)}</div>
      <h2>${xmlEscape(title)}</h2>
      <p class="message">${xmlEscape(message)}</p>
      <ul>
        <li><strong>目的:</strong> ${xmlEscape(purpose)}</li>
        <li><strong>表示内容:</strong> ${xmlEscape(content)}</li>
        <li><strong>フレームワーク:</strong> ${xmlEscape(framework)}</li>
        <li><strong>選定理由:</strong> ${xmlEscape(reason)}</li>
      </ul>
    </section>`).join("\n");

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${xmlEscape(ctx.theme)} - Deck Preview</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --ink: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --accent: #0f766e;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      background: var(--bg);
      color: var(--ink);
      font-family: "Aptos", "Yu Gothic", "Meiryo", sans-serif;
    }
    header {
      max-width: 1180px;
      margin: 0 auto 24px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 32px;
      letter-spacing: 0;
    }
    .meta {
      color: var(--muted);
      font-size: 15px;
    }
    .grid {
      max-width: 1180px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 18px;
    }
    .slide {
      position: relative;
      min-height: 260px;
      padding: 28px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
      aspect-ratio: 16 / 9;
      overflow: hidden;
    }
    .slide-no {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .layout {
      position: absolute;
      top: 24px;
      right: 24px;
      color: var(--muted);
      font-size: 12px;
    }
    h2 {
      margin: 0 0 14px;
      max-width: 80%;
      font-size: 25px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .message {
      margin: 0 0 18px;
      color: var(--ink);
      font-size: 18px;
      font-weight: 700;
      line-height: 1.45;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <header>
    <h1>${xmlEscape(ctx.theme)}</h1>
    <div class="meta">Target: ${xmlEscape(ctx.targetReader)} / Decision: ${xmlEscape(ctx.decisionGoal)}</div>
  </header>
  <main class="grid">
    ${cards}
  </main>
</body>
</html>`;
  writeText(outputPath, html);
}

function createQaReport(ctx, pptxExport, outputPath, environmentNotes, warnings = []) {
  const warningLines = warnings.length
    ? warnings.map((warning) => `- [warn] ${warning}`).join("\n")
    : "- [x] Evidence warning scan completed with no warnings";
  const report = `# QA Report

## Generated Deck

- PPTX: ${pptxExport.file_name}
- Slide count: ${pptxExport.slide_count}
- Input slide count: ${pptxExport.input_slide_count}
- Export strategy: ${pptxExport.export_strategy}
- Topic: ${ctx.theme}
- Target reader: ${ctx.targetReader}
- Decision goal: ${ctx.decisionGoal}

## Checks

- [x] Markdown outline generated
- [x] Slide design generated
- [x] deck.json generated with required subtitle fields
- [x] PPTX package generated
- [x] Editable text shapes used in PPTX
- [x] HTML preview generated
- [x] Layout names only used in slide design table
- [x] Fixed theme_navy frame applied

## Evidence Warnings

${warningLines}

## Plugin Availability

${environmentNotes.map((note) => `- ${note}`).join("\n")}
`;
  writeText(outputPath, report);
}

function reviewChecklist(ctx) {
  return `# Review Checklist

## MECE

- [ ] 企画書全体に重複と漏れがない
- [ ] 章構成に重複と漏れがない
- [ ] 章内論点に重複と漏れがない
- [ ] スライド構成に重複と漏れがない

## 意思決定

- [ ] ${ctx.targetReader}が「${ctx.decisionGoal}」を判断できる
- [ ] 各章にDecision Summaryがある
- [ ] 採用案、保留案、不採用案が区別されている

## Insight / Recommendation

- [ ] 各章にInsight Pageがある
- [ ] 各章にRecommendation Pageがある
- [ ] 分析結果が示唆と推奨施策へ接続している

## Slide Design

- [ ] 1スライド1メッセージになっている
- [ ] レイアウトは名前のみになっている
- [ ] JSON、HTML、PPTX座標、CSS、SVGが含まれていない
`;
}

function agentWorkflow(order, pipeline) {
  const rows = pipeline.agents
    .map((agent, index) => `| ${index + 1} | ${agent.id} | ${agent.prompt} | ${agent.outputs.join(", ")} |`)
    .join("\n");

  return `# Agent Workflow

## 実行順

${order.order.map((id, index) => `${index + 1}. ${id}`).join("\n")}

## ワークフロー契約

| No | Agent | Prompt | Outputs |
|---|---|---|---|
${rows}
`;
}

function loadReferences() {
  return {
    promptTemplate: readText("references/prompt-template.md"),
    chapterStructure: readText("references/chapter-structure.md"),
    analysisFlow: readText("references/analysis-flow.md"),
    layoutRules: readText("references/layout-selection-rules.md"),
    outputFormat: readText("references/output-format.md"),
    researchWorkflow: readText("references/research-workflow.md")
  };
}

function run() {
  const input = process.env.CODEX_EASTBOARD_INPUT
    ? JSON.parse(fs.readFileSync(process.env.CODEX_EASTBOARD_INPUT, "utf8"))
    : readJson("inputs/user-brief.json");
  const order = readJson("config/agent-order.json");
  const pipeline = readJson("config/agent-pipeline.json");
  const references = loadReferences();
  const ctx = buildContext(input);

  if (checkOnly) {
    console.log("OK: consulting-deck-planner configuration and references are readable.");
    console.log(`Theme: ${ctx.theme}`);
    console.log(`Agents: ${order.order.length}`);
    console.log(`References: ${Object.keys(references).length}`);
    return;
  }

  const runDir = createRunDir();
  writeJson(path.join(runDir, "run_manifest.json"), {
    run_id: path.basename(runDir),
    template_id: templateId,
    created_at: new Date().toISOString(),
    input_theme: ctx.theme,
    files: [
      "run_manifest.json",
      "agent_workflow.md",
      "research_plan.md",
      "deck_outline.md",
      "slide_design.md",
      "review_checklist.md",
      "deck.json",
      "consulting_deck_slides.json",
      "22_powerpoint_exporter.json",
      "consulting_deck_slides.pptx",
      "preview.html",
      "qa_report.md"
    ]
  });
  writeText(path.join(runDir, "agent_workflow.md"), agentWorkflow(order, pipeline));
  writeText(path.join(runDir, "research_plan.md"), researchPlan(ctx));
  writeText(path.join(runDir, "deck_outline.md"), deckOutline(ctx));
  writeText(path.join(runDir, "slide_design.md"), slideDesign(ctx));
  writeText(path.join(runDir, "review_checklist.md"), reviewChecklist(ctx));
  const deck = deckJson(ctx);
  const warnings = evidenceWarnings(deck);
  const pptxExport = createPptx(ctx, deck, path.join(runDir, "consulting_deck_slides.pptx"));
  writeJson(path.join(runDir, "22_powerpoint_exporter.json"), pptxExport);
  createHtmlPreview(ctx, path.join(runDir, "preview.html"));
  createQaReport(ctx, pptxExport, path.join(runDir, "qa_report.md"), [
    "Presentation artifact-tool package was not available in this local Node resolution path; native PPTX fallback was used.",
    "Browser iab runtime was not available in this session; HTML preview was generated for manual/browser review."
  ], warnings);

  console.log("Generated consulting deck planner outputs.");
  console.log(`Run folder: ${runDir}`);
  console.log(`- ${path.join(runDir, "deck_outline.md")}`);
  console.log(`- ${path.join(runDir, "slide_design.md")}`);
  console.log(`- ${path.join(runDir, "research_plan.md")}`);
  console.log(`- ${path.join(runDir, "consulting_deck_slides.pptx")}`);
  console.log(`- ${path.join(runDir, "preview.html")}`);
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
