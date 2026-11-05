#!/usr/bin/env node
"use strict";

// A deterministic reference for .agents/router-rule.md.
//
// It follows the same steps: greetings load nothing, stack-specific skills are skipped when the project
// has no such layer, one primary skill is chosen by what the task is trying to do (not by a bare keyword),
// at most one companion is added when the task clearly crosses two areas, the choice comes with a one-line
// reason, the user's explicit choice wins unless it would break a safety rule, and a skill that is not
// installed is reported, not guessed.
//
// It is a rule-based suggestion for small models and for tests. It is not a measure of how any model routes.
// Exit codes: 0 done, 2 usage error.

const fs = require("node:fs");
const path = require("node:path");

const GUARDRAILS = ["anti-ai-slop", "anti-hallucination", "skill-gap-router"];
const ALL_SKILLS = [
  "anti-ai-slop", "anti-hallucination", "application-security", "backend-api", "cloudflare-operations", "database-engineering",
  "data-engineering-analytics", "debugging", "design-taste-discovery", "frontend-engineering", "frontend-visuals-and-3d", "import-hygiene",
  "language-engineering", "performance-engineering", "skill-gap-router", "testing-and-code-review"
];
const WORKFLOWS = ["new-project", "feature-development", "bug-investigation", "production-deployment", "stack-migration"];

// Each rule: pattern, weight. A pattern is evidence of intent, not a command to load.
// "Create a cafe management file", "make me a todo app": asking for something new. Scripts, APIs, services, pipelines and
// speed requests are excluded so they keep their own skills. A whole product starts the new-project workflow; a single
// page stays with the design skill.
const NEW_THING_PREFIX = String.raw`\b(?:create|build|make|develop|generate|code|need|want|set up)\b\s+(?:me\s+)?(?!(?:the|this|that|these|those|its|their|existing|current)\b)(?:(?:a|an|my|our|new|simple|basic|small|full|complete)\b\s*)?(?![^.?!]*\b(?:cli|command line|script|scripts|api|apis|library|package|sdk|etl|pipeline|cron|bot|plugin|extension|parser|compiler|service|server|function|endpoint|database|migration|test|tests|component|faster|quicker|slower|lighter|optimi[sz]ed)\b)[^.?!]{0,60}?\b`;
const PRODUCT_NOUNS = String.raw`(?:(?:web\s?)?app(?:lication)?|websites?|web\s?sites?|sites?|dashboard|portal|storefront|admin panel|tracker|pos|crm|erp|blog|tools?|managers?|games?|platform|software|marketplace|management (?:file|system|app|software|tool|page|dashboard|site|website|portal))\b`;
const PAGE_NOUNS = String.raw`(?:pages?|landing page)\b`;
const SOMETHING_TO = /\b(?:make|build|create|need|want)\b[^.?!]{0,30}\bsomething\s+to\s+(?:track|manage|keep track|handle|run|organi[sz]e|book|sell)\b/;
const NEW_PRODUCT = new RegExp(`${NEW_THING_PREFIX}${PRODUCT_NOUNS}`);

