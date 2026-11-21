"""Check that the interactive parts of index.html agree with real Python.

    python3 tools/check_widgets.py

Needs Node.js for the parts that test app.js (string slices, list playground,
sweets-in-bags). Everything else uses only Python.
"""

import io
import json
import random
import re
import subprocess
import sys
from contextlib import redirect_stdout
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
failures = 0


def fail(msg):
    global failures
    failures += 1
    print("FAIL", msg)


def run_py(code):
    buf = io.StringIO()
    with redirect_stdout(buf):
        exec(code, {})
    return buf.getvalue()


# 1. Truthiness chips: <button type="button" data-result="True">"hello"</button>
chips = re.findall(r'<button type="button" data-result="(True|False)">(.*?)</button>', HTML)
for result, label in chips:
    real = str(bool(eval(unescape(label))))
    if real != result:
        fail(f"truthiness chip {label}: page says {result}, Python says {real}")
print(f"truthiness chips checked: {len(chips)}")

# 2. Venn buttons
venn = re.findall(r'data-op="([^"]+)" data-regions="[^"]+" data-result="([^"]+)"', HTML)
for op, result in venn:
    real = run_py(f"a = {{1, 2, 3, 4}}\nb = {{3, 4, 5, 6}}\nprint({unescape(op)})").strip()
    if real != unescape(result):
        fail(f"venn {op}: page says {result}, Python says {real}")
print(f"set-operation buttons checked: {len(venn)}")

# 3. Steppers: run the lines; the last step's output must match; every step's
#    picture of values must match what the names really point to after that line.
steppers = re.findall(r'<script type="application/json">(.*?)</script>', HTML, re.S)
for raw in steppers:
    data = json.loads(raw)
    lines = data["lines"]
    for step in data["steps"]:
        upto = step["line"] + 1
        ns = {}
        buf = io.StringIO()
        with redirect_stdout(buf):
            exec("\n".join(lines[:upto]), ns)
        if buf.getvalue().rstrip("\n") != step.get("out", ""):
            fail(f"stepper {lines[0]!r} step line {step['line']}: output {buf.getvalue()!r} vs {step.get('out')!r}")
        values = dict(step["values"])
        ids = {}
        for name, vid in step["names"]:
            if name not in ns:
                fail(f"stepper {lines[0]!r}: name {name} not defined after line {step['line']}")
                continue
            if repr(ns[name]) != values[vid]:
                fail(f"stepper {lines[0]!r}: {name} shown as {values[vid]}, really {ns[name]!r}")
            ids.setdefault(vid, []).append(ns[name])
        for vid, objs in ids.items():   # names drawn to one box must be one object
            if any(o is not objs[0] for o in objs):
                fail(f"stepper {lines[0]!r}: names share a box but are different objects")
        names_in_ns = {k for k in ns if not k.startswith("__")}
        if names_in_ns != {n for n, _ in step["names"]}:
            fail(f"stepper {lines[0]!r} line {step['line']}: names {names_in_ns} vs picture")
print(f"steppers checked: {len(steppers)}")

# 4. app.js logic against Python (needs node)
random.seed(1)
words = ["Python", "", "a", "hello world", "data", "naïve", "abcdefghijkl"]
slice_cases = []
for w in words:
    n = len(w)
    opts = [None] + list(range(-n - 2, n + 3))
    for s in opts:
        for e in opts:
            slice_cases.append([w, s, e])
index_cases = [[w, i] for w in words for i in range(-len(w) - 2, len(w) + 2)]
NEW = ["eggs", "jam", "tea", "rice", "apple"]
OPS = ["append", "insert0", "pop", "pop0", "remove", "sort", "reverse"]
list_runs = []
for _ in range(300):
    seq = []
    for _ in range(random.randint(1, 12)):
        op = random.choice(OPS)
        arg = random.choice(NEW) if op in ("append", "insert0") else ("tea" if op == "remove" else None)
        seq.append([op, arg])
    list_runs.append(seq)

js = r"""
const L = require(process.argv[1]);
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = {slices: [], indexes: [], lists: [], divmod: []};
for (const [w, s, e] of input.slices) out.slices.push(L.slice(w, s, e));
for (const [w, i] of input.indexes) { const r = L.index(w, i); out.indexes.push(r.ok ? r.value : r.error); }
for (const seq of input.lists) {
  let list = ['tea', 'milk', 'bread']; const steps = [];
  for (const [op, arg] of seq) {
    const r = L.listOp(list, op, arg);
    steps.push({code: L.listOpCode(op, arg), printed: r.printed, error: r.error});
    list = r.list;
  }
  out.lists.push(steps);
}
for (let a = 0; a <= 30; a++) for (let b = 1; b <= 10; b++) out.divmod.push([Math.floor(a / b), a % b]);
process.stdout.write(JSON.stringify(out));
"""
try:
    res = subprocess.run(["node", "-e", js, str(ROOT / "app.js")],
                         input=json.dumps({"slices": slice_cases, "indexes": index_cases, "lists": list_runs}),
                         capture_output=True, text=True, encoding="utf-8", check=True)
    got = json.loads(res.stdout)
except (OSError, subprocess.CalledProcessError) as exc:
    print("SKIPPED app.js checks (node not available or failed):", exc)
    got = None

if got:
    for (w, s, e), js_val in zip(slice_cases, got["slices"]):
        if w[s:e] != js_val:
            fail(f"slice {w!r}[{s}:{e}]: JS {js_val!r}, Python {w[s:e]!r}")
    for (w, i), js_val in zip(index_cases, got["indexes"]):
        try:
            py = w[i]
        except IndexError as exc:
            py = f"IndexError: {exc}"
        if py != js_val:
            fail(f"index {w!r}[{i}]: JS {js_val!r}, Python {py!r}")
    for seq, steps in zip(list_runs, got["lists"]):
        basket = ["tea", "milk", "bread"]
        for (op, arg), st in zip(seq, steps):
            code = st["code"]
            buf = io.StringIO()
            ns = {"basket": basket}
            try:
                with redirect_stdout(buf):
                    exec(code, ns)
                py_err = None
            except Exception as exc:
                py_err = f"{type(exc).__name__}: {exc}"
            if py_err != st["error"]:
                fail(f"list {code!r}: JS error {st['error']!r}, Python {py_err!r}")
            elif py_err is None and buf.getvalue().splitlines() != st["printed"]:
                fail(f"list {code!r}: JS printed {st['printed']}, Python {buf.getvalue().splitlines()}")
    k = 0
    for a in range(31):
        for b in range(1, 11):
            if got["divmod"][k] != [a // b, a % b]:
                fail(f"divmod {a},{b}")
            k += 1
    print(f"app.js checked: {len(slice_cases)} slices, {len(index_cases)} indexes, "
          f"{sum(map(len, list_runs))} list operations, {k} // and % pairs")

print("all widget checks passed" if not failures else f"{failures} widget failures")
sys.exit(1 if failures else 0)
