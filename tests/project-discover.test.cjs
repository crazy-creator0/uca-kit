"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "uca-project-discover.cjs");
const CHECKER = path.join(__dirname, "..", "scripts", "uca-project-check.cjs");
const { createReader, parseArgs } = require(SCRIPT);
const gitAvailable = spawnSync("git", ["--version"]).status === 0;

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uca-discover-"));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function discover(root, args = []) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8", timeout: 60_000 });
}

function card(root, args = []) {
  const result = discover(root, args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const FRONTEND = () =>
  repo({
    "package.json": JSON.stringify({
      name: "shop-ui",
      engines: { node: ">=20" },
      scripts: { dev: "vite", build: "vite build", test: "vitest run", lint: "eslint .", postinstall: "echo hi" },
      dependencies: { react: "^18.2.0", "react-dom": "^18.2.0", "react-router-dom": "^6.22.0", zustand: "^4.5.0" },
      devDependencies: { vite: "^5.1.0", vitest: "^1.3.0", typescript: "^5.3.0", tailwindcss: "^3.4.0" }
    }),
    "pnpm-lock.yaml": "lockfileVersion: 9\n",
    "tsconfig.json": '{ "compilerOptions": { "strict": true } }',
    ".editorconfig": "root = true\n[*]\nindent_style = space\nindent_size = 2\n",
    ".eslintrc.json": "{}",
    "index.html": "<div id=root></div>",
    "src/main.tsx": "import './App';\n",
    "src/App.tsx": 'import { Route } from "react-router-dom";\nexport default () => (<><Route path="/cart" element={null} /><Route path="/checkout" element={null} /></>);\n',
    "src/components/Button.tsx": "export const Button = () => null;\n",
    "src/store/cart.ts": "// FIXME: persist the cart\nexport {};\n"
  });

const BACKEND = () =>
  repo({
    "package.json": JSON.stringify({
      name: "orders-api",
      main: "src/server.js",
      engines: { node: ">=20" },
      scripts: { start: "node src/server.js", test: "node --test", lint: "eslint ." },
      dependencies: { express: "^4.19.2", "better-sqlite3": "^9.4.0", jsonwebtoken: "^9.0.2", bcryptjs: "^2.4.3" }
    }),
    "package-lock.json": "{}",
    "src/server.js":
      'const express = require("express");\nconst app = express();\napp.get("/health", (q, r) => r.json({}));\napp.post("/login", require("./routes/auth"));\nconst router = express.Router();\nrouter.get("/orders/:id", (q, r) => r.json({}));\n',
    "src/routes/auth.js": "module.exports = (q, r) => r.end();\n",
    "migrations/001-init.sql": "CREATE TABLE orders (id INTEGER);\n",
    ".env": "JWT_SECRET=hunter2-very-secret\n",
    ".env.example": "JWT_SECRET=\nAPI_KEY=sk-live-should-never-appear\n"
  });

const FULLSTACK = () =>
  repo({
    "package.json": JSON.stringify({
      name: "portal",
      scripts: { dev: "next dev", build: "next build", test: "jest", "db:migrate": "prisma migrate dev" },
      dependencies: { next: "14.1.0", react: "^18.2.0", "next-auth": "^4.24.0", "@prisma/client": "^5.9.0", stripe: "^14.0.0" },
      devDependencies: { prisma: "^5.9.0", typescript: "^5.3.0", jest: "^29.7.0" }
    }),
    "yarn.lock": "# yarn\n",
    "tsconfig.json": '{ "compilerOptions": { "strict": false } }',
    "prisma/schema.prisma":
      'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\nmodel User {\n  id Int @id\n}\nmodel Order {\n  id Int @id\n}\n',
    "prisma/migrations/001_init/migration.sql": "-- init\n",
    "app/layout.tsx": "export default function L() { return null; }\n",
    "app/page.tsx": "export default function P() { return null; }\n",
    "app/dashboard/page.tsx": "export default function D() { return null; }\n",
    "app/(auth)/login/page.tsx": "export default function Login() { return null; }\n",
    "app/api/orders/route.ts": "export async function GET() {}\nexport async function POST() {}\n",
    "pages/api/legacy.ts": "export default function h() {}\n",
    "lib/auth.ts": "export {};\n",
    ".env.local": "NEXTAUTH_SECRET=do-not-print-this\n"
  });

const FLASK = () =>
  repo({
    "requirements.txt": "flask==3.0.0\nsqlalchemy>=2.0\npyjwt\npytest\n",
    "pyproject.toml": '[project]\nrequires-python = ">=3.11"\n',
    "pytest.ini": "[pytest]\n",
    "alembic.ini": "[alembic]\n",
    "app.py": 'from flask import Flask\napp = Flask(__name__)\n\n@app.route("/items", methods=["GET", "POST"])\ndef items():\n    return {}\n\n@app.route("/health")\ndef health():\n    return {}\n',
    "tests/test_items.py": "def test_x():\n    pass\n"
  });

function lines(text) {
  return text.split("\n");
}

function sourcesIn(text) {
  return [...text.matchAll(/\(source: ((?:[^()]|\([^()]*\))+)\)/g)].map((match) => match[1].replace(/:\d+$/, ""));
}

test("frontend app: stack, entry points, routes, state and tooling are found with sources", () => {
  const out = card(FRONTEND());
  for (const expected of [
    "- Node.js engine: >=20 (source: package.json)",
    "- Package manager: pnpm (source: pnpm-lock.yaml)",
    "- React: declared ^18.2.0 (source: package.json)",
    "- Vite: declared ^5.1.0 (source: package.json)",
    "- React Router: declared ^6.22.0 (source: package.json)",
    "- file present: index.html (source: index.html)",
    "- file present: src/main.tsx (source: src/main.tsx)",
    "- Page in src/App.tsx: /cart, /checkout (source: src/App.tsx:2)",
    "- Source folder: src/components/ (source: src/components)",
    "- Dependency declared: Zustand (source: package.json)",
    "- Dependency declared: Tailwind CSS (source: package.json)",
    "- Dependency declared: Vitest (source: package.json)",
    "- TypeScript strict mode is on (source: tsconfig.json)",
    "- Indent: space 2 (source: .editorconfig)"
  ]) {
    assert.ok(out.includes(expected), `missing: ${expected}`);
  }
  assert.match(out, /`pnpm run dev` runs `vite`/);
  assert.match(out, /`pnpm run test` runs `vitest run`/);
  assert.match(out, /1 TODO\/FIXME\/HACK comment\(s\); first: src\/store\/cart\.ts:1/);
});

test("frontend app: nothing about APIs, databases or login is invented", () => {
  const out = card(FRONTEND());
  assert.ok(out.includes("- No routes were detected.") === false, "page routes exist");
  assert.ok(!/- API /.test(out));
  assert.match(out, /- No database dependency or schema was detected\./);
  assert.match(out, /- No authentication dependency or file name was detected\./);
  assert.doesNotMatch(out, /Prisma|Express|jsonwebtoken|NextAuth/);
});

test("backend API: routes, database, auth dependencies and env names are found", () => {
  const out = card(BACKEND());
  for (const expected of [
    "- package main: src/server.js (source: package.json)",
    "- Express: declared ^4.19.2 (source: package.json)",
    "- API in src/server.js: GET /health, POST /login, GET /orders/:id (source: src/server.js:3)",
    "- Dependency declared: SQLite driver (better-sqlite3) (source: package.json)",
    "- Migration folder: migrations/ (source: migrations)",
    "- Dependency declared: jsonwebtoken (source: package.json)",
    "- Dependency declared: bcryptjs (source: package.json)",
    "- File name suggests authentication code: src/routes/auth.js (source: src/routes/auth.js)",
    "- Environment variables expected (names only): JWT_SECRET, API_KEY (source: .env.example)"
  ]) {
    assert.ok(out.includes(expected), `missing: ${expected}`);
  }
  assert.match(out, /How authentication works end to end/);
  assert.doesNotMatch(out, /React|Prisma|Next\.js|- Page /);
});

test("secrets are never read or printed", () => {
  const out = card(BACKEND());
  assert.doesNotMatch(out, /hunter2/);
  assert.doesNotMatch(out, /sk-live-should-never-appear/);
  assert.match(out, /- Avoid: \.env \(may hold secrets; never read or paste it\)/);
  const full = card(FULLSTACK());
  assert.doesNotMatch(full, /do-not-print-this/);
  assert.match(full, /- Avoid: \.env\.local/);
});

test("full-stack Next.js app: file routes, API routes, schema, auth and integrations", () => {
  const out = card(FULLSTACK());
  for (const expected of [
    "- Next.js: declared 14.1.0 (source: package.json)",
    "- Package manager: yarn (source: yarn.lock)",
    "- API in app/ (file routes): GET/POST /api/orders (source: app/api/orders/route.ts)",
    "- API in pages/ (file routes): any /api/legacy (source: pages/api/legacy.ts)",
    "- Page in app/ (file routes): /, /dashboard, /login (source: app/page.tsx)",
    "- Prisma schema, provider postgresql, models: User, Order (source: prisma/schema.prisma)",
    "- Dependency declared: NextAuth (source: package.json)",
    "- Dependency declared: Stripe (source: package.json)",
    "- File name suggests authentication code: lib/auth.ts (source: lib/auth.ts)"
  ]) {
    assert.ok(out.includes(expected), `missing: ${expected}`);
  }
  assert.match(out, /`yarn db:migrate` runs `prisma migrate dev`/);
  assert.doesNotMatch(out, /TypeScript strict mode is on/, "strict is false in this fixture");
});

test("Python backend: Flask routes with methods, SQLAlchemy, Alembic, pytest, Python version", () => {
  const out = card(FLASK());
  for (const expected of [
    "- Python: >=3.11 (source: pyproject.toml)",
    "- Flask (Python dependency) (source: requirements.txt)",
    "- API in app.py (Flask): GET/POST /items, GET /health (source: app.py:4)",
    "- Python dependency: SQLAlchemy (source: requirements.txt)",
    "- Alembic is configured (source: alembic.ini)",
    "- Python dependency: PyJWT (source: requirements.txt)",
    "- file present: app.py (source: app.py)"
  ]) {
    assert.ok(out.includes(expected), `missing: ${expected}`);
  }
  assert.match(out, /- `pytest` pytest is configured \(source: pytest\.ini\)/);
});

test("every cited source exists in the repository, for every fixture", () => {
  for (const make of [FRONTEND, BACKEND, FULLSTACK, FLASK]) {
    const root = make();
    for (const source of sourcesIn(card(root))) {
      assert.ok(fs.existsSync(path.join(root, source)), `cited file does not exist: ${source}`);
    }
  }
});

test("nothing is listed as working unless a command was run and exited 0", () => {
  const out = card(FRONTEND());
  const working = out.split("Run and seen to work:")[1].split("Declared in files")[0];
  assert.match(working, /None yet\. Nothing was run\./);
  assert.doesNotMatch(working, /`/);
  assert.match(out, /Checked by: uca-project-discover\.cjs read the files; no command was run/);
});

test("--verify records a passing command as working and a failing one as failed", () => {
  const out = card(FRONTEND(), ["--verify", "node -e 0", "--verify", 'node -e "process.exit(3)"']);
  const working = out.split("Run and seen to work:")[1].split("Run and failed:")[0];
  assert.match(working, /`node -e 0` \(exit 0 in \d+s; ran by uca-project-discover\.cjs\)/);
  assert.doesNotMatch(working, /process\.exit/);
  assert.match(out.split("Run and failed:")[1], /`node -e "process\.exit\(3\)"` \(exit 3\)/);
});

test("--verify-scripts runs the declared script and an unknown script is reported as failed", () => {
  const root = repo({ "package.json": JSON.stringify({ scripts: { test: "node -e 0" } }), "package-lock.json": "{}" });
  const out = card(root, ["--verify-scripts", "test,nope"]);
  assert.match(out.split("Run and seen to work:")[1].split("Run and failed:")[0], /`npm test` \(exit 0/);
  assert.match(out, /`script "nope"` \(no such script was found in a manifest\)/);
  assert.doesNotMatch(out.split("Declared in files, not run")[1], /npm test/, "a verified command is not also listed as unrun");
});

test("--write creates a card with generated blocks, and rewriting it is stable", () => {
  const root = FRONTEND();
  const target = path.join(root, "PROJECT.md");
  assert.equal(discover(root, ["--write", target]).status, 0);
  const first = fs.readFileSync(target, "utf8");
  assert.match(first, /<!-- uca:generated:stack -->/);
  assert.equal(discover(root, ["--write", target]).status, 0);
  assert.equal(fs.readFileSync(target, "utf8").replace(/- file present: PROJECT\.md.*\n/, ""), first.replace(/- file present: PROJECT\.md.*\n/, ""));
});

test("--write keeps text the developer wrote, before, between and after the blocks", () => {
  const root = BACKEND();
  const target = path.join(root, "PROJECT.md");
  assert.equal(discover(root, ["--write", target]).status, 0);
  let text = fs.readFileSync(target, "utf8");
  text = text.replace("# PROJECT.md", "# PROJECT.md\n\nOwner note: payments go through the legacy gateway until Q3.")
    .replace("<!-- uca:generated:data -->", "Hand-written: do not touch the orders table without asking Ravi.\n\n<!-- uca:generated:data -->")
    .replace("## Stack", "## Stack\n- STALE LINE THAT SHOULD BE REPLACED")
    + "\n## My own section\n- Release train is every second Tuesday.\n";
  fs.writeFileSync(target, text);
  fs.writeFileSync(path.join(root, "src", "extra.js"), 'const app = require("express")();\napp.put("/extra", () => {});\n');
  assert.equal(discover(root, ["--write", target]).status, 0);
  const after = fs.readFileSync(target, "utf8");
  for (const kept of ["Owner note: payments go through the legacy gateway until Q3.", "Hand-written: do not touch the orders table without asking Ravi.", "## My own section", "- Release train is every second Tuesday."]) {
    assert.ok(after.includes(kept), `lost: ${kept}`);
  }
  assert.ok(!after.includes("STALE LINE THAT SHOULD BE REPLACED"), "generated block was not refreshed");
  assert.match(after, /- API in src\/extra\.js: PUT \/extra \(source: src\/extra\.js:2\)/);
});

test("--section updates only the named blocks", () => {
  const root = BACKEND();
  const target = path.join(root, "PROJECT.md");
  assert.equal(discover(root, ["--write", target]).status, 0);
  const before = fs.readFileSync(target, "utf8");
  fs.writeFileSync(target, before.replace("## Routes", "## Routes\n- SENTINEL KEEP").replace("## Stack", "## Stack\n- SENTINEL REPLACE"));
  assert.equal(discover(root, ["--write", target, "--section", "stack"]).status, 0);
  const after = fs.readFileSync(target, "utf8");
  assert.ok(after.includes("SENTINEL KEEP"), "a block that was not requested was rewritten");
  assert.ok(!after.includes("SENTINEL REPLACE"), "the requested block was not refreshed");
});

test("a card with no generated blocks is appended to, never rewritten, and its Verified at line is kept", () => {
  const root = BACKEND();
  const target = path.join(root, "PROJECT.md");
  const original = "# Orders API\n\nVerified at: 2020-01-01\nChecked by: me\n\n## Stack\n- Hand-written stack note\n";
  fs.writeFileSync(target, original);
  assert.equal(discover(root, ["--write", target]).status, 0);
  const after = fs.readFileSync(target, "utf8");
  assert.ok(after.startsWith(original.replace(/\s*$/, "")), "existing text was changed");
  assert.equal((after.match(/^Verified at:/gm) || []).length, 1, "a second Verified at line was added");
  assert.match(after, /<!-- uca:generated:routes -->/);
});

test("a card verified at a commit is current until a cited file changes, then the checker flags it", { skip: !gitAvailable }, () => {
  const root = BACKEND();
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  const target = path.join(root, "PROJECT.md");
  assert.equal(discover(root, ["--write", target]).status, 0);
  assert.match(fs.readFileSync(target, "utf8"), /^Verified at: [0-9a-f]{12}$/m);
  const check = () => spawnSync(process.execPath, [CHECKER, target, "--root", root], { encoding: "utf8" });
  assert.equal(check().status, 0, check().stdout);
  fs.appendFileSync(path.join(root, "src", "server.js"), "// changed\n");
  const stale = check();
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /CHANGED: src\/server\.js/);
});

test("an empty repository gets an honest card, not invented facts", () => {
  const out = card(repo({ "notes.txt": "hello\n" }));
  assert.match(out, /No runtime or framework was detected/);
  assert.match(out, /None found\./);
  assert.match(out, /Run, test, lint and build commands: none were found/);
});

test("option parsing and errors", () => {
  assert.deepEqual(parseArgs(["--root", "x", "--verify", "a", "--verify", "b", "--verify-scripts", "test, lint"]).verify, ["a", "b"]);
  assert.deepEqual(parseArgs(["--verify-scripts", "test, lint"]).verifyScripts, ["test", "lint"]);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["--root"]), /needs a value/);
  assert.throws(() => parseArgs(["--section", "stack,bogus"]), /Unknown section: bogus/);
  assert.equal(discover(os.tmpdir(), ["--bogus"]).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--root", path.join(os.tmpdir(), "uca-no-such-dir")], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" }).status, 0);
});

test("the file reader refuses every .env variant except the example templates", () => {
  const root = repo({ ".env": "A=1", ".env.local": "A=2", ".env.production": "A=3", "config/.env": "A=4", ".env.example": "A=", ".env.sample": "A=", "src/env.js": "export {};" });
  const read = createReader(root);
  for (const name of [".env", ".env.local", ".env.production", "config/.env"]) assert.equal(read(name), null, `${name} was read`);
  for (const name of [".env.example", ".env.sample", "src/env.js"]) assert.notEqual(read(name), null, `${name} should be readable`);
});

// A library laid out like Express: no "main" field, an index.js that re-exports lib/,
// and many examples and tests that look like apps.
const LIBRARY = () =>
  repo({
    "package.json": JSON.stringify({ name: "webkit", scripts: { test: "mocha" }, dependencies: {} }),
    "index.js": "'use strict';\nmodule.exports = require('./lib/webkit');\n",
    "lib/webkit.js": "var proto = require('./application');\nvar req = require('./request');\nvar Router = require('router');\nexports.x = 1;\n",
    "lib/application.js": "var utils = require('./utils');\nmodule.exports = {};\n",
    "lib/request.js": "module.exports = {};\n",
    "lib/utils.js": "exports.y = 2;\n",
    "lib/unused.js": "exports.z = 3;\n",
    "examples/hello/index.js": "var app = require('../../')();\napp.get('/', function (q, r) { r.send('hi'); });\n",
    "examples/auth/index.js": "var app = require('../../')();\napp.get('/login', function (q, r) {});\napp.post('/login', function (q, r) {});\n",
    "test/app.js": "var app = require('..')();\napp.get('/user/:id', function () {});\n",
    "test/app.router.js": "app.get('/foo', function () {});\n"
  });

test("entry points: the package entry comes first, and example or test files are not listed as app entry points", () => {
  const out = card(LIBRARY());
  const block = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  const firstFact = lines(block).find((line) => line.startsWith("- "));
  assert.equal(firstFact, "- package default entry: index.js (no main field, so Node loads index.js) (source: package.json)");
  assert.doesNotMatch(block, /file present: examples\//);
  assert.doesNotMatch(block, /file present: test\//);
  assert.match(block, /- Not app entry points: 3 entry-like file\(s\) under example or test folders: examples\/, test\/ \(source: examples\)/);
});

test("routes: routes inside examples and tests are counted apart, not listed as the app's routes", () => {
  const out = card(LIBRARY());
  const block = out.split("<!-- uca:generated:routes -->")[1].split("<!-- /uca:generated -->")[0];
  assert.doesNotMatch(block, /- API /);
  assert.match(block, /- No app routes were detected\./);
  assert.match(block, /- Not app routes: 5 route definition\(s\) in example or test files \(examples\/: 3, test\/: 2\)/);
});

test("import map: follows relative imports from the entry file, breadth first, and names what it skipped", () => {
  const out = card(LIBRARY());
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  const facts = lines(block).filter((line) => line.startsWith("- "));
  assert.equal(facts[0], "- index.js (entry) imports: lib/webkit.js (source: index.js)");
  assert.equal(facts[1], "- lib/webkit.js (depth 1) imports: ./application.js, ./request.js (source: lib/webkit.js)");
  assert.ok(facts.includes("- lib/application.js (depth 2) imports: ./utils.js (source: lib/application.js)"));
  assert.ok(facts.includes("- Leaf files (import nothing local): lib/request.js, lib/utils.js"));
  assert.match(block, /- 1 source file\(s\) outside examples and tests are not reached from an entry, e\.g\. lib\/unused\.js/);
  assert.doesNotMatch(block, /examples\//, "examples are not walked");
  assert.doesNotMatch(block, /router/, "package imports are not files in this repo");
});

test("import map: TypeScript paths, index files, dynamic imports and Python relative imports resolve", () => {
  const out = card(repo({
    "package.json": JSON.stringify({ name: "ts-app", main: "dist/server.js", bin: { tool: "./src/cli.ts" } }),
    "src/cli.ts": "import { run } from './commands';\nconst lazy = () => import('./lazy.js');\nexport * from \"./types\";\n",
    "src/commands/index.ts": "export const run = 1;\n",
    "src/lazy.ts": "export {};\n",
    "src/types.ts": "export type A = 1;\n",
    "py/app.py": "from .models import User\nfrom . import views\n",
    "py/__init__.py": "",
    "py/models.py": "class User: pass\n",
    "py/views.py": "x = 1\n"
  }));
  const entry = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(entry, /- package main: dist\/server\.js \(file not in the repository; probably built\) \(source: package\.json\)/);
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- src\/cli\.ts \(entry\) imports: \.\/commands\/index\.ts, \.\/lazy\.ts, \.\/types\.ts \(source: src\/cli\.ts\)/);
  assert.match(block, /- py\/app\.py \(entry\) imports: \.\/models\.py, \.\/views\.py \(source: py\/app\.py\)/);
});

test("import map: the listing has a fixed size on a large repository", () => {
  const files = { "package.json": JSON.stringify({ name: "big", main: "index.js" }) };
  files["index.js"] = Array.from({ length: 120 }, (_, i) => `require('./m${i}');`).join("\n");
  for (let i = 0; i < 120; i += 1) files[`m${i}.js`] = "module.exports = 1;\n";
  const out = card(repo(files));
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  const facts = lines(block).filter((line) => line.startsWith("- "));
  assert.ok(facts.length <= 30, `map has ${facts.length} lines`);
  assert.match(facts[0], /^- index\.js \(entry\) imports: m0\.js, m1\.js, .* \(\+\d+ more\) \(source: index\.js\)$/);
  assert.match(block, /- Leaf files \(import nothing local\): m0\.js, .* \(\+105 more\)/);
});

test("routes: examples written inside comments are not reported as routes", () => {
  const out = card(repo({
    "package.json": JSON.stringify({ name: "lib", main: "lib/res.js" }),
    "lib/res.js": "/**\n * Example:\n *\n *     app.get('/user/:id/photo', fn)\n */\n// app.post('/old', fn)\napp.get('/real', fn);\n"
  }));
  assert.match(out, /- API in lib\/res\.js: GET \/real \(source: lib\/res\.js:7\)/);
  assert.doesNotMatch(out, /\/user\/:id\/photo|\/old/);
});

test("import map: built paths point to their source, nested Python packages resolve, styles are skipped, and reached files are not restarted", () => {
  const out = card(repo({
    "package.json": JSON.stringify({ name: "lib", exports: "./dist/source/index.js" }),
    "source/index.ts": "import './style.css';\nimport { core } from './core/index.js';\n",
    "source/style.css": "a{}\n",
    "source/core/index.ts": "export const core = 1;\n",
    "backend/app/main.py": "from app.api.main import api_router\nimport fastapi\n",
    "backend/app/api/main.py": "from app.api.routes import items\n",
    "backend/app/api/routes/items.py": "x = 1\n",
    "backend/app/api/routes/__init__.py": ""
  }));
  const entry = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(entry, /- package exports: dist\/source\/index\.js \(file not in the repository; probably built, source looks like source\/index\.ts\)/);
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- source\/index\.ts \(entry\) imports: \.\/core\/index\.ts \(source: source\/index\.ts\)/);
  assert.doesNotMatch(block, /style\.css/);
  assert.match(block, /- backend\/app\/main\.py \(entry\) imports: \.\/api\/main\.py/);
  assert.match(block, /- backend\/app\/api\/main\.py \(depth 1\) imports: \.\/routes\/__init__\.py, \.\/routes\/items\.py/);
  assert.doesNotMatch(block, /backend\/app\/api\/main\.py \(entry\)/, "a file reached from an entry is not a second start point");
});

test("import map: tsconfig path aliases are followed, and an entry-like file reached from the main entry is marked", () => {
  const out = card(repo({
    "web/package.json": JSON.stringify({ name: "web" }),
    "web/tsconfig.json": '{\n  // aliases\n  "compilerOptions": { /* bundler */ "paths": { "@/*": ["./src/*"] }, },\n}\n',
    "web/src/main.tsx": "import { Button } from '@/components/Button';\nimport App from './app';\n",
    "web/src/app.tsx": "export default 1;\n",
    "web/src/components/Button.tsx": "import { cn } from '@/lib/utils';\nexport const Button = 1;\n",
    "web/src/lib/utils.ts": "export const cn = 1;\n"
  }));
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- Path aliases followed: @\/\* -> \.\/src\/\* \(source: web\/tsconfig\.json\)/);
  assert.match(block, /- web\/src\/main\.tsx \(entry\) imports: \.\/components\/Button\.tsx, \.\/app\.tsx/);
  assert.match(block, /- web\/src\/components\/Button\.tsx \(depth 1\) imports: web\/src\/lib\/utils\.ts/);
  const entry = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(entry, /- file present: web\/src\/app\.tsx \(imported by web\/src\/main\.tsx; not a separate start\)/);
});

test("routes: a FastAPI decorator is reported once, not also as a plain router call", () => {
  const out = card(repo({ "app/main.py": "from fastapi import APIRouter\nrouter = APIRouter()\n@router.get(\"/items\")\ndef items(): pass\n" }));
  assert.equal((out.match(/\/items/g) || []).length, 1, out);
  assert.match(out, /- API in app\/main\.py \(FastAPI\): GET \/items \(source: app\/main\.py:3\)/);
});

test("import map: the map stays within a fixed character budget", () => {
  const files = { "package.json": JSON.stringify({ name: "wide", main: "index.js" }) };
  files["index.js"] = Array.from({ length: 60 }, (_, i) => `require('./very/long/folder/name/for/module${i}');`).join("\n");
  for (let i = 0; i < 60; i += 1) files[`very/long/folder/name/for/module${i}.js`] = `require('../../../../../shared/helpers/number${i}');\n`;
  for (let i = 0; i < 60; i += 1) files[`shared/helpers/number${i}.js`] = "module.exports = 1;\n";
  const out = card(repo(files));
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  const branchLines = lines(block).filter((line) => / imports: /.test(line));
  assert.ok(branchLines.join("\n").length <= 3100, `branch lines use ${branchLines.join("\n").length} chars`);
  assert.match(block, /- \.\.\. and \d+ more importing file\(s\) not listed/);
});

test("routes: FastAPI prefixes from APIRouter and include_router are joined into full paths", () => {
  const out = card(repo({
    "backend/app/main.py": "from fastapi import FastAPI\nfrom app.api.main import api_router\nfrom app.core.config import settings\napp = FastAPI()\napp.include_router(api_router, prefix=settings.API_V1_STR)\n",
    "backend/app/core/config.py": "class Settings:\n    API_V1_STR: str = \"/api/v1\"\nsettings = Settings()\n",
    "backend/app/api/main.py": "from fastapi import APIRouter\nfrom app.api.routes import items, users\napi_router = APIRouter()\napi_router.include_router(users.router)\napi_router.include_router(items.router, prefix=\"/items\")\n",
    "backend/app/api/routes/users.py": "from fastapi import APIRouter\nrouter = APIRouter(prefix=\"/users\", tags=[\"users\"])\n@router.get(\"/\")\ndef a(): pass\n@router.get(\"/me\")\ndef b(): pass\n@router.delete(\"/{user_id}\")\ndef c(): pass\n",
    "backend/app/api/routes/items.py": "from fastapi import APIRouter\nrouter = APIRouter()\n@router.get(\"/\")\ndef a(): pass\n@router.post(\"/{id}\")\ndef b(): pass\n",
    "backend/app/api/routes/__init__.py": ""
  }));
  assert.match(out, /- API in backend\/app\/api\/routes\/users\.py \(FastAPI\), under \/api\/v1\/users: GET \/, GET \/me, DELETE \/\{user_id\} \(source: backend\/app\/api\/routes\/users\.py:3\)/);
  assert.match(out, /- API in backend\/app\/api\/routes\/items\.py \(FastAPI\), under \/api\/v1\/items: GET \/, POST \/\{id\} \(source: backend\/app\/api\/routes\/items\.py:3\)/);
});

test("routes: a prefix that cannot be read from a literal is shown as unknown, not guessed", () => {
  const out = card(repo({
    "main.py": "from fastapi import FastAPI\nimport os\nfrom routes import router\napp = FastAPI()\napp.include_router(router, prefix=os.environ[\"BASE\"])\n",
    "routes.py": "from fastapi import APIRouter\nrouter = APIRouter()\n@router.get(\"/ping\")\ndef p(): pass\n"
  }));
  assert.match(out, /- API in routes\.py \(FastAPI\), under \{unread prefix\}: GET \/ping \(source: routes\.py:3\)/);
});

test("routes: the block stays within a character budget and long files are cut with a count", () => {
  const files = {};
  for (let f = 0; f < 30; f += 1) files[`src/routes/resource${f}.js`] = Array.from({ length: 20 }, (_, i) => `router.get("/resource${f}/item${i}/detail", h);`).join("\n");
  const out = card(repo(files));
  const block = out.split("<!-- uca:generated:routes -->")[1].split("<!-- /uca:generated -->")[0];
  const routeLines = lines(block).filter((line) => line.startsWith("- API"));
  assert.ok(routeLines.join("\n").length <= 3100, `routes use ${routeLines.join("\n").length} chars`);
  assert.match(routeLines[0], /\(\+\d+ more\)/);
  assert.match(block, /- \.\.\. and \d+ more route file\(s\) not listed/);
});

test("import map: Go packages are followed through the go.mod module path", () => {
  const out = card(repo({
    "go.mod": "module example.com/shop\n\ngo 1.22\n",
    "cmd/api/main.go": "package main\n\nimport (\n\t\"fmt\"\n\t\"example.com/shop/internal/http\"\n\tdb \"example.com/shop/internal/store\"\n)\n\nfunc main() { fmt.Println(http.X, db.Y) }\n",
    "internal/http/server.go": "package http\n\nimport \"example.com/shop/internal/store\"\n\nvar X = store.Y\n",
    "internal/http/server_test.go": "package http\n\nimport \"example.com/shop/internal/testkit\"\n",
    "internal/store/store.go": "package store\n\nvar Y = 1\n",
    "internal/testkit/kit.go": "package testkit\n",
    "tools/gen.go": "package tools\n"
  }));
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- cmd\/api\/ \(entry, Go package main\) imports: internal\/http\/, internal\/store\/ \(source: cmd\/api\/main\.go\)/);
  assert.match(block, /- internal\/http\/ \(depth 1\) imports: internal\/store\/ \(source: internal\/http\/server\.go\)/);
  assert.doesNotMatch(block, /imports: [^\n]*testkit/, "imports in _test.go files are not followed");
  assert.match(block, /not reached from an entry, e\.g\. .*tools\/gen\.go/);
  assert.doesNotMatch(out, /Go and Rust imports are not followed/);
});

test("import map: a Go library with no main package starts at its root package", () => {
  const out = card(repo({
    "go.mod": "module github.com/x/lib\n",
    "lib.go": "package lib\n\nimport \"github.com/x/lib/internal/bytesconv\"\n",
    "internal/bytesconv/b.go": "package bytesconv\n",
    "examples/basic/main.go": "package main\n\nimport \"github.com/x/lib\"\n"
  }));
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- \.\/ \(entry, Go root package\) imports: internal\/bytesconv\/ \(source: lib\.go\)/);
  assert.doesNotMatch(block, /examples/);
});

test("import map: Rust modules, crate paths, custom bin paths and workspace crates are followed", () => {
  const out = card(repo({
    "Cargo.toml": "[package]\nname = \"rg\"\n\n[[bin]]\nname = \"rg\"\npath = \"crates/core/main.rs\"\n\n[workspace]\nmembers = [\"crates/searcher\"]\n",
    "crates/core/main.rs": "mod flags;\n#[path = \"hay/stack.rs\"]\nmod haystack;\nuse grep_searcher::Searcher;\nfn main() {}\n",
    "crates/core/flags/mod.rs": "mod parse;\nuse crate::haystack::Thing;\n",
    "crates/core/flags/parse.rs": "pub fn p() {}\n",
    "crates/core/hay/stack.rs": "pub struct Thing;\n",
    "crates/searcher/Cargo.toml": "[package]\nname = \"grep-searcher\"\n",
    "crates/searcher/src/lib.rs": "mod sink;\npub mod searcher { }\n",
    "crates/searcher/src/sink.rs": "pub struct Sink;\n",
    "crates/searcher/tests/it.rs": "mod extra;\n",
    "build.rs": "fn main() {}\n"
  }));
  const entry = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(entry, /- Cargo bin rg: crates\/core\/main\.rs \(source: Cargo\.toml\)/);
  assert.match(entry, /- Cargo lib grep-searcher: crates\/searcher\/src\/lib\.rs \(source: crates\/searcher\/Cargo\.toml\)/);
  const block = out.split("<!-- uca:generated:map -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(block, /- crates\/core\/main\.rs \(entry\) imports: \.\/flags\/mod\.rs, \.\/hay\/stack\.rs, crates\/searcher\/src\/lib\.rs \(source: crates\/core\/main\.rs\)/);
  assert.match(block, /- crates\/core\/flags\/mod\.rs \(depth 1\) imports: \.\/parse\.rs, crates\/core\/hay\/stack\.rs/);
  assert.match(block, /- crates\/searcher\/src\/lib\.rs \(depth 1\) imports: \.\/sink\.rs/);
  assert.doesNotMatch(block, /tests\/it\.rs|build\.rs/);
});

test("fuzz harnesses and test_files folders are set apart like tests", () => {
  const out = card(repo({
    "Cargo.toml": "[package]\nname = \"tool\"\n",
    "src/main.rs": "fn main() {}\n",
    "fuzz/Cargo.toml": "[package]\nname = \"tool-fuzz\"\n\n[[bin]]\nname = \"fuzz_parse\"\npath = \"fuzz_targets/fuzz_parse.rs\"\n",
    "fuzz/fuzz_targets/fuzz_parse.rs": "fn main() {}\n",
    "extra/test_files/index.html": "<p>fixture</p>\n"
  }));
  const entry = out.split("<!-- uca:generated:entry-points -->")[1].split("<!-- /uca:generated -->")[0];
  assert.match(entry, /- Cargo bin tool: src\/main\.rs \(source: Cargo\.toml\)/);
  assert.doesNotMatch(entry, /fuzz_parse|- file present: extra\/test_files/);
});
