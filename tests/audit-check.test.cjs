"use strict";

// The audit check on small projects written here (not the benchmark apps), then once on the benchmark.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-audit-check.cjs");
const { audit } = require(SCRIPT);
const { score } = require(path.join(__dirname, "..", "benchmarks", "audit-planted", "score.cjs"));

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-audit-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}
const kinds = (root) => audit(root).findings.map((finding) => `${finding.kind} ${finding.file}:${finding.line}`);

test("secret fallbacks: a secret-named setting with a literal fallback is found, other fallbacks are not", () => {
  const root = project({
    "src/config.ts": "export const jwt = process.env.SESSION_SECRET ?? 'abc12345';\nexport const port = process.env.PORT || '3000';\nexport const key = process.env['STRIPE_API_KEY'] || \"\";\n",
    "app/settings.py": "import os\nTOKEN = os.getenv('GITHUB_TOKEN', 'ghp-demo-value')\nHOST = os.getenv('HOST', '0.0.0.0')\nALGORITHM = \"HS256\"\nSECRET_KEY: str = \"change-me-please\"\n"
  });
  assert.deepEqual(kinds(root), ["hardcoded-secret app/settings.py:2", "hardcoded-secret src/config.ts:1", "hardcoded-secret app/settings.py:5"]);
});

test("no finding prints a secret's value", () => {
  const root = project({ "src/auth.js": "const s = process.env.JWT_SECRET || 'Zq9-very-private-Value';\n" });
  const out = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8" });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /JWT_SECRET falls back to a value written in the code/);
  assert.doesNotMatch(out.stdout + JSON.stringify(audit(root)), /Zq9-very-private-Value/);
});

test("SQL injection: template strings, f-strings, % and + are found; parameters are not", () => {
  const root = project({
    "src/repo.js": "db.query(`SELECT * FROM t WHERE a = '${x}' LIMIT 5`);\ndb.query(`SELECT * FROM t WHERE a = $1 LIMIT 5`, [x]);\npool.query('DELETE FROM t WHERE id = ' + id);\nconsole.log(`select ${x}`);\n",
    "app/repo.py": "cur.execute(f\"UPDATE t SET a = {a}\")\ncur.execute(\"SELECT * FROM t WHERE a = %s LIMIT 5\", (a,))\ncur.execute(\"SELECT * FROM t WHERE a = '%s'\" % a)\nlog(f\"select {a}\")\n"
  });
  assert.deepEqual(kinds(root), ["sql-injection app/repo.py:1", "sql-injection app/repo.py:3", "sql-injection src/repo.js:1", "sql-injection src/repo.js:3"]);
});

test("query in a loop: only a database call inside the loop body that uses the loop item", () => {
  const root = project({
    "src/a.js": [
      "for (const id of ids) {",
      "  const row = await db.query('SELECT * FROM t WHERE id = $1', [id]);",
      "}",
      "const all = await db.query('SELECT * FROM t WHERE id = ANY($1)', [ids]);",
      "for (const id of ids) labels.push(id);",
      "const names = rows.map((row) => row.name);",
      "const total = await prisma.order.count({ where: { userId } });",
      "await Promise.all(users.map((user) => prisma.post.findMany({ where: { authorId: user.id }, take: 5 })));",
      "for (const id of ids) {",
      "  await cache.set('x', 1);",
      "  const same = await db.query('SELECT 1 LIMIT 1');",
      "}"
    ].join("\n"),
    "app/b.py": "for user in users:\n    notes = session.exec(select(Note).where(Note.owner_id == user.id)).all()\nfor note in notes:\n    titles.append(note.title)\nrows = session.exec(select(Note).where(Note.owner_id.in_(ids)).limit(10)).all()\n"
  });
  assert.deepEqual(kinds(root), ["query-in-loop app/b.py:2", "query-in-loop src/a.js:2", "query-in-loop src/a.js:8"]);
});

