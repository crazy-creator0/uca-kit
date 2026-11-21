"""Check that every example on the study page prints what the page says.

Usage (from this folder):
    python3 check_examples.py                 # uses the Python running this script
    python3 check_examples.py --python python3.12

What it checks in index.html:
  1. Every <pre><code class="language-python"> block is followed by a <pre class="output"> block.
  2. Each code block is run on its own, in a fresh Python, three times with different hash seeds
     (so output that changes from run to run is caught), and what it prints must equal the output block.
     If the output block shows an error, it is written like this:
         Traceback (most recent call last):
           ...
         TypeError: the message
     The lines Python prints in place of "..." (file name, line number, carets) differ between
     computers and Python versions, so only the first and last error lines are compared.
  3. Table rows marked <code data-expr>...</code> ... <code data-value>...</code>:
     repr(expression) must equal the value shown.
Exits with 1 if anything differs.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PAGE = Path(__file__).resolve().parent / "index.html"
CODE_RE = re.compile(r'<pre><code class="language-python">(.*?)</code></pre>', re.S)
OUTPUT_RE = re.compile(r'\s*<pre class="output">(.*?)</pre>', re.S)
ROW_RE = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.S)
EXPR_RE = re.compile(r"<code data-expr>(.*?)</code>", re.S)
VALUE_RE = re.compile(r"<code data-value>(.*?)</code>", re.S)
TRACEBACK = "Traceback (most recent call last):"
SEEDS = ["0", "1", "4242"]


def text_of(fragment):
    if "<" in fragment:
        raise ValueError(f"unexpected HTML tag inside a code or output block: {fragment[:60]!r}")
    return html.unescape(fragment)


def run(python, code, seed):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "example.py"
        path.write_text(code, encoding="utf-8")
        env = dict(os.environ, PYTHONHASHSEED=seed, PYTHONIOENCODING="utf-8", NO_COLOR="1",
                   PYTHON_COLORS="0")
        return subprocess.run([python, "-X", "utf8", str(path)], cwd=tmp, env=env,
                              capture_output=True, text=True, timeout=20)


def compare(expected, proc):
    """Return None if the run matches the expected output, else a description."""
    expected = expected.rstrip("\n")
    stdout = proc.stdout.rstrip("\n")
    if TRACEBACK in expected:
        before, _, after = expected.partition(TRACEBACK)
        lines = after.strip("\n").split("\n")
        if len(lines) != 2 or lines[0].strip() != "...":
            return "error output must be: Traceback line, '  ...', last line"
        want_out, want_err = before.rstrip("\n"), lines[1]
        err_lines = [l for l in proc.stderr.split("\n") if l.strip()]
        got_err = err_lines[-1] if err_lines else ""
        if proc.returncode == 0:
            return "expected an error, but the code ran without one"
        if not err_lines or err_lines[0] != TRACEBACK:
            return f"stderr does not start with a traceback:\n{proc.stderr}"
        if stdout != want_out or got_err != want_err:
            return f"--- page says ---\n{expected}\n--- Python printed ---\n{proc.stdout}{proc.stderr}"
        return None
    if proc.returncode != 0 or proc.stderr:
        return f"unexpected error or warning:\n{proc.stderr}"
    if stdout != expected:
        return f"--- page says ---\n{expected}\n--- Python printed ---\n{stdout}"
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", default=sys.executable, help="Python to test with")
    args = parser.parse_args()
    page = PAGE.read_text(encoding="utf-8")
    version = subprocess.run([args.python, "--version"], capture_output=True, text=True).stdout.strip()
    problems = []

    blocks = list(CODE_RE.finditer(page))
    if page.count('class="language-python"') != len(blocks):
        problems.append("some language-python blocks are not in the exact <pre><code ...> form")
    for number, match in enumerate(blocks, 1):
        line = page.count("\n", 0, match.start()) + 1
        out = OUTPUT_RE.match(page, match.end())
        if not out:
            problems.append(f"example {number} (line {line}): no <pre class=\"output\"> right after it")
            continue
        code, expected = text_of(match.group(1)), text_of(out.group(1))
        for seed in SEEDS:
            diff = compare(expected, run(args.python, code, seed))
            if diff:
                problems.append(f"example {number} (line {line}), hash seed {seed}:\n{code}\n{diff}")
                break

    rows = []
    for row in ROW_RE.finditer(page):
        expr, value = EXPR_RE.search(row.group(1)), VALUE_RE.search(row.group(1))
        if expr and value:
            rows.append((text_of(expr.group(1)), text_of(value.group(1)),
                         page.count("\n", 0, row.start()) + 1))
    evaluator = "import json,sys\nprint(json.dumps([repr(eval(e)) for e in json.load(sys.stdin)]))"
    got = json.loads(subprocess.run([args.python, "-c", evaluator], input=json.dumps([r[0] for r in rows]),
                                    capture_output=True, text=True, check=True).stdout)
    for (expr, value, line), actual in zip(rows, got):
        if actual != value:
            problems.append(f"table row (line {line}): {expr} is {actual}, page says {value}")

    print(f"Checked {len(blocks)} code examples and {len(rows)} table rows with {version}.")
    if problems:
        print(f"{len(problems)} problem(s):\n")
        print("\n\n".join(problems))
        sys.exit(1)
    print("All outputs match.")


if __name__ == "__main__":
    main()
