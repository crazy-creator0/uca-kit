"""Compare the JavaScript helpers in logic.js with real Python.

Run from the project folder:  python3 tests/test_logic.py
Needs Node.js. Prints a summary and exits with 1 if anything differs.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NODE_SCRIPT = r"""
const L = require(process.argv[1]);
const req = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = {calc: [], slices: [], index: []};
for (const [a, op, b] of req.calc) out.calc.push(L.calc(a, op, b));
for (const [s, e, st] of req.slices) out.slices.push(L.sliceIndices(6, s, e, st));
for (const i of req.index) out.index.push(L.indexAt("PYTHON", i));
out.quiz = L.TRUTHY_QUIZ;
out.chooser = L.CHOOSER;
console.log(JSON.stringify(out));
"""


def python_calc(a, op, b):
    try:
        value = {"+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b,
                 "/": lambda: a / b, "//": lambda: a // b, "%": lambda: a % b}[op]()
    except ZeroDivisionError:
        return {"ok": False, "error": "ZeroDivisionError"}
    return {"ok": True, "text": str(value)}


def main():
    ops = ["+", "-", "*", "/", "//", "%"]
    numbers = list(range(-60, 61)) + [-999, -500, -101, 101, 365, 999]
    calc_cases = [[a, op, b] for a in numbers for b in numbers for op in ops]
    bounds = [None] + list(range(-9, 10))
    slice_cases = [[s, e, st] for s in bounds for e in bounds for st in [None, -3, -2, -1, 0, 1, 2, 3]]
    index_cases = list(range(-9, 10))

    request = json.dumps({"calc": calc_cases, "slices": slice_cases, "index": index_cases})
    result = subprocess.run(["node", "-e", NODE_SCRIPT, str(ROOT / "logic.js")],
                            input=request, capture_output=True, text=True, check=True)
    js = json.loads(result.stdout)
    failures = []

    for case, got in zip(calc_cases, js["calc"]):
        want = python_calc(*case)
        if got != want:
            failures.append(f"calc {case}: JS {got} vs Python {want}")

    word = "PYTHON"
    for (s, e, st), got in zip(slice_cases, js["slices"]):
        if st == 0:
            want = None  # Python: ValueError: slice step cannot be zero
            try:
                word[s:e:st]
            except ValueError:
                pass
        else:
            want = list(range(len(word)))[s:e:st]
        if got != want:
            failures.append(f"slice [{s}:{e}:{st}]: JS {got} vs Python {want}")

    for i, got in zip(index_cases, js["index"]):
        try:
            want = word[i]
        except IndexError:
            want = None
        if got != want:
            failures.append(f"index [{i}]: JS {got} vs Python {want}")

    for item in js["quiz"]:
        want = bool(eval(item["expr"]))
        if item["answer"] != want:
            failures.append(f"quiz {item['expr']}: page says {item['answer']}, Python says {want}")

    # Every chooser example must be valid Python that builds the promised type.
    for name, res in js["chooser"]["results"].items():
        scope = {}
        exec(res["example"], scope)
        value = [v for k, v in scope.items() if k != "__builtins__"][0]
        if type(value).__name__ != res["name"]:
            failures.append(f"chooser {name}: example builds {type(value).__name__}")

    total = len(calc_cases) + len(slice_cases) + len(index_cases) + len(js["quiz"]) + len(js["chooser"]["results"])
    if failures:
        print(f"FAILED {len(failures)} of {total} checks")
        for f in failures[:30]:
            print("  " + f)
        sys.exit(1)
    print(f"OK: all {total} JavaScript results match Python {sys.version.split()[0]}")


if __name__ == "__main__":
    main()