const RULES = {
  debugging: [
    [/\b(bug|bugs|crash(?:es|ed|ing)?|exception|stack ?trace|traceback|regression|segfault|deadlock|memory leak)\b/, 3],
    [/\b(fails?|failing|failed|broken|breaks|keeps? (?:failing|crashing|breaking)|not working|doesn'?t work|stopped working|stops working|wrong (?:results?|outputs?|totals?|values?)|returns? (?:the )?wrong|(?:returns?|gets?|throws?|shows?|gives?) (?:a |an )?(?:\d{3}|500|404|error))\b/, 3],
    [/\b(?:can'?t|cannot|unable to|won'?t|isn'?t|aren'?t|no longer)\s+(?:\w+\s+){0,2}(?:sign ?in|log ?in|load|loading|save|open|connect|start|run|submit|work\w*|finish)\b/, 3],
    [/\b(leaks?|leaking|timeouts?|timed out|hangs?|freezes?|so slow|too slow|very slow|slow)\b/, 3],
    [/\b(?:returns?|gets?|getting|throws?|shows?|gives?|responds? with)\s+(?:a\s+|an\s+)?(?:http\s+)?[45]\d\d\b/, 3],
    [/\b(error|errors)\b(?! handling)/, 2],
    [/\b(why (?:does|is|do|are) .*(?:slow|fail|crash|wrong|empty|null|undefined))\b/, 2]
  ],
  "performance-engineering": [
    [/\b(optimi[sz]\w*|latency|throughput|profil(?:e|es|ing)|benchmark\w*|p9[59]|bundle size|bundle is|load time|cold start|memory usage|cpu usage|performance)\b/, 4],
    [/\b(faster|speed up)\b/, 2]
  ],
  "data-engineering-analytics": [
    [/\b(csv|tsv|parquet|spreadsheet|etl|elt|data pipeline|data cleaning|clean the data|warehouse|data ?frame|pandas|events export|monthly active users|dau|mau|cohort\w*|aggregat\w+|metrics?)\b/, 4]
  ],
  "import-hygiene": [
    [/\b(circular (?:import|dependenc\w+)|import error|cannot find module|module not found|modulenotfound|barrel file|path alias|import cycle|unresolved import)\b/, 4],
    [/\b(?:move|moving|split|extract|reorgani[sz]e)\b.*\b(?:module|modules|files?|folders?)\b/, 2],
    [/\bimports?\b/, 1]
  ],
  "testing-and-code-review": [
    [/\b(write|add|create|improve|increase)\b.*\b(tests?|unit tests?|test coverage|coverage)\b/, 4],
    [/\b(review)\b.*\b(diff|pr|pull request|code|changes|patch)\b/, 4],
    [/\b(code review|test coverage|release check|release checklist|prepare (?:a|the) release|regression tests?)\b/, 3],
    [/\b(tests?|coverage)\b/, 1]
  ],
  "application-security": [
    [/\b(secrets?|credentials?|api keys?|passwords?|tokens?|xss|csrf|sql injection|injection|sanitiz\w+|vulnerabilit\w+|encrypt\w*|gdpr|privacy|pii|rbac|cors|csp|permissions?)\b/, 3],
    [/\b(auth|authentication|authorization|login|log in|logout|log out|sign ?in|sign ?up|session|sessions|jwt|oauth)\b/, 2]
  ],
  "backend-api": [
    [/\b(apis?(?! keys?)|endpoint|endpoints|rest api|restful|graphql|controller|controllers|middleware|webhook|webhooks|server routes?|route handlers?|business logic|request validation|rate limit\w*)\b/, 3],
    [/\b(express|fastify|flask|fastapi|django|nestjs|rails|spring)\b/, 2],
    [/\b(server|backend|back end|routes?)\b/, 1]
  ],
  "database-engineering": [
    [/\b(schema|schemas|migrations?|sql|queries|query|indexes|index|n\+1|transactions?|orm|prisma|sequelize|postgres|postgresql|mysql|sqlite|mongodb|tables?|columns?|foreign keys?)\b/, 3],
    [/\b(database|db)\b/, 2]
  ],
  "frontend-engineering": [
    [/\b(component|components|screen|screens|button|buttons|form|forms|modal|dropdown|navbar|react|vue|svelte|angular|css|tailwind|layout|responsive|accessib\w+|a11y|aria|hooks?|render\w*|dom|front ?end|page|pages|state management|redux|zustand)\b/, 3],
    [/\b(alt text|keyboard|screen reader|focus|animation|animations|animate|transitions?|gallery|carousel|tooltip|sidebar|banner|hero|dark mode|toggle|scroll\w*)\b/, 3],
    [/\b(ui|ux|interface|client side)\b/, 2]
  ],
  "design-taste-discovery": [
    [/\b(look and feel|look & feel|make it (?:look )?(?:beautiful|pretty|nicer|modern|polished)|beautiful|aesthetic|style guide|visual identity|brand\w*|theme|redesign|typography|color palette|colou?rs?|moodboard|design system|landing page design|polish the design)\b/, 4],
    [/\b(new ui|design a|designing a)\b/, 2],
    // Creating something new with a screen is a design job even when the text never says "design". "the dashboard" or
    // "my API" does not count: only creating something new does. Code-shaped things are excluded (see NEW_THING_PREFIX).
    [new RegExp(`${NEW_THING_PREFIX}(?:${PRODUCT_NOUNS}|${PAGE_NOUNS})`), 4],
    [SOMETHING_TO, 4]
  ],
  "frontend-visuals-and-3d": [
    [/\b(3d|three\.?js|webgl|webgpu|canvas|shaders?|particles?|glsl|r3f|babylon|parallax|wasm render)\b/, 4]
  ],
  "cloudflare-operations": [
    [/\b(cloudflare|wrangler|cloudflare workers?|workers? (?:kv|ai|script)|cloudflare pages|dns records?|tls cert\w*|cdn cache|cache rules|r2 bucket|d1 database|kv namespace|zero trust)\b/, 4]
  ],
  "language-engineering": [
    [/\b(rust|golang|go module|go (?:service|program|code)|java|kotlin|swift|c\+\+|c#|\.net|ruby|php|elixir|erlang|haskell|scala|dart|flutter|lua|zig|clojure|ocaml|perl|r language)\b/, 4]
  ]
};

// Frontend, backend, data and edge work are skipped when the project clearly has no such layer.
const LAYER_OF = {
  "frontend-engineering": "frontend",
  "design-taste-discovery": "frontend",
  "frontend-visuals-and-3d": "frontend",
  "backend-api": "backend",
  "database-engineering": "database",
  "cloudflare-operations": "cloudflare"
};
// Words that name a layer outright. A task that uses them is asking for that layer even if the project has none yet.
const STRONG_LAYER = {
  frontend: /\b(react|vue|svelte|angular|css|tailwind|components?|navbar|modal|dropdown|responsive|accessib\w+|a11y|aria|hooks?|three\.?js|webgl|canvas)\b/,
  backend: /\b(endpoints?|express|fastify|flask|fastapi|django|graphql|webhooks?|middleware)\b/,
  database: /\b(schema|migrations?|sql|prisma|postgres\w*|mysql|sqlite|mongodb|tables?|columns?)\b/,
  cloudflare: /\b(cloudflare|wrangler)\b/
};
const CREATES_LAYER = /\b(from scratch|new project|new app|start a new|bootstrap|scaffold|set ?up (?:a|the) (?:database|db|backend|front ?end)|add (?:a )?(?:database|db|backend|front ?end)|(?:create|build|make) (?:a|an|the) (?:\w+ ){0,2}(?:app|site|website|project|page|api|backend|front ?end|screen))\b/;

const PLAIN_QUESTION = /^(what is|what's|what are|explain|how does|how do|why does|why is|define|difference between|can you explain|tell me about)\b/;
const DIAGNOSIS = /\b(slow|fail\w*|crash\w*|broken|wrong|error|bug|leak\w*|not working|timeout\w*|hang\w*)\b/;
const HOUSEKEEPING = /\b(?:rename|remove|delete|clean ?up|bump)\b.*\b(?:dependenc\w+|packages?|files?|models?|variables?|functions?|classes|everywhere|unused|dead code)\b|\b(?:ci|ci\/cd|github actions|pipeline|prettier|eslint|linter?|dependabot|renovate)\b/;
const ACTION_WORDS = /\b(fix|add|change|build|write|implement|refactor|update|create|migrate|deploy|remove|rename|optimi[sz]e|improve|debug|set up|make|convert|replace|wire|connect|integrate)\b/;
const GREETING = /^(hi|hello|hey|yo|good (?:morning|afternoon|evening)|thanks|thank you|ok|okay|cool)\b[\s!.,?]*$/;
const TEXT_ONLY_EDIT = /\b(typo|typos|spelling|wording|rephrase|proofread|readme|changelog|docs?|documentation|comment|comments|docstring)\b/;

function detectLayers(root) {
  const layers = new Set();
  const manifest = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const seen = [];
  const collect = (dir) => {
    for (const entry of safeList(dir)) {
      if (entry.isFile() && entry.name === "package.json") seen.push(path.join(dir, entry.name));
    }
  };
  collect(root);
  for (const entry of safeList(root)) if (entry.isDirectory() && !["node_modules", ".git", "dist", "build"].includes(entry.name)) collect(path.join(root, entry.name));
  for (const file of seen) {
    const data = manifest(file) || {};
    const deps = { ...(data.devDependencies || {}), ...(data.dependencies || {}) };
    if (["react", "vue", "svelte", "@angular/core", "next", "nuxt", "astro", "@sveltejs/kit", "solid-js", "preact"].some((name) => deps[name])) layers.add("frontend");
    if (["express", "fastify", "koa", "hono", "@nestjs/core", "next"].some((name) => deps[name])) layers.add("backend");
    if (["prisma", "@prisma/client", "sequelize", "typeorm", "mongoose", "knex", "drizzle-orm", "pg", "mysql2", "sqlite3", "better-sqlite3", "mongodb"].some((name) => deps[name])) layers.add("database");
  }
  const rootNames = new Set(safeList(root).map((entry) => entry.name));
  if (rootNames.has("wrangler.toml") || rootNames.has("wrangler.json") || rootNames.has("wrangler.jsonc")) layers.add("cloudflare");
  if (["requirements.txt", "pyproject.toml", "Pipfile", "manage.py", "go.mod", "Cargo.toml", "pom.xml"].some((name) => rootNames.has(name))) layers.add("backend");
  if (rootNames.has("index.html")) layers.add("frontend");
  if (rootNames.has("prisma") || rootNames.has("migrations") || rootNames.has("alembic.ini")) layers.add("database");
  return layers;
}

function safeList(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listSkills(options) {
  if (options.skills) return new Set(options.skills);
  if (options.tier) {
    const tiers = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".agents", "tiers.json"), "utf8"));
    const tier = tiers[options.tier];
    if (!tier) throw new Error(`Unknown tier: ${options.tier}`);
    return new Set(tier.skills.includes("*") ? ALL_SKILLS : tier.skills);
  }
  if (options.profile) {
    const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".agents", "profiles", "profiles.json"), "utf8"));
    const profile = profiles[options.profile];
    if (!profile) throw new Error(`Unknown profile: ${options.profile}`);
    return new Set(profile.skills.includes("*") ? ALL_SKILLS : profile.skills);
  }
  return new Set(ALL_SKILLS);
}

