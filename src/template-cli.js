import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = process.cwd();
const templatesDir = path.join(root, "templates");
const args = process.argv.slice(2);

function readArg(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readPositionalRunDir() {
  const reserved = new Set(["--template", "--run-dir"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (reserved.has(args[index - 1])) continue;
    if (reserved.has(arg) || arg === "--continue" || arg === "--yes" || arg === "--defaults" || arg === "--dry-run" || arg === "--list" || arg === "--help" || arg === "-h") continue;
    if (!arg.startsWith("--")) return arg;
  }
  return "";
}

const options = {
  templateId: readArg("--template", ""),
  runDir: readArg("--run-dir", "") || readPositionalRunDir(),
  continueMode: args.includes("--continue"),
  assumeYes: args.includes("--yes"),
  allowIncompleteResearch: args.includes("--allow-incomplete-research"),
  defaults: args.includes("--defaults"),
  dryRun: args.includes("--dry-run"),
  listOnly: args.includes("--list"),
  help: args.includes("--help") || args.includes("-h")
};

function printHelp() {
  console.log(`Codex EastBoard Template Runner

Usage:
  npm start
  node src/template-cli.js --template proposal-story
  npm run continue -- outputs/proposal-story/YYYYMMDD_HHMMSS
  node src/template-cli.js --defaults
  node src/template-cli.js --dry-run
  node src/template-cli.js --list
  node src/template-cli.js --continue outputs/proposal-story/YYYYMMDD_HHMMSS --allow-incomplete-research

Flow:
  1. Read templates/*/template.json
  2. Show the template menu
  3. Ask questions from questions.json
  4. Write answers to the template input JSON
  5. Run the analysis phase and stop at Excel review
  6. Continue from an approved run folder to generate slides
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadTemplates() {
  if (!fs.existsSync(templatesDir)) return [];
  return fs.readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const templateRoot = path.join(templatesDir, entry.name);
      const manifestPath = path.join(templateRoot, "template.json");
      if (!fs.existsSync(manifestPath)) return null;
      const manifest = readJson(manifestPath);
      return { ...manifest, templateRoot, manifestPath };
    })
    .filter(Boolean);
}

function getNested(obj, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], obj);
}

function setNested(obj, dottedPath, value) {
  const keys = dottedPath.split(".");
  let current = obj;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[keys.at(-1)] = value;
}

function templateSummary(template, index) {
  return `${index + 1}. ${template.id} - ${template.name}\n   ${template.description}`;
}

async function chooseTemplate(rl, templates) {
  if (options.templateId) {
    const selected = templates.find((template) => template.id === options.templateId);
    if (!selected) {
      throw new Error(`Unknown template: ${options.templateId}`);
    }
    return selected;
  }

  console.log("Available templates:");
  for (const [index, template] of templates.entries()) {
    console.log(templateSummary(template, index));
  }

  if (options.defaults) return templates[0];

  while (true) {
    const answer = (await rl.question("\nSelect a template [1]: ")).trim() || "1";
    const numeric = Number(answer);
    const selected = Number.isInteger(numeric)
      ? templates[numeric - 1]
      : templates.find((template) => template.id === answer);
    if (selected) return selected;
    console.log("Please enter a listed number or template id.");
  }
}

async function collectAnswers(rl, template) {
  const inputPath = path.join(template.templateRoot, template.input || "inputs/user-theme.json");
  const questionsPath = path.join(template.templateRoot, template.questions || "questions.json");
  const currentInput = fs.existsSync(inputPath) ? readJson(inputPath) : {};
  const questionSet = fs.existsSync(questionsPath) ? readJson(questionsPath) : { questions: [] };

  if (questionSet.questions.length === 0) {
    console.log("\nNo questions.json entries found. Existing input JSON will be used.");
    return { inputPath, nextInput: currentInput };
  }

  if (questionSet.question_policy?.instruction_to_user) {
    console.log(`\n${questionSet.question_policy.instruction_to_user}`);
  } else {
    console.log("\nAnswer template questions. Press Enter to keep the shown default.");
  }
  const nextInput = structuredClone(currentInput);

  for (const question of questionSet.questions) {
    const current = getNested(nextInput, question.target_path);
    const defaultValue = question.default ?? current ?? "";
    if (options.defaults) {
      if ((current === undefined || current === "") && question.default !== undefined) {
        setNested(nextInput, question.target_path, question.default);
      }
      continue;
    }

    while (true) {
      const label = question.label ? `${question.label}: ` : "";
      const suffix = defaultValue !== "" ? ` [${defaultValue}]` : "";
      const examples = Array.isArray(question.examples) && question.examples.length > 0
        ? `\n例: ${question.examples.join(" / ")}`
        : "";
      const why = question.why ? `\n目的: ${question.why}` : "";
      const answer = (await rl.question(`${label}${question.question}${suffix}${examples}${why}\n> `)).trim();
      const value = answer || defaultValue;
      if (question.required && String(value).trim() === "") {
        console.log("This answer is required.");
        continue;
      }
      setNested(nextInput, question.target_path, value);
      break;
    }
  }

  return { inputPath, nextInput };
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, argsForCommand) {
  if (options.dryRun) {
    console.log(`[dry-run] ${command} ${argsForCommand.join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }

  const result = spawnSync(command, argsForCommand, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${argsForCommand.join(" ")}`);
  }
  return result;
}

function commandForPhase(template, phase, context) {
  if (template.id === "proposal-story") {
    if (phase.id === "analysis") {
      return { command: process.execPath, args: ["src/run-proposal-story.js", "--phase", "analysis"] };
    }
    if (phase.id === "slides") {
      return {
        command: process.execPath,
        args: ["src/run-proposal-story.js", "--phase", "slides", "--run-dir", context.analysisRunDir]
      };
    }
  }

  const command = phase.command || "";
  if (command.startsWith("npm run ")) {
    const script = command.replace("npm run ", "").split(/\s+/)[0];
    const extraArgs = [];
    if (command.includes("<analysis_run_dir>")) {
      extraArgs.push("--", "--run-dir", context.analysisRunDir);
    }
    return { command: npmCommand(), args: ["run", script, ...extraArgs] };
  }

  throw new Error(`No executable command mapping for phase: ${phase.id}`);
}

function extractRunDir(stdout) {
  const match = stdout.match(/Run folder:\s*(.+)/);
  return match ? match[1].trim() : "";
}

function decodeXmlText(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
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
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(compressedData) : compressedData;

    entries.push({ name, data });
    offset = dataStart + compressedSize;
  }

  return entries;
}

function parseSharedStrings(entryMap) {
  const entry = entryMap.get("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = entry.data.toString();
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const text = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXmlText(item[1])).join("");
    return text;
  });
}

function parseSheetRows(sheetXml, sharedStrings) {
  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(rowMatch[1]) - 1;
    rows[rowIndex] ||= [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/r="([A-Z]+)(\d+)"/);
      if (!ref) continue;
      const col = ref[1].split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const type = attrs.match(/t="([^"]+)"/)?.[1] || "";
      let value = "";
      if (type === "inlineStr") {
        value = decodeXmlText(body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "");
      } else if (type === "s") {
        const index = Number(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || 0);
        value = sharedStrings[index] || "";
      } else {
        value = decodeXmlText(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "");
      }
      rows[rowIndex][col] = value;
    }
  }
  return rows.map((row) => row || []);
}

function readWorkbookSheet(filePath, sheetName) {
  if (!fs.existsSync(filePath)) return [];
  const entries = unzipEntries(fs.readFileSync(filePath));
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const workbook = entryMap.get("xl/workbook.xml")?.data.toString() || "";
  const rels = entryMap.get("xl/_rels/workbook.xml.rels")?.data.toString() || "";
  const sheetMatch = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
    .find((match) => decodeXmlText(match[1]) === sheetName);
  if (!sheetMatch) return [];
  const relMatch = [...rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)]
    .find((match) => match[1] === sheetMatch[2]);
  if (!relMatch) return [];
  const target = relMatch[2].startsWith("/") ? relMatch[2].slice(1) : `xl/${relMatch[2]}`.replaceAll("\\", "/");
  const sheetXml = entryMap.get(target)?.data.toString();
  if (!sheetXml) return [];
  return parseSheetRows(sheetXml, parseSharedStrings(entryMap));
}

function readApprovalSheet(runDir) {
  const workbookPath = path.join(runDir, "proposal_story_analysis.xlsx");
  const rows = readWorkbookSheet(workbookPath, "01_承認確認");
  const values = {};
  for (const row of rows.slice(1)) {
    const key = String(row[0] || "").trim();
    if (!key) continue;
    values[key] = String(row[1] || "").trim();
  }
  return values;
}

function relativeRunDir(runDir) {
  return path.relative(root, runDir);
}

function printReviewGate(runDir) {
  const relative = relativeRunDir(runDir);
  console.log("\nReview gate: Excel output is ready.");
  console.log("Open and review these files before generating slides:");
  console.log(`- ${path.join(runDir, "proposal_story_analysis.xlsx")}`);
  console.log(`- ${path.join(runDir, "selected_story_review.md")}`);
  console.log(`- ${path.join(runDir, "approval_request.json")}`);
  console.log("\nAfter review, continue with:");
  console.log(`npm run continue -- ${relative}`);
  console.log("\nPowerPoint generation is intentionally stopped until that approval step.");
}

function writeApprovalDecision(runDir, decision, details = {}) {
  const decisionPath = path.join(runDir, "approval_decision.json");
  const value = {
    status: decision === "approve" ? "approved" : "not_approved",
    decision,
    selected_story: details.selected_story || "",
    slide_generation: details.slide_generation || "",
    merge_policy: details.merge_policy || "",
    additional_research_request: details.additional_research_request || "",
    review_comment: details.review_comment || details.note || "",
    source: details.source || "cli",
    decided_at: new Date().toISOString(),
    rule: "slides phase can run only when decision is approve"
  };
  if (options.dryRun) {
    console.log(`[dry-run] Would write ${path.relative(root, decisionPath)}`);
  } else {
    writeJson(decisionPath, value);
  }
  return value;
}

function normalizeDecision(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = {
    yes: "approve",
    y: "approve",
    承認: "approve",
    approve: "approve",
    revise: "revise_story",
    revise_story: "revise_story",
    修正: "revise_story",
    merge: "merge_options",
    merge_options: "merge_options",
    統合: "merge_options",
    research: "additional_research",
    additional_research: "additional_research",
    追加調査: "additional_research",
    stop: "stop",
    no: "stop",
    n: "stop",
    中止: "stop"
  };
  return aliases[text] || "";
}

function decisionFromWorkbook(runDir) {
  const values = readApprovalSheet(runDir);
  const decision = normalizeDecision(values.decision);
  if (!decision) return null;
  return {
    decision,
    selected_story: values.selected_story || "",
    slide_generation: values.slide_generation || "",
    merge_policy: values.merge_policy || "",
    additional_research_request: values.additional_research_request || "",
    review_comment: values.review_comment || "",
    source: "excel"
  };
}

function writeDecisionFollowup(runDir, decision) {
  const base = {
    decision: decision.decision,
    selected_story: decision.selected_story,
    created_at: new Date().toISOString(),
    source: decision.source
  };
  if (decision.decision === "additional_research") {
    const filePath = path.join(runDir, "additional_research_tasks.json");
    writeJson(filePath, {
      ...base,
      request: decision.additional_research_request || decision.review_comment || "追加調査要望が未記入です",
      next_action: "Web調査条件を追加し、analysisフェーズを再実行または追加調査フェーズを実装する"
    });
    return filePath;
  }
  if (decision.decision === "merge_options") {
    const filePath = path.join(runDir, "merge_options_request.json");
    writeJson(filePath, {
      ...base,
      merge_policy: decision.merge_policy || decision.review_comment || "統合方針が未記入です",
      next_action: "採用案統合ロジックでストーリー・スライドJSONを再生成する"
    });
    return filePath;
  }
  if (decision.decision === "revise_story") {
    const filePath = path.join(runDir, "story_revision_request.json");
    writeJson(filePath, {
      ...base,
      review_comment: decision.review_comment || "修正内容が未記入です",
      next_action: "ストーリー案・評価・推奨案を再生成する"
    });
    return filePath;
  }
  return "";
}

async function collectApprovalDecision(rl, runDir) {
  const approvalRequestPath = path.join(runDir, "approval_request.json");
  let approvalRequest = {};
  if (fs.existsSync(approvalRequestPath)) {
    approvalRequest = readJson(approvalRequestPath);
    console.log("Approval request:");
    console.log(`- Theme: ${approvalRequest.input_theme}`);
    console.log(`- Recommended: ${approvalRequest.recommended_story?.story_title || ""}`);
    const gate = approvalRequest.web_research_gate;
    if (gate) {
      console.log(`- Web evidence: ${gate.confirmed_source_count}/${gate.required_confirmed_sources} confirmed, ${gate.missing_evidence_count} missing`);
    }
  }

  const researchGate = approvalRequest.web_research_gate;
  const researchIncomplete = researchGate
    && Number(researchGate.required_confirmed_sources || 0) > 0
    && Number(researchGate.confirmed_source_count || 0) < Number(researchGate.required_confirmed_sources || 0);

  const workbookDecision = decisionFromWorkbook(runDir);
  if (workbookDecision) {
    console.log(`Excel decision found: ${workbookDecision.decision}`);
    if (workbookDecision.decision === "approve" && researchIncomplete && !options.allowIncompleteResearch) {
      throw new Error("Excel says approve, but Web research is incomplete. Choose additional_research in Excel or rerun with network access.");
    }
    if (workbookDecision.decision === "approve" && String(workbookDecision.slide_generation || "").toLowerCase() === "no") {
      workbookDecision.decision = "stop";
      workbookDecision.review_comment = workbookDecision.review_comment || "Excel slide_generation is no.";
    }
    return writeApprovalDecision(runDir, workbookDecision.decision, workbookDecision);
  }

  if (options.assumeYes) {
    if (researchIncomplete && !options.allowIncompleteResearch) {
      throw new Error("Web research is incomplete. Review the Excel research sheets or rerun with network access before approving slides.");
    }
    return writeApprovalDecision(runDir, "approve", { note: "Approved via --yes.", source: "cli" });
  }

  console.log("\nChoose the review decision:");
  console.log("1. approve - Excel内容を承認し、PowerPointを生成する");
  console.log("2. revise_story - 別案・修正が必要なので止める");
  console.log("3. merge_options - 複数案を統合したいので止める");
  console.log("4. additional_research - 追加調査が必要なので止める");
  console.log("5. stop - 中止する");

  const decisions = ["approve", "revise_story", "merge_options", "additional_research", "stop"];
  while (true) {
    const answer = (await rl.question("\nDecision [1-5]: ")).trim() || "5";
    const numeric = Number(answer);
    const decision = Number.isInteger(numeric) ? decisions[numeric - 1] : decisions.find((item) => item === answer);
    if (decision) {
      if (decision === "approve" && researchIncomplete && !options.allowIncompleteResearch) {
        console.log("Cannot approve yet: required Web evidence is incomplete.");
        console.log("Choose additional_research, or rerun analysis with network access.");
        continue;
      }
      const note = decision === "approve" ? "" : await rl.question("Note for this decision:\n> ");
      return writeApprovalDecision(runDir, decision, { note: note.trim(), source: "cli" });
    }
    console.log("Please enter 1-5 or a decision id.");
  }
}

async function runAnalysisAndStop(template) {
  const phasesPath = path.join(template.templateRoot, template.phases || "phases.json");
  const phaseSet = fs.existsSync(phasesPath) ? readJson(phasesPath) : { phases: [] };
  const analysisPhase = phaseSet.phases.find((phase) => phase.id === "analysis");
  if (!analysisPhase) throw new Error(`Template has no analysis phase: ${template.id}`);

  console.log(`\nPhase: ${analysisPhase.name}`);
  console.log(analysisPhase.description);
  const mapped = commandForPhase(template, analysisPhase, {});
  const result = runCommand(mapped.command, mapped.args);
  const runDir = options.dryRun
    ? path.join(root, template.output_dir || path.join("outputs", template.id), "YYYYMMDD_HHMMSS")
    : extractRunDir(result.stdout || "");
  if (!runDir) throw new Error("Analysis finished but the run folder was not reported.");
  printReviewGate(runDir);
  return runDir;
}

async function continueFromRunDir(rl, template, runDirArg) {
  if (!runDirArg) throw new Error("Missing --run-dir for continue mode.");
  const runDir = path.resolve(root, runDirArg);
  const manifestPath = path.join(runDir, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Run folder is missing run_manifest.json: ${runDir}`);
  }

  console.log(`Continuing reviewed run: ${runDir}`);
  console.log("Review files:");
  console.log(`- ${path.join(runDir, "proposal_story_analysis.xlsx")}`);
  console.log(`- ${path.join(runDir, "selected_story_review.md")}`);

  const decision = await collectApprovalDecision(rl, runDir);
  if (decision.decision !== "approve") {
    const followup = writeDecisionFollowup(runDir, decision);
    console.log(`Stopped. Decision recorded as ${decision.decision}.`);
    if (followup) console.log(`Follow-up task: ${followup}`);
    return;
  }

  const phasesPath = path.join(template.templateRoot, template.phases || "phases.json");
  const phaseSet = fs.existsSync(phasesPath) ? readJson(phasesPath) : { phases: [] };
  const slidesPhase = phaseSet.phases.find((phase) => phase.id === "slides");
  if (!slidesPhase) throw new Error(`Template has no slides phase: ${template.id}`);

  console.log(`\nPhase: ${slidesPhase.name}`);
  console.log(slidesPhase.description);
  const mapped = commandForPhase(template, slidesPhase, { analysisRunDir: runDir });
  runCommand(mapped.command, mapped.args);
}

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const templates = loadTemplates();
  if (templates.length === 0) {
    throw new Error("No templates found under templates/.");
  }

  if (options.listOnly) {
    console.log(JSON.stringify({ templates: templates.map(({ templateRoot, manifestPath, ...template }) => template) }, null, 2));
    return;
  }

  console.log("Codex EastBoard Template Runner");
  console.log("This runner reads templates/* definitions, asks for required inputs, and executes the configured phases.");

  const rl = createInterface({ input, output });
  try {
    if (options.continueMode) {
      const template = templates.find((item) => item.id === (options.templateId || "proposal-story"));
      if (!template) throw new Error(`Unknown template: ${options.templateId || "proposal-story"}`);
      await continueFromRunDir(rl, template, options.runDir);
      return;
    }

    const template = await chooseTemplate(rl, templates);
    console.log(`\nSelected: ${template.id} - ${template.name}`);

    const { inputPath, nextInput } = await collectAnswers(rl, template);
    if (options.dryRun) {
      console.log(`[dry-run] Would write ${path.relative(root, inputPath)}`);
    } else {
      writeJson(inputPath, nextInput);
      console.log(`Updated input: ${path.relative(root, inputPath)}`);
    }

    await runAnalysisAndStop(template);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
