"use strict";

// backend-api must serve any backend stack. Its text and the catalog once said "Python only", which told a model
// on a Node, Go or Java API to skip the skill the router had picked.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const skill = read(".agents/skills/backend-api/SKILL.md");
const catalogRow = read(".agents/catalog/skill-catalog.md").split("\n").find((line) => line.includes("**backend-api**"));

test("the skill and its catalog row do not limit it to one language", () => {
  const description = skill.match(/^description: (.*)$/m)[1];
  assert.doesNotMatch(description, /\bPython APIs?\b/);
  assert.match(description, /any backend stack/);
  assert.doesNotMatch(catalogRow, /Python/);
  assert.doesNotMatch(read(".agents/catalog/skill-catalog.md"), /backend-api \(Python\)/);
});

test("the skill tells the model to find the stack from its manifest and names several ecosystems", () => {
  for (const manifest of ["package.json", "pyproject.toml", "go.mod", "pom.xml"]) assert.ok(skill.includes(manifest), manifest);
  for (const framework of ["Express", "FastAPI", "Spring Boot", "ASP.NET Core"]) assert.ok(skill.includes(framework), framework);
});

test("an API task routes to backend-api in Node, Python and Go projects alike", () => {
  const projects = {
    node: ["package.json", '{"dependencies":{"express":"^5.0.0"}}'],
    python: ["requirements.txt", "fastapi\n"],
    go: ["go.mod", "module example.com/svc\n"]
  };
  for (const [stack, [file, content]] of Object.entries(projects)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `uca-api-${stack}-`));
    try {
      fs.writeFileSync(path.join(dir, file), content);
      const out = spawnSync(process.execPath, [path.join(root, "scripts", "uca-route.cjs"), "Add rate limiting to the orders endpoint", "--root", dir, "--json"], { encoding: "utf8" });
      assert.equal(out.status, 0, out.stderr);
      assert.equal(JSON.parse(out.stdout).primary.name, "backend-api", stack);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
