import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import zlib from "node:zlib";

const root = process.cwd();
const templateId = "proposal-story";
const templateRoot = path.join(root, "templates", templateId);
const outputBaseDir = path.join(root, "outputs", templateId);
const checkOnly = process.argv.includes("--check");
const forceSlides = process.argv.includes("--force-slides");
const skipWebResearch = process.argv.includes("--skip-web-research") || checkOnly || process.env.CODEX_EASTBOARD_SKIP_WEB === "1";
const phaseArg = readArg("--phase", "analysis");
const runDirArg = readArg("--run-dir", "") || readPositionalRunDir();

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readPositionalRunDir() {
  if (!process.argv.includes("--phase") || phaseArg !== "slides") return "";
  const candidates = process.argv.slice(2).filter((arg, index, args) => {
    if (arg.startsWith("--")) return false;
    if (args[index - 1] === "--phase") return false;
    return true;
  });
  return candidates[0] || "";
}

function readJson(baseDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(baseDir, relativePath), "utf8"));
}

function ensureDirs() {
  fs.mkdirSync(outputBaseDir, { recursive: true });
}

function writeJson(dir, fileName, data) {
  fs.writeFileSync(path.join(dir, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function asText(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timestampForFolder(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("") + "_" + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join("");
}

function createRunDir() {
  const baseName = timestampForFolder();
  let name = baseName;
  let index = 1;

  while (fs.existsSync(path.join(outputBaseDir, name))) {
    index += 1;
    name = `${baseName}_${pad2(index)}`;
  }

  const runDir = path.join(outputBaseDir, name);
  fs.mkdirSync(runDir, { recursive: true });
  return { runId: name, runDir };
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildSearchQuery(theme, keyword) {
  return `${theme} ${keyword} 日本`;
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.TZ || "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceNameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web source";
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function fetchText(url, timeoutMs) {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: {
        "user-agent": "Codex-EastBoard/1.0 research runner"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    timeout.cancel();
  }
}

function decodeDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(url, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch {
    return url;
  }
}

function parseSearchResults(html) {
  const results = [];
  const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(regex)) {
    const url = decodeDuckDuckGoUrl(match[1]);
    if (!url.startsWith("http")) continue;
    results.push({
      title: stripHtml(match[2]) || sourceNameFromUrl(url),
      url
    });
  }
  return results;
}

function extractPageSummary(htmlOrText, fallbackTitle = "") {
  const titleMatch = String(htmlOrText).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaMatch = String(htmlOrText).match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const text = stripHtml(htmlOrText);
  const keyFacts = extractKeyFacts(text, 5);
  return {
    title: stripHtml(titleMatch?.[1] || fallbackTitle),
    summary: stripHtml(metaMatch?.[1] || text.slice(0, 450)),
    key_facts: keyFacts
  };
}

function extractKeyFacts(text, maxItems = 5) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  const rawParts = value.split(/(?<=[。.!?])\s+|[。\n]+/).map((part) => part.trim()).filter(Boolean);
  const numericParts = rawParts.filter((part) => /[0-9０-９]/.test(part) || part.includes("%") || part.includes("％"));
  const picked = (numericParts.length > 0 ? numericParts : rawParts).slice(0, maxItems);
  return picked.map((part) => truncateText(part, 160));
}

function normalizeInput(input) {
  const brief = input.brief || {};
  return {
    theme: asText(input.theme, "未設定テーマ"),
    target_reader: asText(input.target_reader, "経営者・決裁者・事業責任者"),
    proposal_goal: asText(input.proposal_goal, "企画書で意思決定を得る"),
    industry: asText(input.industry, "未指定"),
    company_context: asText(input.company_context, "未指定"),
    brief: {
      document_type: asText(brief.document_type, "新規サービス承認資料"),
      current_stage: asText(brief.current_stage, "未定"),
      service_hypothesis: asText(brief.service_hypothesis, "未定"),
      target_customer: asText(brief.target_customer, "未定"),
      customer_pain: asText(brief.customer_pain, "未定"),
      differentiation: asText(brief.differentiation, "未定"),
      business_model: asText(brief.business_model, "未定"),
      success_metrics: asText(brief.success_metrics, "未定"),
      constraints: asText(brief.constraints, "未定"),
      must_answer: asText(brief.must_answer, "未定")
    },
    constraints: {
      region: asText(input.constraints?.region, "日本"),
      language: asText(input.constraints?.language, "ja"),
      must_use_web_evidence: input.constraints?.must_use_web_evidence !== false,
      minimum_story_options: Number(input.constraints?.minimum_story_options || 3),
      research_focus: asText(input.constraints?.research_focus, "市場規模、競合、導入事例、投資対効果"),
      research_depth: asText(input.constraints?.research_depth, "standard")
    }
  };
}

function isUnknown(value) {
  const text = String(value || "").trim();
  return text === "" || ["未定", "不明", "なし", "ない", "わからない", "分からない"].includes(text);
}

function inferBrief(input) {
  const b = input.brief;
  const assumptions = {
    service_hypothesis: isUnknown(b.service_hypothesis)
      ? `${input.theme}を、診断・PoC・実装定着支援まで段階提供するサービスとして仮置きする`
      : b.service_hypothesis,
    target_customer: isUnknown(b.target_customer)
      ? input.industry && input.industry !== "未指定" && input.industry !== "すべて"
        ? `${input.industry}の中堅から大手企業`
        : "生成AI活用に関心はあるが、業務実装と効果測定に課題を持つ中堅から大手企業"
      : b.target_customer,
    customer_pain: isUnknown(b.customer_pain)
      ? "生成AIを導入したいが、具体的な業務適用、効果測定、現場定着まで設計できない"
      : b.customer_pain,
    differentiation: isUnknown(b.differentiation)
      ? "単発助言ではなく、業務診断、ユースケース設計、PoC、定着支援を一気通貫で提供できる点"
      : b.differentiation,
    business_model: isUnknown(b.business_model)
      ? "初期診断、PoC、月額伴走を組み合わせた段階課金"
      : b.business_model,
    success_metrics: isUnknown(b.success_metrics)
      ? "初年度のPoC件数、受注額、継続率、顧客業務KPI改善"
      : b.success_metrics,
    constraints: isUnknown(b.constraints)
      ? "初期投資を抑え、既存人員で小さく検証できる計画を優先"
      : b.constraints,
    must_answer: isUnknown(b.must_answer)
      ? "市場性、顧客課題、競合との差別化、収益性、実行リスク"
      : b.must_answer
  };

  const unknowns = Object.entries(b)
    .filter(([key, value]) => key !== "document_type" && isUnknown(value))
    .map(([key]) => key);

  return {
    document_type: b.document_type,
    current_stage: b.current_stage,
    assumptions,
    unknowns,
    confirmation_points: unknowns.map((key) => `${key} は未定のため、仮説を置いてExcelで確認する`)
  };
}

function createOrchestrator(input, order) {
  return {
    workflow_name: "proposal_story_generation",
    goal: input.proposal_goal,
    input_theme: input.theme,
    agent_order: order.order,
    required_outputs: [
      "agent json files",
      `outputs/${templateId}/YYYYMMDD_HHMMSS/final_report.md`,
      `outputs/${templateId}/YYYYMMDD_HHMMSS/proposal_story_analysis.xlsx`,
      `outputs/${templateId}/YYYYMMDD_HHMMSS/selected_story_review.md`
    ],
    quality_checks: [
      "最低3つのストーリー案がある",
      "背景、課題、目的、施策、評価、推奨が接続している",
      "Web調査が必要な箇所に検索クエリがある",
      "推奨案だけでなく不採用理由もある",
      "Excelで判断過程を確認できる"
    ]
  };
}

function createThemeInterpreter(input) {
  const inferred = inferBrief(input);
  return {
    input_theme: input.theme,
    document_type: inferred.document_type,
    interpreted_theme: `${input.theme}を、${input.target_reader}が「${input.proposal_goal}」を判断できる${inferred.document_type}に変換する`,
    proposal_purpose: input.proposal_goal,
    target_reader: input.target_reader,
    briefing_assumptions: inferred.assumptions,
    unknowns: inferred.unknowns,
    confirmation_points: inferred.confirmation_points,
    decision_points: [
      `この資料で求める判断は「${input.proposal_goal}」でよいか`,
      `想定サービスは「${inferred.assumptions.service_hypothesis}」でよいか`,
      `対象顧客は「${inferred.assumptions.target_customer}」でよいか`,
      "なぜ今取り組むべきか",
      "どの課題を解決するのか",
      "複数案のうち、どのストーリーが最も勝てるのか",
      "必要な投資・体制・期間は妥当か",
      "期待成果と主要リスクは何か"
    ],
    key_questions: [
      `${inferred.assumptions.target_customer}は${inferred.assumptions.customer_pain}をどの程度抱えているか`,
      `${input.theme}の市場・業界変化は何か`,
      `${inferred.assumptions.differentiation}は競合に対して有効な差別化か`,
      `${inferred.assumptions.business_model}は収益性・導入しやすさの両面で妥当か`,
      `${input.target_reader}が判断するために不足している根拠は何か`
    ],
    research_needs: [
      buildSearchQuery(`${input.theme} ${inferred.assumptions.target_customer}`, "市場規模 成長率"),
      buildSearchQuery(`${input.theme} ${inferred.assumptions.customer_pain}`, "顧客課題 調査"),
      buildSearchQuery(`${input.theme} ${inferred.assumptions.differentiation}`, "競合 事例"),
      buildSearchQuery(`${input.theme} ${inferred.assumptions.business_model}`, "価格 相場"),
      buildSearchQuery(`${input.theme} ${inferred.assumptions.success_metrics}`, "ROI KPI")
    ],
    assumptions: [
      `対象地域は${input.constraints.region}`,
      `対象業界は${input.industry}`,
      `自社状況は${input.company_context}`,
      "この初期実装では外部検索APIを直接呼ばず、検索すべき論点と候補URLを出力する"
    ]
  };
}

function createEnvironmentResearch(input) {
  const inferred = inferBrief(input);
  const categories = [
    ["market_trends", "市場環境", "市場規模、成長率、導入拡大の兆候を確認する"],
    ["customer_trends", "顧客ニーズ", "顧客の業務課題、購買行動、期待効果を確認する"],
    ["competitor_trends", "競合動向", "競合・先行企業の機能、価格、導入事例を確認する"],
    ["technology_trends", "技術変化", "AI、データ連携、自動化、セキュリティ要件を確認する"],
    ["social_regulatory_trends", "社会・制度変化", "働き方、個人情報、AI利用ルール、業界規制を確認する"]
  ];
  const data = {
    environment_summary: `${input.theme}は、${inferred.assumptions.target_customer}の「${inferred.assumptions.customer_pain}」を解く新規サービスとして、市場性、競合差別化、収益性を検証する必要がある。`,
    key_implications: [
      "市場性だけでなく、自社が勝てる導入領域を絞る必要がある",
      "効果測定可能なKPIを先に設計する必要がある",
      "競合比較では機能差よりも導入後の成果差を示す必要がある"
    ],
    research_queries: []
  };

  for (const [key, label, impact] of categories) {
    const query = buildSearchQuery(`${input.theme} ${inferred.assumptions.target_customer} ${inferred.assumptions.customer_pain}`, label);
    data[key] = [
      {
        point: `${label}の変化を確認する`,
        evidence: "未調査。出力された検索URLから一次情報、業界レポート、公的統計を確認する。",
        source_url: searchUrl(query),
        impact
      }
    ];
    data.research_queries.push({ category: label, query, url: searchUrl(query), priority: "high" });
  }

  return data;
}

function createIssueObjective(input, env) {
  const inferred = inferBrief(input);
  const issues = [
    {
      issue: "投資判断に必要な市場性と成果見込みが曖昧",
      background_link: env.market_trends[0].point,
      cause: "市場・顧客・競合情報が企画書上で分断されている",
      symptom: `${inferred.assumptions.target_customer}に本当に需要があるか説明しにくい`,
      business_impact: "承認遅延、優先度低下、予算化失敗につながる",
      priority: "high"
    },
    {
      issue: "顧客課題と施策の対応関係が見えにくい",
      background_link: env.customer_trends[0].point,
      cause: `顧客課題「${inferred.assumptions.customer_pain}」を施策・KPIへ変換できていない`,
      symptom: "機能説明中心になり、事業成果の説明が弱くなる",
      business_impact: "導入後の評価指標が曖昧になり、継続投資を得にくい",
      priority: "high"
    },
    {
      issue: "競合との差分が経営判断に直結していない",
      background_link: env.competitor_trends[0].point,
      cause: "競合比較が機能比較に偏り、勝ち筋の説明が不足している",
      symptom: "既存サービスとの差が伝わらない",
      business_impact: "新規性や優位性が弱く見え、採用判断が保留される",
      priority: "medium"
    }
  ];

  return {
    issue_summary: `${input.theme}の企画化では、対象顧客、顧客課題、勝ち筋、収益モデル、成功指標を一貫させることが重要である。`,
    issues,
    proposal_objectives: [
      {
        objective: "投資判断に必要な事業機会と勝ち筋を明確化する",
        why_now: "市場・顧客・技術・競合の変化が同時に起きているため",
        success_condition: "意思決定者が採用案、期待効果、リスクを比較判断できる",
        related_issue: issues[0].issue
      },
      {
        objective: "顧客課題から施策とKPIまでを接続する",
        why_now: "成果で評価される企画にするため",
        success_condition: "主要KPIと実行ステップが企画書上で説明できる",
        related_issue: issues[1].issue
      }
    ],
    core_message: `${input.theme}は、${inferred.assumptions.differentiation}を勝ち筋として、根拠に基づく${inferred.document_type}へ設計すべきである。`,
    must_address_points: [
      "市場・顧客・競合の根拠",
      "複数ストーリー案の比較",
      "採用案のリスクと対応",
      "KPIと実行計画"
    ]
  };
}

function createStoryGenerator(input, storyTypes) {
  const inferred = inferBrief(input);
  const base = storyTypes.story_types;
  const min = Math.max(3, input.constraints.minimum_story_options);
  const selected = base.slice(0, Math.min(base.length, Math.max(min, 3)));
  return {
    story_options: selected.map((type, index) => {
      const id = String.fromCharCode(65 + index);
      return {
        story_id: id,
        story_type: type.name,
        story_title: `${type.name}で進める${input.theme}`,
        one_line_summary: type.purpose,
        background: `${input.theme}に関する環境変化を、${type.name}の観点で整理する。対象顧客は${inferred.assumptions.target_customer}と仮置きする。`,
        issue: index === 0 ? "市場機会の大きさを投資判断に変換できていない" : index === 1 ? `${inferred.assumptions.customer_pain}と施策の接続が弱い` : `${inferred.assumptions.differentiation}が競合差別化として成立するか未検証`,
        objective: `${input.target_reader}が採用可否を判断できるストーリーを作る`,
        proposal_direction: `${type.purpose}方向で、サービス仮説「${inferred.assumptions.service_hypothesis}」、課題、施策、KPIを接続する`,
        target_reader_fit: index === 0 ? "成長投資を重視する読者に合う" : index === 1 ? "現場課題と実行性を重視する読者に合う" : "競争優位や差別化を重視する読者に合う",
        strength: index === 0 ? "将来性を打ち出しやすい" : index === 1 ? "課題解決の必然性を示しやすい" : "勝ち筋を明確にしやすい",
        weakness: index === 0 ? "根拠が弱いと楽観的に見える" : index === 1 ? "大きな成長性の説明が弱くなる可能性がある" : "競合情報の質に左右される",
        required_evidence: [
          buildSearchQuery(`${input.theme} ${inferred.assumptions.target_customer}`, "市場規模 成長率"),
          buildSearchQuery(`${input.theme} ${inferred.assumptions.customer_pain}`, "顧客課題 導入事例"),
          buildSearchQuery(`${input.theme} ${inferred.assumptions.differentiation}`, "競合比較")
        ],
        best_use_case: `${type.name}の判断軸を重視する会議・稟議`
      };
    })
  };
}

function createSolutionGenerator(stories) {
  return {
    solution_options: stories.story_options.map((story) => ({
      story_id: story.story_id,
      solutions: [
        {
          solution_id: `${story.story_id}-1`,
          solution_name: `${story.story_type}に基づく重点施策`,
          description: `${story.story_title}を実行するため、最も成果に直結するユースケースから始める。`,
          target_issue: story.issue,
          expected_effect: "短期で効果検証し、意思決定者に継続投資の根拠を示す",
          required_resources: ["責任者", "業務担当者", "データ・業務プロセス", "効果測定環境"],
          implementation_steps: ["対象顧客を仮説設定", "課題ヒアリング", "小規模に試行", "効果測定", "拡張判断"],
          kpi: ["商談化率", "受注率", "営業工数削減", "顧客満足度", "投資対効果"],
          risks: ["データ不足", "現場定着不足", "期待効果の過大評価"],
          success_conditions: ["KPIの事前定義", "推進責任者の明確化", "検証期間の設定"]
        },
        {
          solution_id: `${story.story_id}-2`,
          solution_name: `${story.story_type}を補強する比較・検証施策`,
          description: "競合・既存施策・代替案と比較し、採用理由を明確にする。",
          target_issue: "経営判断に必要な比較材料が不足している",
          expected_effect: "採用判断の納得度を高める",
          required_resources: ["競合情報", "顧客ヒアリング", "導入事例", "費用試算"],
          implementation_steps: ["比較軸を定義", "根拠を収集", "評価表を作成", "採用・不採用理由を整理"],
          kpi: ["評価スコア", "想定ROI", "導入リードタイム", "リスク低減度"],
          risks: ["根拠不足", "比較軸の偏り"],
          success_conditions: ["評価軸の固定", "根拠と仮説の分離"]
        }
      ]
    }))
  };
}

function createEvidenceResearch(stories, solutions, criteria, input) {
  const evidenceItems = [];
  let count = 1;
  for (const story of stories.story_options) {
    const storySolutions = solutions.solution_options.find((item) => item.story_id === story.story_id)?.solutions || [];
    for (const criterion of criteria.criteria.slice(0, 5)) {
      const query = buildSearchQuery(`${input.theme} ${story.story_type}`, criterion);
      evidenceItems.push({
        evidence_id: `E${String(count).padStart(3, "0")}`,
        related_story_id: story.story_id,
        related_solution_id: storySolutions[0]?.solution_id || "",
        evaluation_criterion: criterion,
        fact: "未確定。検索URLから一次情報、業界レポート、導入事例を確認する。",
        source_name: "Web検索候補",
        source_url: searchUrl(query),
        published_date: "",
        reliability: "requires_confirmation",
        implication: `${criterion}を評価するための根拠として確認する。`
      });
      count += 1;
    }
  }

  return {
    evidence_items: evidenceItems,
    missing_evidence: [
      {
        item: "市場規模・成長率の一次情報",
        reason: "外部検索APIを使わない初期実装のため未取得",
        impact_on_evaluation: "市場成長性スコアは仮説評価として扱う"
      },
      {
        item: "顧客ニーズの定量調査",
        reason: "対象業界・対象顧客が未指定の場合、具体化できない",
        impact_on_evaluation: "顧客ニーズ適合度の確度が下がる"
      },
      {
        item: "競合別の価格・機能・導入事例",
        reason: "競合名が未指定",
        impact_on_evaluation: "競合優位性は追加調査が必要"
      }
    ]
  };
}

function createWebResearchPlan(input, evidence, webResearchConfig) {
  const maxQueries = Number(webResearchConfig.max_queries || 6);
  const inferred = inferBrief(input);
  const focus = input.constraints.research_focus;
  const baseQueries = evidence.evidence_items.slice(0, maxQueries).map((item) => ({
    evidence_id: item.evidence_id,
    related_story_id: item.related_story_id,
    related_solution_id: item.related_solution_id,
    evaluation_criterion: item.evaluation_criterion,
    query: buildSearchQuery(`${input.theme} ${inferred.assumptions.target_customer} ${inferred.assumptions.customer_pain} ${focus}`, item.evaluation_criterion),
    target_fact: `${item.evaluation_criterion}を評価するための事実、統計、事例`,
    priority: item.evaluation_criterion.includes("市場") || item.evaluation_criterion.includes("投資") ? "high" : "medium",
    search_url: searchUrl(buildSearchQuery(`${input.theme} ${focus}`, item.evaluation_criterion))
  }));

  return {
    status: "planned",
    created_at: new Date().toISOString(),
    input_theme: input.theme,
    research_focus: focus,
    research_depth: input.constraints.research_depth,
    provider: webResearchConfig.search_provider,
    max_queries: maxQueries,
    queries: baseQueries
  };
}

async function runWebResearch(plan, webResearchConfig, enabled) {
  const results = [];
  const checkedAt = todayIsoDate();
  const timeoutMs = Number(webResearchConfig.request_timeout_ms || 8000);
  const maxSources = Number(webResearchConfig.max_sources_per_query || 2);
  let searchFetchFailedCount = 0;
  let pageFetchFailedCount = 0;

  if (!enabled) {
    return {
      status: "skipped",
      checked_at: checkedAt,
      reason: skipWebResearch ? "Web research skipped by check/flag/env." : "Web research disabled by template input.",
      results
    };
  }

  for (const query of plan.queries) {
    const queryResult = {
      evidence_id: query.evidence_id,
      query: query.query,
      target_fact: query.target_fact,
      checked_at: checkedAt,
      status: "pending",
      sources: [],
      error: ""
    };

    try {
      const searchHtml = await fetchText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query.query)}`, timeoutMs);
      const searchResults = parseSearchResults(searchHtml).slice(0, maxSources);
      for (const result of searchResults) {
        try {
          const pageText = await fetchText(result.url, timeoutMs);
          const page = extractPageSummary(pageText, result.title);
          queryResult.sources.push({
            source_name: page.title || result.title || sourceNameFromUrl(result.url),
            source_url: result.url,
            checked_at: checkedAt,
            extracted_summary: page.summary,
            key_facts: page.key_facts || [],
            reliability: "confirmed_web"
          });
        } catch (error) {
          pageFetchFailedCount += 1;
          queryResult.sources.push({
            source_name: result.title || sourceNameFromUrl(result.url),
            source_url: result.url,
            checked_at: checkedAt,
            extracted_summary: "",
            key_facts: [],
            reliability: "fetch_failed",
            error: error.message
          });
        }
      }
      queryResult.status = queryResult.sources.some((source) => source.reliability === "confirmed_web") ? "confirmed" : "search_only";
      if (searchResults.length === 0) queryResult.error = "No search results parsed.";
    } catch (error) {
      searchFetchFailedCount += 1;
      queryResult.status = "failed";
      queryResult.error = error.message;
      queryResult.sources.push({
        source_name: "Search fallback",
        source_url: searchUrl(query.query),
        checked_at: checkedAt,
        extracted_summary: "",
        key_facts: [],
        reliability: "search_only",
        error: error.message
      });
    }

    results.push(queryResult);
  }

  const confirmedSourceCount = results.flatMap((item) => item.sources).filter((source) => source.reliability === "confirmed_web").length;
  const fallbackSourceCount = results.flatMap((item) => item.sources).filter((source) => source.reliability === "search_only").length;
  const totalQueries = plan.queries.length;
  const isNetworkBlocked = totalQueries > 0 && confirmedSourceCount === 0 && (searchFetchFailedCount > 0 || pageFetchFailedCount > 0);
  return {
    status: confirmedSourceCount > 0 ? "completed" : (isNetworkBlocked ? "blocked_by_network" : "needs_research"),
    checked_at: checkedAt,
    confirmed_source_count: confirmedSourceCount,
    required_confirmed_sources: Number(webResearchConfig.approval_gate?.minimum_confirmed_sources || 3),
    fallback_source_count: fallbackSourceCount,
    diagnostics: {
      total_queries: totalQueries,
      search_fetch_failed: searchFetchFailedCount,
      page_fetch_failed: pageFetchFailedCount
    },
    results
  };
}

function enrichEvidenceWithWebResearch(evidence, webResearch) {
  const resultByEvidenceId = new Map(webResearch.results.map((item) => [item.evidence_id, item]));
  const evidenceItems = evidence.evidence_items.map((item) => {
    const researched = resultByEvidenceId.get(item.evidence_id);
    const confirmed = researched?.sources?.find((source) => source.reliability === "confirmed_web");
    if (!confirmed) {
      return {
        ...item,
        research_status: researched?.status || "not_researched",
        checked_at: researched?.checked_at || "",
        research_error: researched?.error || ""
      };
    }
    return {
      ...item,
      fact: confirmed.extracted_summary || item.fact,
      source_name: confirmed.source_name,
      source_url: confirmed.source_url,
      published_date: "",
      checked_at: confirmed.checked_at,
      reliability: "confirmed_web",
      research_status: "confirmed",
      research_error: "",
      implication: `${item.evaluation_criterion}の評価根拠として確認済みWeb情報を利用する。`
    };
  });

  const missingEvidence = evidenceItems
    .filter((item) => item.reliability !== "confirmed_web")
    .map((item) => ({
      item: `${item.evidence_id}: ${item.evaluation_criterion}`,
      reason: item.research_error || "Web取得済み根拠が不足",
      impact_on_evaluation: "該当評価軸は仮説評価として扱い、Excel確認時に追加調査判断が必要"
    }));

  return {
    ...evidence,
    evidence_items: evidenceItems,
    missing_evidence: missingEvidence,
    web_research_summary: {
      status: webResearch.status,
      checked_at: webResearch.checked_at,
      confirmed_source_count: webResearch.confirmed_source_count || 0,
      required_confirmed_sources: webResearch.required_confirmed_sources || 0,
      fallback_source_count: webResearch.fallback_source_count || 0,
      diagnostics: webResearch.diagnostics || {}
    }
  };
}

function createEvaluation(stories, criteria, evidence) {
  const profiles = [
    [5, 4, 3, 3, 4, 3, 5, 3, 3, 4],
    [3, 5, 3, 5, 4, 5, 3, 4, 4, 5],
    [4, 3, 5, 3, 3, 3, 4, 3, 3, 4],
    [3, 4, 3, 4, 5, 4, 3, 4, 4, 5],
    [3, 5, 4, 4, 4, 4, 4, 4, 4, 4]
  ];

  const evaluationTable = stories.story_options.map((story, index) => {
    const storyEvidence = evidence.evidence_items.filter((item) => item.related_story_id === story.story_id);
    const scores = {};
    const initial_scores = {};
    const score_confidence = {};
    const evidence_adjustments = [];
    criteria.criteria.forEach((criterion, criterionIndex) => {
      const initialScore = profiles[index % profiles.length][criterionIndex] || 3;
      const evidenceForCriterion = storyEvidence.filter((item) => item.evaluation_criterion === criterion);
      const confirmedCount = evidenceForCriterion.filter((item) => item.reliability === "confirmed_web").length;
      const confidence = confirmedCount > 0 ? "high" : "low";
      const adjustedScore = confirmedCount > 0 ? initialScore : Math.max(1, initialScore - 1);
      initial_scores[criterion] = initialScore;
      scores[criterion] = adjustedScore;
      score_confidence[criterion] = confidence;
      evidence_adjustments.push({
        criterion,
        initial_score: initialScore,
        adjusted_score: adjustedScore,
        confidence,
        confirmed_evidence_count: confirmedCount,
        reason: confirmedCount > 0 ? "Web確認済み根拠あり" : "根拠不足のため1点減点"
      });
    });
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const initialTotal = Object.values(initial_scores).reduce((sum, score) => sum + score, 0);
    return {
      story_id: story.story_id,
      story_title: story.story_title,
      initial_scores,
      scores,
      score_confidence,
      evidence_adjustments,
      initial_total_score: initialTotal,
      total_score: total,
      evidence_based_reason: `Web根拠の有無に基づき初期スコアを補正。確認済み根拠がない評価軸は信頼度lowとして1点減点。`,
      main_risks: [story.weakness, "根拠が未確認の評価軸は追加調査が必要"],
      evaluation_comment: `${story.story_type}は、${story.strength}一方で、${story.weakness}。`
    };
  });

  const ranking = [...evaluationTable]
    .sort((a, b) => b.total_score - a.total_score)
    .map((item, index) => ({
      rank: index + 1,
      story_id: item.story_id,
      reason: `総合点${item.total_score}点。${item.evaluation_comment}`
    }));

  return { evaluation_table: evaluationTable, ranking };
}

function createRecommendation(evaluation, stories, solutions) {
  const winner = evaluation.ranking[0];
  const story = stories.story_options.find((item) => item.story_id === winner.story_id);
  const selectedSolutions = solutions.solution_options.find((item) => item.story_id === winner.story_id)?.solutions || [];
  return {
    recommended_story: {
      story_id: story.story_id,
      story_title: story.story_title,
      recommendation_summary: `${story.story_type}を軸に、経営判断しやすい企画書構成へ展開する。`,
      why_this_story_wins: winner.reason,
      selected_solutions: selectedSolutions.map((solution) => ({
        solution_id: solution.solution_id,
        solution_name: solution.solution_name,
        reason: solution.expected_effect
      })),
      rejected_options: evaluation.ranking.slice(1).map((ranked) => {
        const rejected = stories.story_options.find((item) => item.story_id === ranked.story_id);
        return { story_id: ranked.story_id, reason: `${rejected.story_type}は有効だが、今回の総合評価では優先度が下がる。` };
      }),
      core_proposal_message: story.one_line_summary,
      executive_message: `今採用すべき企画書ストーリーは「${story.story_title}」。理由は、判断軸に対する総合点が最も高く、施策とKPIへ接続しやすいため。`,
      decision_request: "推奨ストーリーを採用し、追加Web調査で根拠を補強したうえで企画書化する承認"
    }
  };
}

function createDeckOutline(input, recommendation) {
  const title = recommendation.recommended_story.story_title;
  const slides = [
    ["表紙", "企画の入口", `${input.theme}企画書`, ["テーマ", "対象読者", "作成日"]],
    ["エグゼクティブサマリー", "意思決定の要約", recommendation.recommended_story.executive_message, ["推奨案", "期待効果", "判断依頼"]],
    ["背景・市場環境", "なぜ今か", "市場・顧客・競合の変化から企画の必要性を示す", ["市場変化", "顧客変化", "競合変化"]],
    ["課題整理", "解くべき問題", "主要課題を原因、現象、影響に分けて示す", ["課題一覧", "事業影響", "優先度"]],
    ["目的設定", "到達点", "企画で達成する目的と成功条件を明確にする", ["目的", "成功条件", "KPI"]],
    ["ストーリー案一覧", "選択肢の提示", "複数の企画書ストーリーを比較可能にする", ["A案", "B案", "C案"]],
    ["施策案一覧", "実行案", "各ストーリーに対応する施策を整理する", ["主施策", "補助施策", "必要リソース"]],
    ["比較評価", "判断材料", "固定評価軸でスコアと理由を比較する", ["評価表", "総合点", "リスク"]],
    ["推奨施策", "採用案", title, ["推奨理由", "採用施策", "不採用理由"]],
    ["実行計画", "進め方", "小さく検証し、成果確認後に拡張する", ["フェーズ", "体制", "期限"]],
    ["KPI", "効果測定", "成果を数字で追える状態にする", ["先行KPI", "成果KPI", "確認頻度"]],
    ["リスクと対応策", "失敗予防", "主要リスクと打ち手を事前に示す", ["リスク", "影響", "対応策"]],
    ["まとめ", "承認依頼", recommendation.recommended_story.decision_request, ["決定事項", "次アクション", "追加調査"]]
  ];

  return {
    deck_outline: slides.map((slide, index) => ({
      slide_no: index + 1,
      slide_title: slide[0],
      slide_role: slide[1],
      main_message: slide[2],
      content_items: slide[3],
      recommended_layout: index === 7 ? "比較表" : index >= 9 ? "タイムラインまたは表" : "見出し＋要点",
      required_evidence: index >= 2 && index <= 8 ? ["Web根拠URL", "出典名", "確認日"] : [],
      speaker_note: "根拠が未確認の箇所は、事実・仮説・追加調査を分けて説明する。"
    }))
  };
}

function createChapterDesigner(input, issue, recommendation) {
  const recommended = recommendation.recommended_story;
  const chapters = [
    {
      chapter_id: "C1",
      chapter_title: "背景",
      chapter_summary: `${input.theme}に取り組むべき外部環境の変化を示す。`,
      chapter_message: "市場・顧客・競合・技術の変化により、今取り組む理由が生まれている。",
      level2_arguments: ["市場変化", "顧客変化", "競合変化", "技術変化"],
      required_evidence: ["市場規模", "成長率", "顧客ニーズ調査", "競合事例"]
    },
    {
      chapter_id: "C2",
      chapter_title: "課題",
      chapter_summary: "環境変化から、企画書で解くべき課題を整理する。",
      chapter_message: issue.core_message,
      level2_arguments: issue.issues.map((item) => item.issue),
      required_evidence: ["現状課題", "業務影響", "顧客課題", "競合比較"]
    },
    {
      chapter_id: "C3",
      chapter_title: "提案",
      chapter_summary: "推奨ストーリーと採用施策を、課題に対応する提案として示す。",
      chapter_message: recommended.core_proposal_message,
      level2_arguments: recommended.selected_solutions.map((item) => item.solution_name),
      required_evidence: ["導入事例", "施策効果", "実行条件"]
    },
    {
      chapter_id: "C4",
      chapter_title: "効果",
      chapter_summary: "採用した場合の期待効果と評価指標を示す。",
      chapter_message: "KPIで成果を測定し、短期検証から中長期展開へつなげる。",
      level2_arguments: ["短期成果", "投資対効果", "中長期拡張性"],
      required_evidence: ["KPI実績", "ROI事例", "効果測定方法"]
    },
    {
      chapter_id: "C5",
      chapter_title: "実行計画",
      chapter_summary: "承認後の進め方、体制、リスク対応を示す。",
      chapter_message: recommended.decision_request,
      level2_arguments: ["実行ステップ", "必要体制", "主要リスクと対応策"],
      required_evidence: ["導入期間", "必要リソース", "リスク事例"]
    }
  ];

  return { chapters };
}

function createChapterSummary(chapterDesign) {
  return {
    chapter_summaries: chapterDesign.chapters.map((chapter) => ({
      chapter_id: chapter.chapter_id,
      chapter_title: chapter.chapter_title,
      summary_slide_title: `第${chapter.chapter_id.slice(1)}章 ${chapter.chapter_title}の全体像`,
      one_slide_message: chapter.chapter_message,
      overview_points: chapter.level2_arguments.slice(0, 5),
      next_slides: chapter.level2_arguments.map((argument, index) => ({
        slide_key: `${chapter.chapter_id}-${index + 1}`,
        message: argument
      }))
    }))
  };
}

function createArgumentBuilder(chapterDesign) {
  return {
    argument_tree: chapterDesign.chapters.map((chapter) => ({
      chapter_id: chapter.chapter_id,
      chapter_title: chapter.chapter_title,
      chapter_message: chapter.chapter_message,
      arguments: chapter.level2_arguments.map((level2, index) => ({
        level2_id: `${chapter.chapter_id}-L2-${index + 1}`,
        level2,
        message: `${chapter.chapter_title}では「${level2}」を独立した論点として示す。`,
        level3: [
          {
            level3_id: `${chapter.chapter_id}-L2-${index + 1}-E1`,
            message: `${level2}を裏づける定量情報を確認する`,
            evidence_type: chapter.required_evidence[index % chapter.required_evidence.length] || "Webエビデンス"
          },
          {
            level3_id: `${chapter.chapter_id}-L2-${index + 1}-E2`,
            message: `${level2}を説明する企業事例・具体例を確認する`,
            evidence_type: "事例・具体例"
          }
        ]
      }))
    }))
  };
}

function createEvidenceMapping(argumentTree, evidenceResearch, input) {
  const evidenceItems = evidenceResearch.evidence_items;
  let fallbackIndex = 0;

  return {
    evidence_mappings: argumentTree.argument_tree.flatMap((chapter) =>
      chapter.arguments.map((argument) => {
        const evidence = evidenceItems[fallbackIndex % evidenceItems.length];
        fallbackIndex += 1;
        const query = buildSearchQuery(input.theme, `${chapter.chapter_title} ${argument.level2}`);
        return {
          chapter_id: chapter.chapter_id,
          level2_id: argument.level2_id,
          level2: argument.level2,
          required_evidence: argument.level3.map((item) => item.evidence_type),
          mapped_evidence_ids: evidence ? [evidence.evidence_id] : [],
          source_candidates: evidence ? [evidence.source_url, searchUrl(query)] : [searchUrl(query)],
          evidence_status: evidence?.reliability === "confirmed_web" ? "confirmed_web" : "requires_confirmation",
          note: evidence?.reliability === "confirmed_web" ? "Web調査で確認済みの出典を紐づけ" : "Web取得済み根拠が不足。Excelで追加確認が必要"
        };
      })
    )
  };
}

function createSlideMessageBuilder(chapterSummaries, argumentTree) {
  const slideMessages = [];
  const evidenceTemplate = (evidenceType, level2) => {
    const t = String(evidenceType || "");
    if (t.includes("市場規模")) return ["年次（例: 2022-2025）", "市場規模（例: 億円）", "出典URL", `対象論点: ${level2}`];
    if (t.includes("成長率") || t.includes("CAGR")) return ["期間（例: 2022→2025）", "成長率/CAGR（%）", "出典URL", `対象論点: ${level2}`];
    if (t.includes("投資") || t.includes("ROI") || t.includes("対効果")) return ["投資額（円）", "効果（売上/工数削減）", "回収期間", "出典URL"];
    if (t.includes("事例") || t.includes("具体例")) return ["企業/業界", "導入内容", "効果（数値）", "出典URL"];
    if (t.includes("競合")) return ["競合名", "提供内容", "価格/実績", "出典URL"];
    if (t.includes("ニーズ") || t.includes("調査")) return ["調査母数 n=", "主要課題Top3", "結果（%）", "出典URL"];
    return ["事実（数値/定義）", "示唆（意思決定に効く結論）", "出典URL", `対象論点: ${level2}`];
  };

  for (const chapter of chapterSummaries.chapter_summaries) {
    slideMessages.push({
      slide_kind: "chapter_summary",
      chapter_id: chapter.chapter_id,
      slide_title: chapter.summary_slide_title,
      main_message: chapter.one_slide_message,
      support_points: chapter.overview_points,
      one_message_check: true
    });

    const argumentsForChapter = argumentTree.argument_tree.find((item) => item.chapter_id === chapter.chapter_id)?.arguments || [];
    for (const argument of argumentsForChapter) {
      slideMessages.push({
        slide_kind: "argument",
        chapter_id: chapter.chapter_id,
        level2_id: argument.level2_id,
        slide_title: argument.level2,
        main_message: argument.message,
        support_points: argument.level3.map((item) => item.evidence_type),
        one_message_check: true
      });

      for (const level3 of argument.level3) {
        slideMessages.push({
          slide_kind: "evidence",
          chapter_id: chapter.chapter_id,
          level2_id: argument.level2_id,
          level3_id: level3.level3_id,
          slide_title: level3.evidence_type,
          main_message: level3.message,
          support_points: evidenceTemplate(level3.evidence_type, argument.level2),
          one_message_check: true
        });
      }
    }
  }

  return { slide_messages: slideMessages };
}

function findLayout(layoutRegistry, layoutId) {
  return layoutRegistry.layouts.find((layout) => layout.layout_id === layoutId);
}

function pickCardsLayout(itemCount) {
  if (itemCount <= 2) return "cards_2";
  if (itemCount === 3) return "cards_3";
  if (itemCount === 4) return "cards_4";
  return "cards_5";
}

function selectLayoutId(slide, index, layoutRegistry, chapterLayoutMap) {
  if (slide.slide_kind === "chapter_summary") {
    return "chapter_overview";
  }

  const itemCount = slide.support_points.length;
  const chapter = chapterLayoutMap.chapters.find((item) => item.chapter === slide.chapter_title || item.chapter === slide.slide_title);
  const chapterCandidates = chapter?.common_layouts || [];

  if (slide.slide_title.includes("比較") || slide.main_message.includes("比較")) {
    return findLayout(layoutRegistry, "comparison_2") ? "comparison_2" : "standard_table";
  }
  if (slide.slide_title.includes("評価") || slide.main_message.includes("スコア")) {
    return findLayout(layoutRegistry, "score_table") ? "score_table" : "standard_table";
  }
  if (slide.slide_title.includes("リスク")) {
    return findLayout(layoutRegistry, "risk_table") ? "risk_table" : "standard_table";
  }
  if (slide.slide_title.includes("計画") || slide.slide_title.includes("ステップ")) {
    return findLayout(layoutRegistry, "process_flow_5") ? "process_flow_5" : "standard_table";
  }
  if (slide.slide_title.includes("KPI") || slide.main_message.includes("KPI")) {
    return findLayout(layoutRegistry, "kpi_cards_3") ? "kpi_cards_3" : "cards_3";
  }

  const cardsLayout = pickCardsLayout(itemCount);
  if (findLayout(layoutRegistry, cardsLayout)) {
    return cardsLayout;
  }

  return chapterCandidates.find((layoutId) => findLayout(layoutRegistry, layoutId)) || "standard_table";
}

function fitItemsToLayout(items, layout) {
  const maxItems = layout?.max_items || items.length;
  const minItems = layout?.min_items || 0;
  const fitted = items.slice(0, maxItems);

  while (fitted.length < minItems) {
    fitted.push("補足論点として、根拠確認後に具体的な事実・示唆・実行条件を追記する。");
  }

  return fitted;
}

function createSlideLayoutSelector(slideMessages, layoutRegistry, chapterLayoutMap) {
  return {
    slide_layouts: slideMessages.slide_messages.map((slide, index) => {
      const layoutId = selectLayoutId(slide, index, layoutRegistry, chapterLayoutMap);
      const layout = findLayout(layoutRegistry, layoutId) || findLayout(layoutRegistry, "standard_table");

      return {
        slide_key: `S${String(index + 1).padStart(2, "0")}`,
        slide_kind: slide.slide_kind,
        chapter_id: slide.chapter_id,
        level2_id: slide.level2_id || "",
        level3_id: slide.level3_id || "",
        slide_title: slide.slide_title,
        main_message: slide.main_message,
        logical_role: layout?.logical_role || "一覧",
        family: layout?.family || "tables",
        layout_id: layout?.layout_id || "standard_table",
        layout_type: layout?.layout_id || "standard_table",
        layout_reason: slide.slide_kind === "chapter_summary"
          ? "章全体の見取り図を示すため"
          : "テーマではなく論理役割と要素数で選定",
        constraints: {
          min_items: layout?.min_items || 1,
          max_items: layout?.max_items || 12,
          title_max: layout?.title_max || 24,
          body_max: layout?.body_max || 60,
          data_required: Boolean(layout?.data_required)
        },
        content_items: fitItemsToLayout(slide.support_points, layout)
      };
    })
  };
}

function truncateText(text, maxChars) {
  const value = String(text || "");
  if (!maxChars || value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function buildStructuredItems(items, bodyMax) {
  return items.map((item, index) => ({
    title: truncateText(`論点${index + 1}`, 12),
    summary: truncateText(item, bodyMax),
    details: [
      {
        point: "理由",
        description: truncateText(`${item}を支える背景・理由を確認し、企画書上の示唆へ変換する。`, 120)
      },
      {
        point: "示唆",
        description: truncateText("意思決定者が判断できるよう、根拠確認後に事実と仮説を分けて記載する。", 120)
      }
    ]
  }));
}

function createSlideJsonBuilder(slideLayouts, evidenceMapping, webResearch) {
  const confirmedSources = (webResearch?.results || [])
    .flatMap((item) => item.sources || [])
    .filter((source) => source.reliability === "confirmed_web");

  function pickFactsForEvidenceSlide(slide) {
    const keywords = [slide.slide_title, slide.main_message, slide.level2_id].filter(Boolean).map((v) => String(v));
    const matches = confirmedSources
      .filter((source) => {
        const hay = `${source.source_name} ${source.extracted_summary} ${(source.key_facts || []).join(" ")}`.toLowerCase();
        return keywords.some((kw) => kw && hay.includes(String(kw).toLowerCase()));
      })
      .slice(0, 3);

    const pool = matches.length > 0 ? matches : confirmedSources.slice(0, 3);
    const facts = [];
    for (const source of pool) {
      for (const fact of source.key_facts || []) {
        facts.push(`${fact}（出典: ${source.source_name}）`);
        if (facts.length >= 6) break;
      }
      if (facts.length >= 6) break;
      if ((source.key_facts || []).length === 0 && source.extracted_summary) {
        facts.push(`${truncateText(source.extracted_summary, 140)}（出典: ${source.source_name}）`);
      }
      if (facts.length >= 6) break;
    }
    return facts;
  }

  function defaultFactsForEvidenceSlide(slide) {
    const items = slide.content_items || [];
    const unique = [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
    return unique.length > 0 ? unique.map((item) => `${item}: <入力>`) : [];
  }

  return {
    slides: slideLayouts.slide_layouts.map((slide, index) => {
      const mapped = slide.level2_id
        ? evidenceMapping.evidence_mappings.find((item) => item.level2_id === slide.level2_id)
        : evidenceMapping.evidence_mappings.find((item) => item.chapter_id === slide.chapter_id);
      const titleMax = slide.constraints.title_max;
      const bodyMax = slide.constraints.body_max;
      const baseItems = slide.content_items || [];
      const evidenceFacts = slide.slide_kind === "evidence" ? pickFactsForEvidenceSlide(slide) : [];
      const fallbackFacts = slide.slide_kind === "evidence" ? defaultFactsForEvidenceSlide(slide) : [];
      const chosen = evidenceFacts.length > 0 ? evidenceFacts : (fallbackFacts.length > 0 ? fallbackFacts : baseItems);
      const contentItems = buildStructuredItems(chosen, bodyMax);
      const isChapterOverview = slide.layout_id === "chapter_overview";
      const level = isChapterOverview ? "chapter_overview" : (slide.slide_kind === "evidence" ? "level3" : "level2");
      const slideRole = isChapterOverview ? "章全体像" : (slide.slide_kind === "evidence" ? "根拠・事実" : "論点説明");
      const leadText = isChapterOverview
        ? "この章で証明する流れを整理する。"
        : (slide.slide_kind === "evidence" ? "この根拠の事実・数値・出典を確認する。" : "この論点の理由、具体例、示唆を整理する。");
      return {
        slide_no: index + 1,
        chapter: slide.chapter_id,
        level,
        slide_title: slide.slide_title,
        slide_role: slideRole,
        main_message: truncateText(slide.main_message, bodyMax),
        layout_id: slide.layout_id,
        layout_type: slide.layout_id,
        logical_role: slide.logical_role,
        content: {
          title_box: {
            text: truncateText(slide.slide_title, titleMax),
            max_chars: titleMax
          },
          message_box: {
            text: truncateText(slide.main_message, bodyMax),
            max_chars: bodyMax
          },
          lead_box: {
            text: leadText,
            max_chars: bodyMax
          },
          body_box: {
            items: contentItems
          },
          evidence_box: {
            sources: mapped?.source_candidates || []
          },
          note_box: {
            text: "単語だけで終えず、タイトル・短文要約・詳細説明を保持する。"
          }
        },
        content_items: slide.content_items,
        evidence: (mapped?.source_candidates || []).map((sourceUrl) => ({
          fact: "追加確認が必要な根拠候補",
          source_name: "Web検索候補",
          source_url: sourceUrl,
          used_for: slide.main_message
        })),
        fit_check: {
          is_within_title_limit: slide.slide_title.length <= titleMax,
          is_within_body_limit: slide.content_items.every((item) => item.length <= bodyMax),
          needs_split: slide.content_items.length > slide.constraints.max_items
        },
        speaker_note: "1スライド1メッセージを維持し、根拠未確認の箇所は追加調査として扱う。"
      };
    })
  };
}

function createLayoutRegistryManager(layoutRegistry) {
  const seen = new Set();
  const duplicateLayoutIds = [];
  const missingRequiredFields = [];
  const invalidItemRules = [];

  for (const layout of layoutRegistry.layouts) {
    if (seen.has(layout.layout_id)) duplicateLayoutIds.push(layout.layout_id);
    seen.add(layout.layout_id);

    for (const field of ["layout_id", "family", "logical_role", "use_case", "min_items", "max_items", "title_max", "body_max", "data_required"]) {
      if (layout[field] === undefined || layout[field] === null || layout[field] === "") {
        missingRequiredFields.push({ layout_id: layout.layout_id, field });
      }
    }
    if (Number(layout.min_items) > Number(layout.max_items)) {
      invalidItemRules.push({ layout_id: layout.layout_id, min_items: layout.min_items, max_items: layout.max_items });
    }
  }

  return {
    registry_check: {
      is_valid: duplicateLayoutIds.length === 0 && missingRequiredFields.length === 0 && invalidItemRules.length === 0,
      layout_count: layoutRegistry.layouts.length,
      duplicate_layout_ids: duplicateLayoutIds,
      missing_required_fields: missingRequiredFields,
      invalid_item_rules: invalidItemRules
    }
  };
}

function createContentFitValidator(slideJson, layoutRegistry) {
  return {
    fit_results: slideJson.slides.map((slide) => {
      const layout = findLayout(layoutRegistry, slide.layout_id) || findLayout(layoutRegistry, "standard_table");
      const items = slide.content?.body_box?.items || [];
      const issues = [];

      if ((slide.content?.title_box?.text || "").length > layout.title_max) issues.push("title_max_exceeded");
      if (items.some((item) => (item.summary || "").length > layout.body_max)) issues.push("body_max_exceeded");
      if (items.length > layout.max_items) issues.push("max_items_exceeded");
      if (items.length < layout.min_items) issues.push("min_items_shortage");
      if (layout.data_required && slide.evidence.length === 0) issues.push("data_required_but_missing");

      return {
        slide_no: slide.slide_no,
        layout_id: slide.layout_id,
        is_fit: issues.length === 0,
        issues,
        revised_title: truncateText(slide.content?.title_box?.text || slide.slide_title, layout.title_max),
        revised_items: items.slice(0, layout.max_items).map((item) => ({
          ...item,
          summary: truncateText(item.summary, layout.body_max)
        })),
        split_required: items.length > layout.max_items,
        recommended_split: items.length > layout.max_items ? [`${layout.max_items}件以内に分割`] : []
      };
    })
  };
}

function createExcelExporter(workbookRows) {
  return {
    workbook_name: "proposal_story_analysis.xlsx",
    sheet_count: workbookRows.length,
    sheets: workbookRows.map((sheet) => ({
      name: sheet.name,
      row_count: sheet.rows.length
    }))
  };
}

function createLayoutRegistryCsv(layoutRegistry) {
  const headers = ["layout_id", "family", "logical_role", "use_case", "min_items", "max_items", "title_max", "body_max", "data_required"];
  const rows = layoutRegistry.layouts.map((layout) => headers.map((header) => `"${String(layout[header]).replaceAll('"', '""')}"`).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function createFinalSlidePlan(slideJson, slideLayouts, fitValidation, designReference) {
  return {
    design_reference: designReference,
    slide_count: slideJson.slides.length,
    slides: slideJson.slides.map((slide) => {
      const layout = slideLayouts.slide_layouts.find((item) => item.slide_key === `S${String(slide.slide_no).padStart(2, "0")}`);
      const fit = fitValidation.fit_results.find((item) => item.slide_no === slide.slide_no);
      return {
        slide_no: slide.slide_no,
        layout_id: slide.layout_id,
        logical_role: slide.logical_role,
        main_message: slide.main_message,
        layout_reason: layout?.layout_reason || "",
        is_fit: fit?.is_fit ?? false,
        render_status: "renderer_required",
        fallback_layout_id: slide.layout_id ? "standard_table" : "standard_table"
      };
    })
  };
}

function createSlideValidation(slideJson, chapterSummaries, layoutRegistry, fitValidation) {
  const chapterIds = new Set(chapterSummaries.chapter_summaries.map((item) => item.chapter_id));
  const summaryChapterIds = new Set(
    slideJson.slides
      .filter((slide) => slide.slide_role === "章全体像")
      .map((slide) => {
        const match = slide.slide_title.match(/第(\d+)章/);
        return match ? `C${match[1]}` : "";
      })
      .filter(Boolean)
  );
  const missingSummary = [...chapterIds].filter((chapterId) => !summaryChapterIds.has(chapterId));
  const layoutIds = new Set(layoutRegistry.layouts.map((layout) => layout.layout_id));
  const undefinedLayouts = slideJson.slides.filter((slide) => !layoutIds.has(slide.layout_id)).map((slide) => slide.layout_id);
  const fitIssues = fitValidation.fit_results.filter((result) => !result.is_fit);

  return {
    validation_results: [
      {
        item: "1スライド1メッセージ",
        status: slideJson.slides.every((slide) => Boolean(slide.main_message)) ? "ok" : "ng",
        comment: "全スライドに main_message を設定"
      },
      {
        item: "章サマリー",
        status: missingSummary.length === 0 ? "ok" : "needs_fix",
        comment: missingSummary.length === 0 ? "全章に章全体像スライドあり" : `不足: ${missingSummary.join(", ")}`
      },
      {
        item: "スライドJSON",
        status: slideJson.slides.every((slide) => slide.slide_no && slide.slide_title && slide.layout_id && slide.content) ? "ok" : "ng",
        comment: "slide-schema の主要項目を確認"
      },
      {
        item: "layout_id",
        status: undefinedLayouts.length === 0 ? "ok" : "ng",
        comment: undefinedLayouts.length === 0 ? "全layout_idがregistryに存在" : `未定義: ${undefinedLayouts.join(", ")}`
      },
      {
        item: "文字数・要素数",
        status: fitIssues.length === 0 ? "ok" : "needs_fix",
        comment: fitIssues.length === 0 ? "全スライドが制限内" : `${fitIssues.length}枚で収まり調整が必要`
      },
      {
        item: "根拠",
        status: "needs_research",
        comment: "検索候補は紐づけ済み。実URLへの置換は追加調査が必要"
      }
    ],
    slide_count: slideJson.slides.length,
    chapter_summary_count: summaryChapterIds.size,
    missing_chapter_summaries: missingSummary,
    undefined_layout_ids: undefinedLayouts,
    fit_issue_count: fitIssues.length
  };
}

function createValidation(outputs) {
  const storyCount = outputs.stories.story_options.length;
  const missing = outputs.evidence.missing_evidence.length;
  const confirmed = outputs.evidence.web_research_summary?.confirmed_source_count || 0;
  const required = outputs.evidence.web_research_summary?.required_confirmed_sources || 0;
  const webStatus = required > 0 && confirmed >= required ? "ok" : "needs_research";
  return {
    validation_results: [
      { item: "テーマ解釈", status: "ok", comment: "入力テーマから意思決定論点へ変換済み" },
      { item: "複数案", status: storyCount >= 3 ? "ok" : "ng", comment: `${storyCount}案を生成` },
      { item: "施策対応", status: "ok", comment: "各ストーリーに2施策を生成" },
      { item: "比較評価", status: "ok", comment: "固定評価軸でスコアリング済み" },
      { item: "Web根拠", status: webStatus, comment: `確認済み出典 ${confirmed}/${required}件。不足 ${missing}件` },
      { item: "企画書構成", status: "ok", comment: "推奨案をスライド構成へ変換済み" }
    ],
    next_actions: [
      ...(webStatus === "ok" ? [] : ["Web取得済み根拠が不足。ExcelのWeb調査結果を確認し、追加調査または承認判断を行う"]),
      "評価スコアを実根拠に基づいて再調整する",
      "承認用ファイルで採用ストーリーを確認する",
      "必要に応じてPowerPoint化する"
    ]
  };
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function createFinalReport(input, outputs) {
  const rec = outputs.recommendation.recommended_story;
  const inferred = inferBrief(input);
  const evalRows = outputs.evaluation.evaluation_table
    .map((row) => `| ${row.story_id} | ${row.story_title} | ${row.total_score} | ${row.evaluation_comment} |`)
    .join("\n");
  const stories = outputs.stories.story_options
    .map((story) => `### ${story.story_id}. ${story.story_title}\n\n- 型: ${story.story_type}\n- 要約: ${story.one_line_summary}\n- 強み: ${story.strength}\n- 弱み: ${story.weakness}`)
    .join("\n\n");
  const slides = outputs.deck.deck_outline
    .map((slide) => `| ${slide.slide_no} | ${slide.slide_title} | ${slide.main_message} |`)
    .join("\n");
  const chapterRows = outputs.chapters.chapters
    .map((chapter) => `| ${chapter.chapter_id} | ${chapter.chapter_title} | ${chapter.chapter_message} | ${chapter.level2_arguments.join("、")} |`)
    .join("\n");
  const argumentRows = outputs.argumentTree.argument_tree
    .flatMap((chapter) => chapter.arguments.map((argument) => `| ${chapter.chapter_title} | ${argument.level2} | ${argument.level3.map((item) => item.message).join(" / ")} |`))
    .join("\n");
  const slideRows = outputs.slideJson.slides
    .map((slide) => `| ${slide.slide_no} | ${slide.slide_title} | ${slide.layout_type} | ${slide.main_message} |`)
    .join("\n");

  return `# 企画書ストーリー設計レポート

## 1. テーマ解釈

- 入力テーマ: ${input.theme}
- 資料タイプ: ${inferred.document_type}
- 企画目的: ${input.proposal_goal}
- 想定読者: ${input.target_reader}
- 解釈: ${outputs.theme.interpreted_theme}

### Codexが置いた作成仮説

${markdownList(Object.entries(inferred.assumptions).map(([key, value]) => `${key}: ${value}`))}

### Excelで確認すべき未確定事項

${inferred.confirmation_points.length > 0 ? markdownList(inferred.confirmation_points) : "- 未確定事項は明示されていません"}

## 2. 背景・環境変化

${outputs.environment.environment_summary}

主な調査クエリ:

${markdownList(outputs.environment.research_queries.map((item) => `${item.category}: ${item.query} (${item.url})`))}

## 3. 課題と目的

${outputs.issue.issue_summary}

${markdownList(outputs.issue.issues.map((item) => `${item.issue}: ${item.business_impact}`))}

## 4. 複数ストーリー案

${stories}

## 5. 施策案

${outputs.solutions.solution_options.map((group) => {
    const items = group.solutions.map((solution) => `- ${solution.solution_id}: ${solution.solution_name} / KPI: ${solution.kpi.join("、")}`).join("\n");
    return `### Story ${group.story_id}\n\n${items}`;
  }).join("\n\n")}

## 6. エビデンス整理

Web調査ステータス: ${outputs.evidence.web_research_summary?.status || "unknown"} / 確認済み出典: ${outputs.evidence.web_research_summary?.confirmed_source_count || 0}

${markdownList(outputs.evidence.evidence_items.slice(0, 10).map((item) => `${item.evidence_id}: ${item.evaluation_criterion} / ${item.reliability} / ${item.source_name} / ${item.source_url}`))}

## 7. 比較評価表

| 案 | ストーリー | 総合点 | コメント |
|---|---|---:|---|
${evalRows}

## 8. 推奨ストーリー

- 推奨案: ${rec.story_id} ${rec.story_title}
- 推奨理由: ${rec.why_this_story_wins}
- 経営向けメッセージ: ${rec.executive_message}
- 判断依頼: ${rec.decision_request}

## 9. 企画書構成案

| No | スライド | メインメッセージ |
|---:|---|---|
${slides}

## 10. 章構造

| 章ID | 章 | 章メッセージ | 第二階層 |
|---|---|---|---|
${chapterRows}

## 11. 論点構造

| 章 | 第二階層 | 第三階層 |
|---|---|---|
${argumentRows}

## 12. スライド構造

| No | スライド | レイアウト | メインメッセージ |
|---:|---|---|---|
${slideRows}

## 13. 検証結果

${markdownList(outputs.validation.validation_results.map((item) => `${item.item}: ${item.status} - ${item.comment}`))}

スライド検証:

${markdownList(outputs.slideValidation.validation_results.map((item) => `${item.item}: ${item.status} - ${item.comment}`))}

## 14. 不足情報・追加調査事項

${markdownList(outputs.evidence.missing_evidence.map((item) => `${item.item}: ${item.reason}。影響: ${item.impact_on_evaluation}`))}
`;
}

function createApprovalReview(outputs) {
  const rec = outputs.recommendation.recommended_story;
  const rows = outputs.evaluation.evaluation_table
    .map((row) => `| ${row.story_id} | ${row.story_title} | ${row.total_score} | ${row.story_id === rec.story_id ? "推奨" : "不採用候補"} |`)
    .join("\n");
  return `# ユーザー確認：採用ストーリー案

## 推奨ストーリー

- ストーリー名: ${rec.story_title}
- 推奨理由: ${rec.why_this_story_wins}
- 採用施策: ${rec.selected_solutions.map((item) => item.solution_name).join("、")}
- 期待効果: ${rec.recommendation_summary}
- 主なリスク: Web根拠の追加確認が必要

## 比較結果

| 案 | ストーリー | 総合評価 | 採用判断 |
|---|---|---:|---|
${rows}

## ユーザー確認事項

1. このストーリーで企画書化するか
2. 別案を採用するか
3. 複数案を統合するか
4. 追加調査を行うか
`;
}

function createApprovalRequest(runDir, input, outputs) {
  const rec = outputs.recommendation.recommended_story;
  const inferred = inferBrief(input);
  const web = outputs.evidence.web_research_summary || {};
  const webStatus = web.status || "unknown";
  const webHint = webStatus === "blocked_by_network"
    ? "ネットワーク制限等でWeb取得が失敗しています。Excelの追加調査リストを埋めるか、ネットワーク利用可能環境で再実行してください。例外的に進める場合は --allow-incomplete-research を指定します。"
    : "";
  return {
    status: "pending_review",
    template_id: templateId,
    run_id: path.basename(runDir),
    input_theme: input.theme,
    review_required_before: "slides",
    review_files: {
      workbook: path.join(runDir, "proposal_story_analysis.xlsx"),
      review_markdown: path.join(runDir, "selected_story_review.md"),
      final_report: path.join(runDir, "final_report.md")
    },
    recommended_story: {
      story_id: rec.story_id,
      story_title: rec.story_title,
      summary: rec.recommendation_summary
    },
    briefing_assumptions: inferred.assumptions,
    unknowns_to_confirm: inferred.unknowns,
    allowed_decisions: [
      "approve",
      "revise_story",
      "merge_options",
      "additional_research",
      "stop"
    ],
    web_research_gate: {
      status: outputs.evidence.web_research_summary?.status || "unknown",
      confirmed_source_count: outputs.evidence.web_research_summary?.confirmed_source_count || 0,
      required_confirmed_sources: outputs.evidence.web_research_summary?.required_confirmed_sources || 0,
      missing_evidence_count: outputs.evidence.missing_evidence.length,
      fallback_source_count: outputs.evidence.web_research_summary?.fallback_source_count || 0,
      diagnostics: outputs.evidence.web_research_summary?.diagnostics || {}
    },
    next_command_after_review: `npm run continue -- outputs/${templateId}/${path.basename(runDir)}`,
    hint: webHint,
    rule: "PowerPoint generation must not run until approval_decision.json is recorded with decision=approve."
  };
}

function flattenObject(obj) {
  return Object.entries(obj).map(([key, value]) => [key, Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : value]);
}

function createWorkbookRows(input, outputs) {
  const inferred = inferBrief(input);
  return [
    {
      name: "00_レビュー手順",
      rows: [
        ["項目", "内容"],
        ["目的", "このExcelを確認して、スライド作成へ進めるか判断する"],
        ["最初に見るシート", "01_承認確認 / 08_推奨案 / 07_比較評価"],
        ["確認観点", "推奨案を採用するか、別案にするか、統合するか、追加調査するか"],
        ["次の操作", "承認後に npm run continue -- <analysis_run_dir> を実行する"],
        ["注意", "この段階ではPowerPointを作らない。Excel確認後の承認で初めてスライドを生成する"]
      ]
    },
    {
      name: "01_承認確認",
      rows: [
        ["field", "value", "input_rule", "description"],
        ["decision", "", "approve / revise_story / merge_options / additional_research / stop", "次工程の判断。approve の場合だけPowerPoint生成へ進む"],
        ["selected_story", outputs.recommendation.recommended_story.story_id, "A / B / C", "採用するストーリー案"],
        ["merge_policy", "", "自由記述", "merge_options の場合、統合したい案や方針を書く"],
        ["additional_research_request", "", "自由記述", "additional_research の場合、追加で調べたいことを書く"],
        ["slide_generation", "yes", "yes / no", "PowerPoint生成を許可するか"],
        ["review_comment", "", "自由記述", "承認・差し戻し理由、注意点"]
      ]
    },
    {
      name: "00_入力テーマ",
      rows: [["項目", "内容"], ...flattenObject(input)]
    },
    {
      name: "00_作成仮説",
      rows: [
        ["項目", "仮説・回答", "状態"],
        ["資料タイプ", inferred.document_type, "user_or_default"],
        ...Object.entries(inferred.assumptions).map(([key, value]) => [key, value, inferred.unknowns.includes(key) ? "codex_assumption" : "user_answer"]),
        ...inferred.confirmation_points.map((point) => ["確認事項", point, "needs_confirmation"])
      ]
    },
    {
      name: "01_質問設計",
      rows: [["質問ID", "質問カテゴリ", "質問内容", "なぜ必要か", "優先度"], ...outputs.theme.key_questions.map((q, i) => [`Q${i + 1}`, "意思決定論点", q, "企画書の判断材料にするため", "high"])]
    },
    {
      name: "02_背景環境",
      rows: [["カテゴリ", "論点", "根拠", "URL", "示唆"], ...outputs.environment.research_queries.map((q) => [q.category, q.query, "Web調査結果はWeb調査結果シートを参照", q.url, "企画書で使える背景を確認する"])]
    },
    {
      name: "02_Web調査計画",
      rows: [["ID", "評価軸", "検索クエリ", "狙う根拠", "優先度", "検索URL"], ...outputs.webResearchPlan.queries.map((q) => [q.evidence_id, q.evaluation_criterion, q.query, q.target_fact, q.priority, q.search_url])]
    },
    {
      name: "03_Web調査結果",
      rows: [["ID", "検索クエリ", "状態", "出典名", "URL", "確認日", "信頼性", "抽出要約", "エラー"], ...outputs.webResearch.results.flatMap((r) => {
        if (!r.sources || r.sources.length === 0) return [[r.evidence_id, r.query, r.status, "", "", r.checked_at, "", "", r.error]];
        return r.sources.map((s) => [r.evidence_id, r.query, r.status, s.source_name, s.source_url, s.checked_at, s.reliability, s.extracted_summary, s.error || r.error || ""]);
      })]
    },
    {
      name: "03_課題目的",
      rows: [["課題", "原因", "現象", "事業影響", "優先度"], ...outputs.issue.issues.map((i) => [i.issue, i.cause, i.symptom, i.business_impact, i.priority])]
    },
    {
      name: "04_ストーリー案",
      rows: [["案", "型", "タイトル", "要約", "強み", "弱み"], ...outputs.stories.story_options.map((s) => [s.story_id, s.story_type, s.story_title, s.one_line_summary, s.strength, s.weakness])]
    },
    {
      name: "05_施策案",
      rows: [["案", "施策ID", "施策名", "説明", "KPI", "リスク"], ...outputs.solutions.solution_options.flatMap((group) => group.solutions.map((s) => [group.story_id, s.solution_id, s.solution_name, s.description, s.kpi.join(" / "), s.risks.join(" / ")]))]
    },
    {
      name: "06_エビデンス",
      rows: [["ID", "案", "施策", "評価軸", "事実", "出典", "URL", "確認日", "信頼性", "調査状態", "示唆"], ...outputs.evidence.evidence_items.map((e) => [e.evidence_id, e.related_story_id, e.related_solution_id, e.evaluation_criterion, e.fact, e.source_name, e.source_url, e.checked_at || "", e.reliability, e.research_status || "", e.implication])]
    },
    {
      name: "07_比較評価",
      rows: [["案", "タイトル", ...Object.keys(outputs.evaluation.evaluation_table[0].scores), "初期総合点", "根拠反映後総合点", "コメント"], ...outputs.evaluation.evaluation_table.map((e) => [e.story_id, e.story_title, ...Object.values(e.scores), e.initial_total_score, e.total_score, e.evaluation_comment])]
    },
    {
      name: "07_評価補正",
      rows: [["案", "評価軸", "初期スコア", "根拠反映後スコア", "信頼度", "確認済み根拠数", "補正理由"], ...outputs.evaluation.evaluation_table.flatMap((e) => e.evidence_adjustments.map((a) => [e.story_id, a.criterion, a.initial_score, a.adjusted_score, a.confidence, a.confirmed_evidence_count, a.reason]))]
    },
    {
      name: "08_推奨案",
      rows: [["項目", "内容"], ...flattenObject(outputs.recommendation.recommended_story)]
    },
    {
      name: "09_企画書構成",
      rows: [["No", "タイトル", "役割", "メインメッセージ", "内容", "レイアウト"], ...outputs.deck.deck_outline.map((d) => [d.slide_no, d.slide_title, d.slide_role, d.main_message, d.content_items.join(" / "), d.recommended_layout])]
    },
    {
      name: "10_検証結果",
      rows: [["項目", "状態", "コメント"], ...outputs.validation.validation_results.map((v) => [v.item, v.status, v.comment])]
    },
    {
      name: "11_承認確認_予備",
      rows: [["項目", "内容"], ["備考", "入力は先頭の 01_承認確認 シートに集約しました"]]
    },
    {
      name: "12_章構造",
      rows: [["章ID", "章", "章メッセージ", "第二階層", "必要根拠"], ...outputs.chapters.chapters.map((c) => [c.chapter_id, c.chapter_title, c.chapter_message, c.level2_arguments.join(" / "), c.required_evidence.join(" / ")])]
    },
    {
      name: "13_章サマリー",
      rows: [["章ID", "スライドタイトル", "メッセージ", "全体像ポイント"], ...outputs.chapterSummaries.chapter_summaries.map((c) => [c.chapter_id, c.summary_slide_title, c.one_slide_message, c.overview_points.join(" / ")])]
    },
    {
      name: "14_論点構造",
      rows: [["章ID", "章", "第二階層ID", "第二階層", "第三階層"], ...outputs.argumentTree.argument_tree.flatMap((c) => c.arguments.map((a) => [c.chapter_id, c.chapter_title, a.level2_id, a.level2, a.level3.map((l3) => `${l3.message}(${l3.evidence_type})`).join(" / ")]))]
    },
    {
      name: "15_根拠マッピング",
      rows: [["章ID", "第二階層ID", "第二階層", "必要根拠", "候補URL", "状態"], ...outputs.evidenceMapping.evidence_mappings.map((m) => [m.chapter_id, m.level2_id, m.level2, m.required_evidence.join(" / "), m.source_candidates.join(" / "), m.evidence_status])]
    },
    {
      name: "16_スライドメッセージ",
      rows: [["種別", "章ID", "タイトル", "メインメッセージ", "補足"], ...outputs.slideMessages.slide_messages.map((s) => [s.slide_kind, s.chapter_id, s.slide_title, s.main_message, s.support_points.join(" / ")])]
    },
    {
      name: "17_スライドJSON",
      rows: [["No", "タイトル", "役割", "メッセージ", "layout_id", "根拠"], ...outputs.slideJson.slides.map((s) => [s.slide_no, s.slide_title, s.slide_role, s.main_message, s.layout_id, s.evidence.map((e) => e.source_url || e.source_name || "").join(" / ")])]
    },
    {
      name: "18_スライド検証",
      rows: [["項目", "状態", "コメント"], ...outputs.slideValidation.validation_results.map((v) => [v.item, v.status, v.comment])]
    },
    {
      name: "19_レイアウト一覧",
      rows: [["layout_id", "family", "logical_role", "use_case", "min", "max", "title_max", "body_max", "data_required"], ...outputs.layoutRegistry.layouts.map((l) => [l.layout_id, l.family, l.logical_role, l.use_case, l.min_items, l.max_items, l.title_max, l.body_max, l.data_required])]
    },
    {
      name: "20_レイアウト選定",
      rows: [["slide_key", "章ID", "タイトル", "logical_role", "family", "layout_id", "選定理由", "制約"], ...outputs.slideLayouts.slide_layouts.map((l) => [l.slide_key, l.chapter_id, l.slide_title, l.logical_role, l.family, l.layout_id, l.layout_reason, JSON.stringify(l.constraints)])]
    },
    {
      name: "21_収まり検証",
      rows: [["No", "layout_id", "fit", "issues", "split_required", "revised_title"], ...outputs.contentFitValidation.fit_results.map((f) => [f.slide_no, f.layout_id, f.is_fit, f.issues.join(" / "), f.split_required, f.revised_title])]
    },
    {
      name: "22_デザイン参照",
      rows: [["項目", "内容"], ...flattenObject(outputs.designReference)]
    }
  ];
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const body = rows.map((row, r) => {
    const cells = row.map((cell, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      if (typeof cell === "number") {
        return `<c r="${ref}"><v>${cell}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
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
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(fileCount, 8);
  end.writeUInt16LE(fileCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

function zip(files) {
  const mod = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const data = Buffer.from(file.content, "utf8");
    const crc = crc32(data);
    const local = localFileHeader(file.name, data, crc, mod);
    localParts.push(local, data);
    centralParts.push(centralDirectoryHeader(file.name, data, crc, offset, mod));
    offset += local.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  return Buffer.concat([...localParts, central, endCentralDirectory(files.length, central.length, offset)]);
}

function createXlsx(sheets, filePath) {
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbookRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>`
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: sheetXml(sheet.rows)
    }))
  ];
  fs.writeFileSync(filePath, zip(files));
}

function unzipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(compressedData) : compressedData;

    entries.push({ name, data, uncompressedSize });
    offset = dataStart + compressedSize;
  }

  return entries;
}

function zipBuffers(files) {
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

function decodeXmlText(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function replaceSlideTextXml(xml, chunks) {
  let index = 0;
  return xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, () => {
    const text = index < chunks.length ? chunks[index] : "";
    index += 1;
    return `<a:t>${xmlEscape(text)}</a:t>`;
  });
}

function slideTextChunks(slide) {
  const items = slide.content?.body_box?.items || [];
  const sources = slide.evidence?.map((item) => item.source_url).filter(Boolean) || [];
  const chunks = [
    slide.content?.title_box?.text || slide.slide_title || slide.main_message,
    `layout_id: ${slide.layout_id} / ${slide.slide_role}`,
    slide.content?.message_box?.text || slide.main_message,
    slide.content?.lead_box?.text || ""
  ];

  for (const item of items) {
    chunks.push(item.title || "");
    chunks.push(item.summary || "");
    for (const detail of item.details || []) {
      chunks.push(`▶ ${detail.point}: ${detail.description}`);
    }
  }

  if (sources.length > 0) {
    chunks.push("SOURCE");
    chunks.push(sources.slice(0, 3).join(" / "));
  }

  chunks.push(slide.speaker_note || "");
  return chunks;
}

function buildTemplateSlideMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    const match = entry.name.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (!match) continue;
    const xml = entry.data.toString();
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((item) => decodeXmlText(item[1]))
      .join(" ");
    const layoutMatch = text.match(/layout_id:\s*([A-Za-z0-9_]+)/) || text.match(/\(([A-Za-z0-9_]+)\)/);
    if (layoutMatch) {
      map.set(layoutMatch[1], Number(match[1]));
    }
  }
  return map;
}

function relationshipXml(id, target) {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`;
}

function createPptxFromTemplate(slideJson, templatePath, outputPath) {
  const templateBuffer = fs.readFileSync(templatePath);
  const entries = unzipEntries(templateBuffer);
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const slideMap = buildTemplateSlideMap(entries);
  const fallbackSlideNo = slideMap.get("standard_table") || slideMap.get("cards_3") || 1;
  const slideCount = slideJson.slides.length;
  const outputFiles = [];

  for (const entry of entries) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(entry.name)) continue;
    if (/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entry.name)) continue;
    if (entry.name === "ppt/presentation.xml") continue;
    if (entry.name === "ppt/_rels/presentation.xml.rels") continue;
    if (entry.name === "[Content_Types].xml") continue;
    outputFiles.push({ name: entry.name, content: entry.data });
  }

  for (const [index, slide] of slideJson.slides.entries()) {
    const sourceSlideNo = slideMap.get(slide.layout_id) || fallbackSlideNo;
    const sourceSlide = entryMap.get(`ppt/slides/slide${sourceSlideNo}.xml`);
    const sourceRels = entryMap.get(`ppt/slides/_rels/slide${sourceSlideNo}.xml.rels`);
    const newSlideNo = index + 1;
    const xml = replaceSlideTextXml(sourceSlide.data.toString(), slideTextChunks(slide));
    outputFiles.push({ name: `ppt/slides/slide${newSlideNo}.xml`, content: xml });
    if (sourceRels) {
      outputFiles.push({ name: `ppt/slides/_rels/slide${newSlideNo}.xml.rels`, content: sourceRels.data });
    }
  }

  const originalPresentation = entryMap.get("ppt/presentation.xml").data.toString();
  const slideIds = slideJson.slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rIdSlide${index + 1}"/>`)
    .join("");
  const presentationXml = originalPresentation.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${slideIds}</p:sldIdLst>`);

  const originalPresentationRels = entryMap.get("ppt/_rels/presentation.xml.rels").data.toString();
  const nonSlideRels = [...originalPresentationRels.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((item) => item[0])
    .filter((rel) => !rel.includes("/relationships/slide\""));
  const slideRels = slideJson.slides
    .map((_, index) => relationshipXml(`rIdSlide${index + 1}`, `slides/slide${index + 1}.xml`));
  const presentationRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...nonSlideRels, ...slideRels].join("")}</Relationships>`;

  const originalContentTypes = entryMap.get("[Content_Types].xml").data.toString();
  const slideOverrides = slideJson.slides
    .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("");
  const contentTypesXml = originalContentTypes
    .replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slide\+xml"\/>/g, "")
    .replace("</Types>", `${slideOverrides}</Types>`);

  outputFiles.push({ name: "[Content_Types].xml", content: contentTypesXml });
  outputFiles.push({ name: "ppt/presentation.xml", content: presentationXml });
  outputFiles.push({ name: "ppt/_rels/presentation.xml.rels", content: presentationRelsXml });

  fs.writeFileSync(outputPath, zipBuffers(outputFiles));
  return {
    file_name: path.basename(outputPath),
    slide_count: slideCount,
    template_slide_count: slideMap.size,
    design_template: templatePath,
    export_strategy: "layout_idに対応する指定PPTX内スライドを複製し、テキストを差し替え"
  };
}

function loadRuntimeConfig() {
  const input = normalizeInput(readJson(templateRoot, "inputs/user-theme.json"));
  const order = readJson(templateRoot, "config/agent-order.json");
  const agentPipeline = readJson(templateRoot, "config/agent-pipeline.json");
  const storyTypes = readJson(templateRoot, "config/story-types.json");
  const criteria = readJson(templateRoot, "config/evaluation-criteria.json");
  const layoutRegistry = readJson(templateRoot, "config/layout-registry.json");
  const layoutSelectionRules = readJson(templateRoot, "config/layout-selection-rules.json");
  const chapterLayoutMap = readJson(templateRoot, "config/chapter-layout-map.json");
  const webResearchConfig = readJson(templateRoot, "config/web-research.json");
  const designReference = {
    file: "templates/proposal-story/assets/design/slide_layout_collection_native.pptx",
    layout_management_file: "templates/proposal-story/assets/design/proposal_layout_management.xlsx",
    pptx_output_file: "proposal_story_slides.pptx",
    source: "slide_layout_collection_native.pptx",
    slide_count: 57,
    usage: "出力スライドのデザイン参照。Renderer/PPT出力時はこのネイティブPPTXのデザインを優先する。"
  };
  return { input, order, agentPipeline, storyTypes, criteria, layoutRegistry, layoutSelectionRules, chapterLayoutMap, webResearchConfig, designReference };
}

async function buildOutputs(config) {
  const { input, order, agentPipeline, storyTypes, criteria, layoutRegistry, layoutSelectionRules, chapterLayoutMap, webResearchConfig, designReference } = config;
  const orchestrator = createOrchestrator(input, order);
  const theme = createThemeInterpreter(input);
  const environment = createEnvironmentResearch(input);
  const issue = createIssueObjective(input, environment);
  const stories = createStoryGenerator(input, storyTypes);
  const solutions = createSolutionGenerator(stories);
  const initialEvidence = createEvidenceResearch(stories, solutions, criteria, input);
  const webResearchPlan = createWebResearchPlan(input, initialEvidence, webResearchConfig);
  const webResearchEnabled = input.constraints.must_use_web_evidence && webResearchConfig.enabled_by_default && !skipWebResearch;
  const webResearch = await runWebResearch(webResearchPlan, webResearchConfig, webResearchEnabled);
  const evidence = enrichEvidenceWithWebResearch(initialEvidence, webResearch);
  const evaluation = createEvaluation(stories, criteria, evidence);
  const recommendation = createRecommendation(evaluation, stories, solutions);
  const deck = createDeckOutline(input, recommendation);
  const chapters = createChapterDesigner(input, issue, recommendation);
  const chapterSummaries = createChapterSummary(chapters);
  const argumentTree = createArgumentBuilder(chapters);
  const evidenceMapping = createEvidenceMapping(argumentTree, evidence, input);
  const slideMessages = createSlideMessageBuilder(chapterSummaries, argumentTree);
  const slideLayouts = createSlideLayoutSelector(slideMessages, layoutRegistry, chapterLayoutMap);
  const slideJson = createSlideJsonBuilder(slideLayouts, evidenceMapping, webResearch);
  const layoutRegistryManager = createLayoutRegistryManager(layoutRegistry);
  const contentFitValidation = createContentFitValidator(slideJson, layoutRegistry);
  const slideValidation = createSlideValidation(slideJson, chapterSummaries, layoutRegistry, contentFitValidation);
  const finalSlidePlan = createFinalSlidePlan(slideJson, slideLayouts, contentFitValidation, designReference);
  const validation = createValidation({ stories, solutions, evidence, evaluation, recommendation, deck, chapters, slideJson, slideValidation });
  const outputs = {
    agentPipeline,
    orchestrator,
    theme,
    environment,
    issue,
    stories,
    solutions,
    webResearchPlan,
    webResearch,
    evidence,
    evaluation,
    recommendation,
    deck,
    validation,
    chapters,
    chapterSummaries,
    argumentTree,
    evidenceMapping,
    slideMessages,
    slideLayouts,
    slideJson,
    slideValidation,
    layoutRegistry,
    layoutSelectionRules,
    chapterLayoutMap,
    layoutRegistryManager,
    contentFitValidation,
    finalSlidePlan,
    designReference
  };
  const workbookRows = createWorkbookRows(input, outputs);
  const excelExporter = createExcelExporter(workbookRows);
  outputs.excelExporter = excelExporter;
  return { input, outputs, workbookRows };
}

function analysisFiles() {
  return [
    "agent_prompt_chain.json",
    "approval_request.json",
    "00_orchestrator.json",
    "01_theme_interpreter.json",
    "02_environment_research.json",
    "03_issue_objective.json",
    "04_story_generator.json",
    "05_solution_generator.json",
    "web_research_plan.json",
    "web_research_results.json",
    "06_evidence_research.json",
    "07_evaluation.json",
    "08_recommendation.json",
    "09_deck_outline.json",
    "10_validation.json",
    "11_chapter_designer.json",
    "12_chapter_summary.json",
    "13_argument_builder.json",
    "14_evidence_mapping.json",
    "15_slide_message_builder.json",
    "16_slide_layout_selector.json",
    "17_slide_json_builder.json",
    "18_slide_validation.json",
    "19_layout_registry_manager.json",
    "20_content_fit_validator.json",
    "21_excel_exporter.json",
    "layout_registry.csv",
    "final_slide_plan.json",
    "final_report.md",
    "proposal_story_analysis.xlsx",
    "selected_story_review.md"
  ];
}

function slideFiles() {
  return [
    "approval_decision.json",
    "22_powerpoint_exporter.json",
    "proposal_story_slides.pptx"
  ];
}

function writeAnalysisOutputs(runDir, input, outputs, workbookRows, phase) {
  const manifest = {
    run_id: path.basename(runDir),
    template_id: templateId,
    phase,
    created_at: new Date().toISOString(),
    input_theme: input.theme,
    files: phase === "analysis" ? analysisFiles() : [...analysisFiles(), ...slideFiles()]
  };

  writeJson(runDir, "run_manifest.json", manifest);
  writeJson(runDir, "agent_prompt_chain.json", outputs.agentPipeline);
  writeJson(runDir, "approval_request.json", createApprovalRequest(runDir, input, outputs));
  writeJson(runDir, "00_orchestrator.json", outputs.orchestrator);
  writeJson(runDir, "01_theme_interpreter.json", outputs.theme);
  writeJson(runDir, "02_environment_research.json", outputs.environment);
  writeJson(runDir, "03_issue_objective.json", outputs.issue);
  writeJson(runDir, "04_story_generator.json", outputs.stories);
  writeJson(runDir, "05_solution_generator.json", outputs.solutions);
  writeJson(runDir, "web_research_plan.json", outputs.webResearchPlan);
  writeJson(runDir, "web_research_results.json", outputs.webResearch);
  writeJson(runDir, "06_evidence_research.json", outputs.evidence);
  writeJson(runDir, "07_evaluation.json", outputs.evaluation);
  writeJson(runDir, "08_recommendation.json", outputs.recommendation);
  writeJson(runDir, "09_deck_outline.json", outputs.deck);
  writeJson(runDir, "10_validation.json", outputs.validation);
  writeJson(runDir, "11_chapter_designer.json", outputs.chapters);
  writeJson(runDir, "12_chapter_summary.json", outputs.chapterSummaries);
  writeJson(runDir, "13_argument_builder.json", outputs.argumentTree);
  writeJson(runDir, "14_evidence_mapping.json", outputs.evidenceMapping);
  writeJson(runDir, "15_slide_message_builder.json", outputs.slideMessages);
  writeJson(runDir, "16_slide_layout_selector.json", outputs.slideLayouts);
  writeJson(runDir, "17_slide_json_builder.json", outputs.slideJson);
  writeJson(runDir, "18_slide_validation.json", outputs.slideValidation);
  writeJson(runDir, "19_layout_registry_manager.json", outputs.layoutRegistryManager);
  writeJson(runDir, "20_content_fit_validator.json", outputs.contentFitValidation);
  writeJson(runDir, "21_excel_exporter.json", outputs.excelExporter);
  writeJson(runDir, "final_slide_plan.json", outputs.finalSlidePlan);
  writeText(path.join(runDir, "layout_registry.csv"), createLayoutRegistryCsv(outputs.layoutRegistry));
  writeText(path.join(runDir, "final_report.md"), createFinalReport(input, outputs));
  writeText(path.join(runDir, "selected_story_review.md"), createApprovalReview(outputs));
  createXlsx(workbookRows, path.join(runDir, "proposal_story_analysis.xlsx"));
}

function exportSlides(runDir) {
  const approvalDecisionPath = path.join(runDir, "approval_decision.json");
  if (!forceSlides) {
    if (!fs.existsSync(approvalDecisionPath)) {
      throw new Error(`Approval decision not found. Review Excel first, then run: npm run continue -- ${path.relative(root, runDir)}`);
    }
    const approvalDecision = JSON.parse(fs.readFileSync(approvalDecisionPath, "utf8"));
    if (approvalDecision.decision !== "approve") {
      throw new Error(`Slides are blocked because approval decision is '${approvalDecision.decision}'.`);
    }
  }
  const slideJsonPath = path.join(runDir, "17_slide_json_builder.json");
  if (!fs.existsSync(slideJsonPath)) {
    throw new Error(`Slide JSON not found. Run analysis first: ${slideJsonPath}`);
  }
  const slideJson = JSON.parse(fs.readFileSync(slideJsonPath, "utf8"));
  const pptxExport = createPptxFromTemplate(
    slideJson,
    path.join(templateRoot, "assets/design/slide_layout_collection_native.pptx"),
    path.join(runDir, "proposal_story_slides.pptx")
  );
  writeJson(runDir, "22_powerpoint_exporter.json", pptxExport);

  const manifestPath = path.join(runDir, "run_manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const files = new Set([...(manifest.files || []), ...slideFiles()]);
    manifest.phase = "slides";
    manifest.slides_exported_at = new Date().toISOString();
    manifest.files = [...files];
    writeJson(runDir, "run_manifest.json", manifest);
  }

  return pptxExport;
}

async function run() {
  ensureDirs();
  const config = loadRuntimeConfig();
  const { input, outputs, workbookRows } = await buildOutputs(config);

  if (checkOnly) {
    console.log("OK: configuration and input files are readable.");
    console.log(`Theme: ${input.theme}`);
    console.log(`Story options: ${outputs.stories.story_options.length}`);
    console.log(`Layouts: ${config.layoutRegistry.layouts.length}`);
    return;
  }

  if (phaseArg === "slides") {
    if (!runDirArg) {
      throw new Error("Missing --run-dir for --phase slides");
    }
    const targetRunDir = path.resolve(root, runDirArg);
    const pptxExport = exportSlides(targetRunDir);
    console.log("Generated PowerPoint output.");
    console.log(`Run folder: ${targetRunDir}`);
    console.log(`- ${path.join(targetRunDir, pptxExport.file_name)}`);
    return;
  }

  const { runDir } = createRunDir();
  writeAnalysisOutputs(runDir, input, outputs, workbookRows, phaseArg === "analysis" ? "analysis" : "all");

  if (phaseArg === "all") {
    exportSlides(runDir);
  } else if (phaseArg !== "analysis") {
    throw new Error(`Unknown phase: ${phaseArg}`);
  }

  console.log("Generated proposal story outputs.");
  console.log(`Run folder: ${runDir}`);
  console.log(`- ${path.join(runDir, "final_report.md")}`);
  console.log(`- ${path.join(runDir, "proposal_story_analysis.xlsx")}`);
  if (phaseArg === "all") {
    console.log(`- ${path.join(runDir, "proposal_story_slides.pptx")}`);
  } else {
    console.log("Review gate is pending. Open the Excel output, then run:");
    console.log(`npm run continue -- ${path.relative(root, runDir)}`);
  }
  console.log(`- ${path.join(runDir, "selected_story_review.md")}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
