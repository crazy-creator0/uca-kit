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
    "- Page /cart (source: src/App.tsx:2)",
    "- Page /checkout (source: src/App.tsx:2)",
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
    "- API GET /health (source: src/server.js:3)",
    "- API POST /login (source: src/server.js:4)",
    "- API GET /orders/:id (source: src/server.js:6)",
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
    "- API GET/POST /api/orders (source: app/api/orders/route.ts)",
    "- API any /api/legacy (source: pages/api/legacy.ts)",
    "- Page / (source: app/page.tsx)",
    "- Page /dashboard (source: app/dashboard/page.tsx)",
    "- Page /login (source: app/(auth)/login/page.tsx)",
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
    "- API GET/POST /items (Flask-style decorator) (source: app.py:4)",
    "- API GET /health (Flask-style decorator) (source: app.py:8)",
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
  assert.match(after, /- API PUT \/extra \(source: src\/extra\.js:2\)/);
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