function applyOverrides(text, available) {
  const forced = [];
  const skipped = [];
  const notes = [];
  for (const name of ALL_SKILLS) {
    const escaped = name.replace(/[-]/g, "[- ]?");
    // The skill name must follow the verb directly, so "skip A and use B" skips only A.
    if (new RegExp(`\\b(?:skip|don'?t use|do not use|without|ignore|no need for)\\s+(?:the\\s+)?${escaped}\\b`).test(text)) skipped.push(name);
    else if (new RegExp(`\\b(?:use|load|apply|using|open|with)\\s+(?:the\\s+)?${escaped}\\b`).test(text)) forced.push(name);
  }
  return { forced, skipped, notes, available };
}

function scoreSkills(text, layers, available, creates) {
  const scores = {};
  const why = {};
  for (const [skill, rules] of Object.entries(RULES)) {
    let total = 0;
    const hits = [];
    for (const [pattern, weight] of rules) {
      const match = pattern.exec(text);
      if (match) {
        total += weight;
        hits.push(match[0].trim());
      }
    }
    if (total === 0) continue;
    const layer = LAYER_OF[skill];
    if (layer && layers && !layers.has(layer) && !creates && !STRONG_LAYER[layer].test(text)) {
      scores[skill] = 0;
      why[skill] = [`no ${layer} layer found in the project`];
      continue;
    }
    scores[skill] = total;
    why[skill] = hits;
  }
  return { scores, why };
}