test("missing auth: only write routes without middleware, only when other routes in the file have it, never sign-in style paths", () => {
  const guarded = project({
    "routes.js": "router.get('/items', auth.required, list);\nrouter.post('/items', async (req, res) => {});\nrouter.delete('/items/:id', requireAdmin, remove);\nrouter.post('/login', async (req, res) => {});\nrouter.put('/items/:id', (req, res) => {});\n"
  });
  assert.deepEqual(kinds(guarded).filter((line) => line.startsWith("missing-auth")), ["missing-auth routes.js:2", "missing-auth routes.js:5"]);
  const open = project({ "routes.js": "router.post('/items', async (req, res) => {});\n" });
  assert.deepEqual(kinds(open), []);
});

test("unbounded reads: no WHERE and no LIMIT, findMany without where or take, select().all()", () => {
  const root = project({
    "src/a.js": "db.query('SELECT * FROM orders');\ndb.query('SELECT * FROM orders LIMIT 10');\ndb.query('SELECT count(*) FROM orders');\nprisma.user.findMany();\nprisma.user.findMany({ take: 20 });\n",
    "app/b.py": "session.exec(select(Note)).all()\nsession.exec(select(Note).limit(5)).all()\n"
  });
  assert.deepEqual(kinds(root), ["unbounded-read app/b.py:1", "unbounded-read src/a.js:1", "unbounded-read src/a.js:4"]);
});

test("error leaks, debug mode and wildcard CORS with credentials", () => {
  const root = project({
    "src/app.js": "app.use((err, req, res, next) => {\n  res.status(500).json({ message: err.message, stack: err.stack });\n});\napp.use(cors({ origin: '*', credentials: true }));\napp.use(cors({ origin: 'https://shop.example', credentials: true }));\nconsole.error(err.stack);\n",
    "app/main.py": "app = FastAPI(debug=True)\nok = FastAPI()\napp.add_middleware(CORSMiddleware, allow_origins=[\"*\"], allow_credentials=False)\n"
  });
  assert.deepEqual(kinds(root), ["debug-mode app/main.py:1", "error-detail-leak src/app.js:2", "cors-credentials-wildcard src/app.js:4"]);
});

test("rate limits: a login route is flagged only when no rate-limiting package is declared", () => {
  const files = { "src/r.js": "router.post('/auth/login', async (req, res) => {});\n" };
  assert.deepEqual(kinds(project({ ...files, "package.json": JSON.stringify({ dependencies: { express: "4" } }) })), ["no-rate-limit src/r.js:1"]);
  assert.deepEqual(kinds(project({ ...files, "package.json": JSON.stringify({ dependencies: { express: "4", "express-rate-limit": "7" } }) })), []);
});

test("missing index: a model column compared with == elsewhere, unless indexed, unique or a primary key", () => {
  const root = project({
    "app/models.py": "class User(SQLModel, table=True):\n    id: int | None = Field(default=None, primary_key=True)\n    email: str\n    slug: str = Field(index=True)\n    name: str\n",
    "app/q.py": "select(User).where(User.email == e)\nselect(User).where(User.slug == s)\nselect(User).where(User.id == i)\n"
  });
  assert.deepEqual(kinds(root), ["missing-index app/models.py:3"]);
});

test("tests, examples, benchmarks, comments and .env files are not audited", () => {
  const root = project({
    "tests/a.test.js": "db.query(`SELECT * FROM t WHERE a = '${x}'`);\n",
    "examples/demo.js": "db.query(`SELECT * FROM t WHERE a = '${x}'`);\n",
    "benchmarks/b.js": "db.query(`SELECT * FROM t WHERE a = '${x}'`);\n",
    "src/x.js": "// db.query(`SELECT * FROM t WHERE a = '${x}'`);\n",
    ".env": "JWT_SECRET=abc\n"
  });
  assert.deepEqual(kinds(root), []);
});

test("on the audit benchmark: 13 of 13 found, no false alarms (the benchmark was written first)", () => {
  const result = audit(path.join(__dirname, "..", "benchmarks", "audit-planted"));
  const scored = score(result.findings.map(({ kind, file, line }) => ({ kind, file, line })));
  assert.equal(scored.found, 13, `missed ${scored.missed.join(", ")}`);
  assert.equal(scored.falseAlarms.length, 0, JSON.stringify(scored.falseAlarms));
});

test("usage errors exit 2", () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--nope"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, path.join(os.tmpdir(), "no-such-folder-uca")], { encoding: "utf8" }).status, 2);
});
