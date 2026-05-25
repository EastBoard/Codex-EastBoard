import { spawnSync } from "node:child_process";

const templateId = process.argv[2] || "proposal-story";

const runners = {
  "proposal-story": "src/run-proposal-story.js"
};

if (!runners[templateId]) {
  console.error(`Unknown template: ${templateId}`);
  console.error(`Available templates: ${Object.keys(runners).join(", ")}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [runners[templateId], ...process.argv.slice(3)], {
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