function route(task, options = {}) {
  const text = String(task).toLowerCase().trim();
  const available = listSkills(options);
  const layers = options.root ? detectLayers(path.resolve(options.root)) : options.layers ? new Set(options.layers) : null;
  const result = { task: String(task), primary: null, companion: null, always_on: GUARDRAILS.filter((name) => available.has(name) || ALL_SKILLS.includes(name)), reason: "", notes: [], loaded: [] };

  const finish = (primary, companion, reason) => {
    result.primary = primary;
    result.companion = companion;
    result.reason = reason;
    result.loaded = [primary, companion].filter((item) => item && item.kind !== "none" && item.name).map((item) => item.name);
    return result;
  };
  const none = (reason) => finish({ kind: "none" }, null, reason);

  // 1. Greeting or plain question: no skill.
  if (GREETING.test(text)) return none("A greeting needs no skill.");
  const { forced, skipped } = applyOverrides(text, available);
  if (PLAIN_QUESTION.test(text) && !ACTION_WORDS.test(text) && !DIAGNOSIS.test(text) && forced.length === 0) return none("A plain question needs no skill; answer it directly.");

  // Text-only edits to docs or comments are not engineering work in any layer.
  const creates = CREATES_LAYER.test(text);
  if (TEXT_ONLY_EDIT.test(text) && /\b(fix|correct|update|edit|rewrite|improve|proofread|reword|rephrase|change)\b/.test(text) && !/\b(bug|crash|failing|error|test|api|endpoint|schema|migration)\b/.test(text.replace(/\b(database|api|auth\w*) (docs?|documentation|readme)\b/g, "")) && forced.length === 0) {
    return none("This is an edit to documentation or comments, not work in a code layer.");
  }

  // 5 (override). A named skill wins, unless skipping it would break a safety rule.
  if (forced.length > 0) {
    const name = forced[0];
    if (!available.has(name)) {
      result.notes.push(`${name} is not installed; continue with the guardrails and do not guess its contents.`);
      return none(`You asked for ${name}, but it is not installed.`);
    }
    return finish({ kind: "skill", name }, null, `You asked for ${name}, so it is used.`);
  }

  // A whole new product is planned first (the new-project workflow) and gets the design skill beside it, so the plan
  // covers the domain, the stack choice and the look. In a project that already has code it is a feature, not a project.
  const existing = layers && layers.size > 0;
  if (!existing && (NEW_PRODUCT.test(text) || SOMETHING_TO.test(text))) {
    const design = available.has("design-taste-discovery") ? { kind: "skill", name: "design-taste-discovery" } : null;
    if (!design) result.notes.push("design-taste-discovery is not installed in this setup; plan the look yourself and do not guess its contents.");
    return finish({ kind: "workflow", name: "new-project" }, design, "A whole new product: plan it with the new-project workflow, and use the design skill for the domain, the brief and the look.");
  }

  // Workflows count as the primary item.
  const workflow = pickWorkflow(text);
  if (workflow) return finish({ kind: "workflow", name: workflow }, null, `The task matches the ${workflow} workflow.`);

  // 2-3. Real stack, then intent.
  const { scores, why } = scoreSkills(text, layers, available, creates);
  const safetyTouched = /\b(secrets?|credentials?|passwords?|tokens?|api keys?|permissions?|encrypt\w*|plain ?text)\b/.test(text);
  for (const name of skipped) {
    if (name === "application-security" && safetyTouched) {
      result.notes.push("You asked to skip application-security, but the task touches secrets or credentials. It stays, for safety.");
      result.keepForSafety = true;
      continue;
    }
    delete scores[name];
  }

  const ranked = Object.entries(scores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strong = ranked.filter(([, score]) => score >= 3);
  const domains = new Set(strong.map(([name]) => name));

  // Unclear or spans many areas: ask the gap router.
  if ((ranked.length === 0 || ranked[0][1] < 3) && HOUSEKEEPING.test(text)) {
    return none("A small housekeeping change; the guardrails are enough.");
  }
  if (ranked.length === 0 || ranked[0][1] < 2 || domains.size >= 3) {
    if (ACTION_WORDS.test(text) || ranked.length > 0) {
      const reason = ranked.length === 0 ? "No skill clearly matches; the gap router checks what is missing." : domains.size >= 3 ? "The task spans many areas; the gap router picks the smallest useful set." : "The match is weak; the gap router checks what is missing.";
      return finish({ kind: "skill", name: "skill-gap-router" }, null, reason);
    }
    return none("Nothing in the task calls for a skill.");
  }

  // Debugging wins over the thing being debugged: "the login test fails" is a bug.
  let [primaryName, primaryScore] = ranked[0];
  const debugging = scores.debugging || 0;
  if (debugging >= 3 && primaryName !== "debugging" && debugging >= primaryScore - 1 && /\b(fail\w*|broken|crash\w*|error|bug|wrong|not working|doesn'?t work|exception|leak\w*|can'?t|cannot|[45]\d\d|slow|timeout\w*)\b/.test(text)) {
    primaryName = "debugging";
    primaryScore = debugging;
  }
  // "Make it look better" is design; building the screen is front-end engineering.
  if (primaryName === "frontend-engineering" && (scores["design-taste-discovery"] || 0) >= 4) {
    primaryName = "design-taste-discovery";
    primaryScore = scores[primaryName];
  }

  if (!available.has(primaryName)) {
    const fallback = ranked.find(([name]) => available.has(name) && name !== primaryName && (scores[name] || 0) >= 3);
    result.notes.push(`${primaryName} is not installed in this setup; continue with the guardrails and do not guess its contents.`);
    if (!fallback) return none(`The task fits ${primaryName}, which is not installed.`);
    primaryName = fallback[0];
    primaryScore = fallback[1];
  }

  // 4. At most one companion, only when the task clearly crosses two areas.
  let companion = null;
  const others = ranked.filter(([name]) => name !== primaryName && available.has(name));
  const second = primaryName === "debugging" || primaryName === "performance-engineering" ? null : others.find(([name, score]) => score >= 3 && score >= primaryScore * 0.55 && distinctAreas(primaryName, name));
  if (second) companion = { kind: "skill", name: second[0] };

  const matched = (why[primaryName] || []).slice(0, 2).map((item) => `"${item}"`).join(", ");
  const reason = `Primary ${primaryName}: the task is about ${intentOf(primaryName)} (matched ${matched || "the task wording"}).` + (companion ? ` Companion ${companion.name}: the task also touches ${intentOf(companion.name)}.` : "");
  return finish({ kind: "skill", name: primaryName }, companion, reason);
}

function distinctAreas(a, b) {
  return a !== b && !(a === "design-taste-discovery" && b === "frontend-engineering") && !(a === "frontend-engineering" && b === "design-taste-discovery");
}

function intentOf(name) {
  return {
    debugging: "a bug or failure", "import-hygiene": "imports or module layout", "testing-and-code-review": "tests or review", "application-security": "secrets, login or permissions",
    "backend-api": "an API or server logic", "database-engineering": "data, schema or queries", "frontend-engineering": "screens or components", "design-taste-discovery": "look and feel",
    "frontend-visuals-and-3d": "3D or heavy visuals", "performance-engineering": "making something faster or lighter", "data-engineering-analytics": "data processing or analysis", "cloudflare-operations": "Cloudflare", "language-engineering": "a language without a dedicated skill"
  }[name] || name;
}

function pickWorkflow(text) {
  if (/\b(from scratch|new project|start a new (?:app|project)|bootstrap (?:a|the) (?:app|project)|scaffold (?:a|the) (?:app|project))\b/.test(text)) return "new-project";
  if (/\b(deploy|ship|release|go live|launch)\b.*\b(production|prod)\b|\b(production|prod)\b.*\b(deploy\w*|release|go live|launch)\b/.test(text)) return "production-deployment";
  if (/\b(migrate|port|convert|rewrite|upgrade)\b.*\b(from .+ to|to (?:typescript|javascript|python|go|rust|java|kotlin|react|vue|svelte|angular|next(?:\\.?js)?|nuxt|vite|fastapi|flask|django|express|fastify|nest(?:js)?|postgres\\w*|mysql|tailwind|esm|es modules?|a new framework)|major version|framework)\b/.test(text)) return "stack-migration";
  return null;
}

// ---------- evaluation ----------

function evaluate(cases, options = {}) {
  const rows = [];
  let primaryRight = 0;
  let companionRight = 0;
  let loaded = 0;
  let unnecessary = 0;
  let loadedBudget = 0;
  for (const item of cases) {
    const got = route(item.task, { ...options, ...(item.options || {}) });
    const gotPrimary = got.primary && got.primary.kind !== "none" ? got.primary.name : "none";
    const gotCompanion = got.companion ? got.companion.name : "none";
    const wantPrimary = item.primary || "none";
    const wantCompanion = item.companion || "none";
    // For a task that crosses two areas either order is acceptable, as long as the same two skills are chosen.
    const swapped = item.unordered && gotPrimary === wantCompanion && gotCompanion === wantPrimary;
    const okPrimary = gotPrimary === wantPrimary || swapped;
    const okCompanion = gotCompanion === wantCompanion || swapped;
    if (item.expectNote && got.notes.length === 0) {
      rows.push({ task: item.task, want: [wantPrimary, wantCompanion], got: [gotPrimary, gotCompanion], okPrimary: false, okCompanion: false, problem: "expected a note about the missing skill" });
      continue;
    }
    if (okPrimary) primaryRight += 1;
    if (okCompanion) companionRight += 1;
    const expectedSet = new Set([wantPrimary, wantCompanion].filter((name) => name !== "none"));
    for (const name of got.loaded) {
      loaded += 1;
      if (!expectedSet.has(name)) unnecessary += 1;
    }
    loadedBudget = Math.max(loadedBudget, got.loaded.length);
    rows.push({ task: item.task, want: [wantPrimary, wantCompanion], got: [gotPrimary, gotCompanion], okPrimary, okCompanion });
  }
  return {
    total: cases.length,
    primaryAccuracy: primaryRight / cases.length,
    companionAccuracy: companionRight / cases.length,
    loadedSkills: loaded,
    unnecessaryLoads: unnecessary,
    unnecessaryRate: loaded === 0 ? 0 : unnecessary / loaded,
    maxLoadedPerTask: loadedBudget,
    rows
  };
}

function printHelp() {
  return `uca-route — suggest skills for a task using the router rules

Usage:
  node scripts/uca-route.cjs "<task>" [--root <project>] [--tier lite|standard|full] [--profile <name>] [--json]
  node scripts/uca-route.cjs --eval <cases.json> [--tier <tier>] [--json]

--root reads the project's manifests so stack-specific skills are skipped when the layer is missing.
--tier or --profile limits the answer to the skills that setup installs.
This is a deterministic reference for .agents/router-rule.md. You still read the chosen SKILL.md before using it.
`;
}

function parseArgs(argv) {
  const options = { task: null, root: null, tier: null, profile: null, evalFile: null, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`Option ${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--root") options.root = value();
    else if (arg === "--tier") options.tier = value();
    else if (arg === "--profile") options.profile = value();
    else if (arg === "--eval") options.evalFile = value();
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (options.task === null) options.task = arg;
    else throw new Error(`Unexpected extra argument: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      console.log(printHelp());
      return 0;
    }
    if (options.evalFile) {
      const cases = JSON.parse(fs.readFileSync(options.evalFile, "utf8"));
      const report = evaluate(cases, { tier: options.tier, profile: options.profile });
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else {
        for (const row of report.rows) console.log(`${row.okPrimary && row.okCompanion ? "ok  " : "MISS"} ${row.task}\n       want ${row.want.join(" + ")}  got ${row.got.join(" + ")}`);
        console.log(`\nprimary ${(report.primaryAccuracy * 100).toFixed(0)}%  companion ${(report.companionAccuracy * 100).toFixed(0)}%  unnecessary loads ${report.unnecessaryLoads}/${report.loadedSkills}  most skills in one task ${report.maxLoadedPerTask}`);
      }
      return 0;
    }
    if (!options.task) throw new Error("Give the task in quotes, or use --eval <cases.json>.");
    const result = route(options.task, options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      const name = (item) => (item && item.name ? `${item.name}${item.kind === "workflow" ? " (workflow)" : ""}` : "none");
      console.log(`Primary: ${name(result.primary)}\nCompanion: ${name(result.companion)}\nAlways on: ${result.always_on.join(", ")}\nWhy: ${result.reason}`);
      for (const note of result.notes) console.log(`Note: ${note}`);
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${error.message}\n\nRun with --help for usage.`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = { ALL_SKILLS, GUARDRAILS, detectLayers, evaluate, main, parseArgs, route };
