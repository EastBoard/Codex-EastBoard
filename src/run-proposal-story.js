import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";

const root = process.cwd();
const templateId = "proposal-story";
const templateRoot = path.join(root, "templates", templateId);
const outputBaseDir = path.join(root, "outputs", templateId);
const checkOnly = process.argv.includes("--check");

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

function normalizeInput(input) {
  return {
    theme: asText(input.theme, "未設定テーマ"),
    target_reader: asText(input.target_reader, "経営者・決裁者・事業責任者"),
    proposal_goal: asText(input.proposal_goal, "企画書で意思決定を得る"),
    industry: asText(input.industry, "未指定"),
    company_context: asText(input.company_context, "未指定"),
    constraints: {
      region: asText(input.constraints?.region, "日本"),
      language: asText(input.constraints?.language, "ja"),
      must_use_web_evidence: input.constraints?.must_use_web_evidence !== false,
      minimum_story_options: Number(input.constraints?.minimum_story_options || 3)
    }
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
  return {
    input_theme: input.theme,
    interpreted_theme: `${input.theme}を、${input.target_reader}が投資・実行判断できる企画書ストーリーに変換する`,
    proposal_purpose: input.proposal_goal,
    target_reader: input.target_reader,
    decision_points: [
      "なぜ今取り組むべきか",
      "どの課題を解決するのか",
      "複数案のうち、どのストーリーが最も勝てるのか",
      "必要な投資・体制・期間は妥当か",
      "期待成果と主要リスクは何か"
    ],
    key_questions: [
      `${input.theme}の市場・業界変化は何か`,
      `顧客は${input.theme}にどのような課題や期待を持っているか`,
      `競合や先行企業はどのような取り組みをしているか`,
      `短期成果と中長期拡張性を両立できる施策は何か`,
      `経営判断に必要な根拠は何か`
    ],
    research_needs: [
      buildSearchQuery(input.theme, "市場規模 成長率"),
      buildSearchQuery(input.theme, "顧客ニーズ 調査"),
      buildSearchQuery(input.theme, "導入事例 成功事例"),
      buildSearchQuery(input.theme, "競合 企業 事例"),
      buildSearchQuery(input.theme, "ROI 効果 KPI")
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
  const categories = [
    ["market_trends", "市場環境", "市場規模、成長率、導入拡大の兆候を確認する"],
    ["customer_trends", "顧客ニーズ", "顧客の業務課題、購買行動、期待効果を確認する"],
    ["competitor_trends", "競合動向", "競合・先行企業の機能、価格、導入事例を確認する"],
    ["technology_trends", "技術変化", "AI、データ連携、自動化、セキュリティ要件を確認する"],
    ["social_regulatory_trends", "社会・制度変化", "働き方、個人情報、AI利用ルール、業界規制を確認する"]
  ];
  const data = {
    environment_summary: `${input.theme}は、顧客課題、技術進化、競争環境の変化を踏まえて、意思決定者に投資理由を示す必要がある。`,
    key_implications: [
      "市場性だけでなく、自社が勝てる導入領域を絞る必要がある",
      "効果測定可能なKPIを先に設計する必要がある",
      "競合比較では機能差よりも導入後の成果差を示す必要がある"
    ],
    research_queries: []
  };

  for (const [key, label, impact] of categories) {
    const query = buildSearchQuery(input.theme, label);
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
  const issues = [
    {
      issue: "投資判断に必要な市場性と成果見込みが曖昧",
      background_link: env.market_trends[0].point,
      cause: "市場・顧客・競合情報が企画書上で分断されている",
      symptom: "提案が魅力的でも、なぜ今やるべきかが弱く見える",
      business_impact: "承認遅延、優先度低下、予算化失敗につながる",
      priority: "high"
    },
    {
      issue: "顧客課題と施策の対応関係が見えにくい",
      background_link: env.customer_trends[0].point,
      cause: "顧客ニーズを施策・KPIへ変換できていない",
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
    issue_summary: `${input.theme}の企画化では、環境変化を根拠に、顧客課題、勝ち筋、成果指標を一貫させることが重要である。`,
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
    core_message: `${input.theme}は、単なる施策紹介ではなく、根拠に基づく勝ち筋ストーリーとして設計すべきである。`,
    must_address_points: [
      "市場・顧客・競合の根拠",
      "複数ストーリー案の比較",
      "採用案のリスクと対応",
      "KPIと実行計画"
    ]
  };
}

function createStoryGenerator(input, storyTypes) {
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
        background: `${input.theme}に関する環境変化を、${type.name}の観点で整理する。`,
        issue: index === 0 ? "市場機会の大きさを投資判断に変換できていない" : index === 1 ? "現場課題と施策の接続が弱い" : "競合との差別化理由が弱い",
        objective: `${input.target_reader}が採用可否を判断できるストーリーを作る`,
        proposal_direction: `${type.purpose}方向で、背景、課題、施策、KPIを接続する`,
        target_reader_fit: index === 0 ? "成長投資を重視する読者に合う" : index === 1 ? "現場課題と実行性を重視する読者に合う" : "競争優位や差別化を重視する読者に合う",
        strength: index === 0 ? "将来性を打ち出しやすい" : index === 1 ? "課題解決の必然性を示しやすい" : "勝ち筋を明確にしやすい",
        weakness: index === 0 ? "根拠が弱いと楽観的に見える" : index === 1 ? "大きな成長性の説明が弱くなる可能性がある" : "競合情報の質に左右される",
        required_evidence: [
          buildSearchQuery(input.theme, "市場規模 成長率"),
          buildSearchQuery(input.theme, "顧客課題 導入事例"),
          buildSearchQuery(input.theme, "競合比較")
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
          implementation_steps: ["対象領域を選定", "現状KPIを確認", "小規模に試行", "効果測定", "拡張判断"],
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

function createEvaluation(stories, criteria) {
  const profiles = [
    [5, 4, 3, 3, 4, 3, 5, 3, 3, 4],
    [3, 5, 3, 5, 4, 5, 3, 4, 4, 5],
    [4, 3, 5, 3, 3, 3, 4, 3, 3, 4],
    [3, 4, 3, 4, 5, 4, 3, 4, 4, 5],
    [3, 5, 4, 4, 4, 4, 4, 4, 4, 4]
  ];

  const evaluationTable = stories.story_options.map((story, index) => {
    const scores = {};
    criteria.criteria.forEach((criterion, criterionIndex) => {
      scores[criterion] = profiles[index % profiles.length][criterionIndex] || 3;
    });
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    return {
      story_id: story.story_id,
      story_title: story.story_title,
      scores,
      total_score: total,
      evidence_based_reason: `初期評価。outputs/${templateId}/YYYYMMDD_HHMMSS/06_evidence_research.json の検索URLで根拠確認後に更新する。`,
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

function createValidation(outputs) {
  const storyCount = outputs.stories.story_options.length;
  const missing = outputs.evidence.missing_evidence.length;
  return {
    validation_results: [
      { item: "テーマ解釈", status: "ok", comment: "入力テーマから意思決定論点へ変換済み" },
      { item: "複数案", status: storyCount >= 3 ? "ok" : "ng", comment: `${storyCount}案を生成` },
      { item: "施策対応", status: "ok", comment: "各ストーリーに2施策を生成" },
      { item: "比較評価", status: "ok", comment: "固定評価軸でスコアリング済み" },
      { item: "Web根拠", status: "needs_research", comment: `${missing}件の不足情報あり。検索URLで追加確認が必要` },
      { item: "企画書構成", status: "ok", comment: "推奨案をスライド構成へ変換済み" }
    ],
    next_actions: [
      "検索URLから根拠を確認し、06_evidence_research.jsonを更新する",
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
  const evalRows = outputs.evaluation.evaluation_table
    .map((row) => `| ${row.story_id} | ${row.story_title} | ${row.total_score} | ${row.evaluation_comment} |`)
    .join("\n");
  const stories = outputs.stories.story_options
    .map((story) => `### ${story.story_id}. ${story.story_title}\n\n- 型: ${story.story_type}\n- 要約: ${story.one_line_summary}\n- 強み: ${story.strength}\n- 弱み: ${story.weakness}`)
    .join("\n\n");
  const slides = outputs.deck.deck_outline
    .map((slide) => `| ${slide.slide_no} | ${slide.slide_title} | ${slide.main_message} |`)
    .join("\n");

  return `# 企画書ストーリー設計レポート

## 1. テーマ解釈

- 入力テーマ: ${input.theme}
- 企画目的: ${input.proposal_goal}
- 想定読者: ${input.target_reader}
- 解釈: ${outputs.theme.interpreted_theme}

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

この初期実装では外部検索APIを直接呼びません。以下の検索候補から事実確認を行い、根拠URLを追記してください。

${markdownList(outputs.evidence.evidence_items.slice(0, 10).map((item) => `${item.evidence_id}: ${item.evaluation_criterion} / ${item.source_url}`))}

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

## 10. 検証結果

${markdownList(outputs.validation.validation_results.map((item) => `${item.item}: ${item.status} - ${item.comment}`))}

## 11. 不足情報・追加調査事項

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

function flattenObject(obj) {
  return Object.entries(obj).map(([key, value]) => [key, Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : value]);
}

function createWorkbookRows(input, outputs) {
  return [
    {
      name: "00_入力テーマ",
      rows: [["項目", "内容"], ...flattenObject(input)]
    },
    {
      name: "01_質問設計",
      rows: [["質問ID", "質問カテゴリ", "質問内容", "なぜ必要か", "優先度"], ...outputs.theme.key_questions.map((q, i) => [`Q${i + 1}`, "意思決定論点", q, "企画書の判断材料にするため", "high"])]
    },
    {
      name: "02_背景環境",
      rows: [["カテゴリ", "論点", "根拠", "URL", "示唆"], ...outputs.environment.research_queries.map((q) => [q.category, q.query, "未調査", q.url, "企画書で使える背景を確認する"])]
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
      rows: [["ID", "案", "施策", "評価軸", "事実", "出典", "URL", "信頼性", "示唆"], ...outputs.evidence.evidence_items.map((e) => [e.evidence_id, e.related_story_id, e.related_solution_id, e.evaluation_criterion, e.fact, e.source_name, e.source_url, e.reliability, e.implication])]
    },
    {
      name: "07_比較評価",
      rows: [["案", "タイトル", ...Object.keys(outputs.evaluation.evaluation_table[0].scores), "総合点", "コメント"], ...outputs.evaluation.evaluation_table.map((e) => [e.story_id, e.story_title, ...Object.values(e.scores), e.total_score, e.evaluation_comment])]
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
      name: "11_承認確認",
      rows: [["確認項目", "回答"], ["このストーリーで企画書化するか", ""], ["別案を採用するか", ""], ["複数案を統合するか", ""], ["追加調査を行うか", ""]]
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

function run() {
  ensureDirs();
  const input = normalizeInput(readJson(templateRoot, "inputs/user-theme.json"));
  const order = readJson(templateRoot, "config/agent-order.json");
  const storyTypes = readJson(templateRoot, "config/story-types.json");
  const criteria = readJson(templateRoot, "config/evaluation-criteria.json");

  const orchestrator = createOrchestrator(input, order);
  const theme = createThemeInterpreter(input);
  const environment = createEnvironmentResearch(input);
  const issue = createIssueObjective(input, environment);
  const stories = createStoryGenerator(input, storyTypes);
  const solutions = createSolutionGenerator(stories);
  const evidence = createEvidenceResearch(stories, solutions, criteria, input);
  const evaluation = createEvaluation(stories, criteria);
  const recommendation = createRecommendation(evaluation, stories, solutions);
  const deck = createDeckOutline(input, recommendation);
  const validation = createValidation({ stories, solutions, evidence, evaluation, recommendation, deck });
  const outputs = { orchestrator, theme, environment, issue, stories, solutions, evidence, evaluation, recommendation, deck, validation };

  if (checkOnly) {
    console.log("OK: configuration and input files are readable.");
    console.log(`Theme: ${input.theme}`);
    console.log(`Story options: ${stories.story_options.length}`);
    return;
  }

  const { runId, runDir } = createRunDir();
  const manifest = {
    run_id: runId,
    template_id: templateId,
    created_at: new Date().toISOString(),
    input_theme: input.theme,
    files: [
      "00_orchestrator.json",
      "01_theme_interpreter.json",
      "02_environment_research.json",
      "03_issue_objective.json",
      "04_story_generator.json",
      "05_solution_generator.json",
      "06_evidence_research.json",
      "07_evaluation.json",
      "08_recommendation.json",
      "09_deck_outline.json",
      "10_validation.json",
      "final_report.md",
      "proposal_story_analysis.xlsx",
      "selected_story_review.md"
    ]
  };

  writeJson(runDir, "run_manifest.json", manifest);
  writeJson(runDir, "00_orchestrator.json", orchestrator);
  writeJson(runDir, "01_theme_interpreter.json", theme);
  writeJson(runDir, "02_environment_research.json", environment);
  writeJson(runDir, "03_issue_objective.json", issue);
  writeJson(runDir, "04_story_generator.json", stories);
  writeJson(runDir, "05_solution_generator.json", solutions);
  writeJson(runDir, "06_evidence_research.json", evidence);
  writeJson(runDir, "07_evaluation.json", evaluation);
  writeJson(runDir, "08_recommendation.json", recommendation);
  writeJson(runDir, "09_deck_outline.json", deck);
  writeJson(runDir, "10_validation.json", validation);

  writeText(path.join(runDir, "final_report.md"), createFinalReport(input, outputs));
  writeText(path.join(runDir, "selected_story_review.md"), createApprovalReview(outputs));
  createXlsx(createWorkbookRows(input, outputs), path.join(runDir, "proposal_story_analysis.xlsx"));

  console.log("Generated proposal story outputs.");
  console.log(`Run folder: ${runDir}`);
  console.log(`- ${path.join(runDir, "final_report.md")}`);
  console.log(`- ${path.join(runDir, "proposal_story_analysis.xlsx")}`);
  console.log(`- ${path.join(runDir, "selected_story_review.md")}`);
}

run();
