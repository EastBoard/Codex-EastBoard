import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templatesDir = path.join(root, "templates");

const templates = fs.readdirSync(templatesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const templatePath = path.join(templatesDir, entry.name, "template.json");
    if (!fs.existsSync(templatePath)) return null;
    const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      questions: template.questions,
      phases: template.phases
    };
  })
  .filter(Boolean);

console.log(JSON.stringify({ templates }, null, 2));
