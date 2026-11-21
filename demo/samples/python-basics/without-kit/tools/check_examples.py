"""Check every Python example in index.html against the output shown on the page.

How to use (from the folder that contains index.html):

    python3 tools/check_examples.py
    python3 tools/check_examples.py --python python3.12 --python python3.13

What it does:
  * finds every <pre><code class="language-python"> block,
  * takes the <pre class="output"> block that comes right after it,
  * runs the code in a fresh Python process (several times, with different
    hash seeds, so that output that changes from run to run is caught),
  * compares what Python prints with what the page shows.

Two special cases:
  * memory addresses such as 0x7f3a2c1b9d90 change on every run, so they
    are replaced by 0x... before comparing;
  * an output block with class "error" (<pre class="output error">) shows
    the LAST line of the error message Python prints when the program stops
    with an error. For those, the program must stop with an error, and that
    last line is compared (any normal printed output must come before it).

Only the Python standard library is used. Exit code 0 means every example matched.
"""

import argparse
import os
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

HEX_ADDRESS = re.compile(r"0x[0-9a-fA-F]+")
HASH_SEEDS = ["0", "1", "12345"]


class ExampleParser(HTMLParser):
    """Collect (code, output, line_number) triples in page order."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # open tags inside a <pre>
        self.mode = None         # "code" or "output" while collecting
        self.buffer = []
        self.start_line = 0
        self.items = []          # ("code" | "output", text, line)
        self.pre_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = (attrs.get("class") or "").split()
        if tag == "pre":
            self.pre_depth += 1
            if "output" in classes:
                self.mode = "error" if "error" in classes else "output"
                self.buffer = []
                self.start_line = self.getpos()[0]
            return
        if tag == "code" and self.pre_depth and "language-python" in classes:
            self.mode = "code"
            self.buffer = []
            self.start_line = self.getpos()[0]
            return
        if self.mode and tag not in ("span", "b", "i", "em", "strong", "mark"):
            raise ValueError(f"line {self.getpos()[0]}: unexpected <{tag}> inside example")

    def handle_endtag(self, tag):
        if tag == "code" and self.mode == "code":
            self.items.append(("code", "".join(self.buffer), self.start_line))
            self.mode = None
        elif tag == "pre":
            if self.mode in ("output", "error"):
                self.items.append((self.mode, "".join(self.buffer), self.start_line))
                self.mode = None
            self.pre_depth -= 1
        elif tag not in ("span", "b", "i", "em", "strong", "mark"):
            # Any other closing tag between a code block and its output
            # means they are not neighbours.
            self.items.append(("other", tag, self.getpos()[0]))

    def handle_data(self, data):
        if self.mode:
            self.buffer.append(data)


def pair_examples(items):
    pairs, problems = [], []
    i = 0
    while i < len(items):
        kind, text, line = items[i]
        if kind == "code":
            nxt = items[i + 1] if i + 1 < len(items) else None
            if nxt and nxt[0] in ("output", "error"):
                pairs.append((text, nxt[1], line, nxt[0] == "error"))
                i += 2
                continue
            problems.append(f"line {line}: code block has no <pre class=\"output\"> right after it")
        elif kind in ("output", "error"):
            problems.append(f"line {line}: output block without a code block before it")
        i += 1
    return pairs, problems


def normalise(text):
    text = HEX_ADDRESS.sub("0x...", text)
    return text.rstrip("\n")


def run(python, code, seed):
    env = dict(os.environ, PYTHONHASHSEED=seed, PYTHONIOENCODING="utf-8")
    result = subprocess.run(
        [python, "-I", "-c", code],
        capture_output=True, text=True, encoding="utf-8", env=env, timeout=20,
    )
    return result.returncode, result.stdout, result.stderr


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("page", nargs="?", default=str(Path(__file__).resolve().parent.parent / "index.html"))
    parser.add_argument("--python", action="append", help="Python to run (repeatable). Default: this Python.")
    args = parser.parse_args()
    pythons = args.python or [sys.executable]

    html = Path(args.page).read_text(encoding="utf-8")
    p = ExampleParser()
    try:
        p.feed(html)
        p.close()
    except ValueError as problem:
        # Usually a "<" or "&" in code or output that was not written as &lt; or &amp;
        print("PROBLEM", problem, "(did you forget to write < as &lt; ?)")
        return 1
    pairs, problems = pair_examples(p.items)

    failures = 0
    for python in pythons:
        version = subprocess.run([python, "--version"], capture_output=True, text=True).stdout.strip()
        print(f"== {python} ({version})")
        for code, expected, line, is_error in pairs:
            seen = set()
            for seed in HASH_SEEDS:
                code_rc, out, err = run(python, code, seed)
                if is_error:
                    if code_rc == 0:
                        failures += 1
                        print(f"FAIL line {line}: expected an error, but the program finished normally")
                        break
                    err_lines = err.rstrip("\n").splitlines()
                    out = out + (err_lines[-1] if err_lines else "")
                elif code_rc != 0 or err:
                    failures += 1
                    print(f"FAIL line {line}: exit code {code_rc}, stderr:\n{err}")
                    break
                seen.add(normalise(out))
            else:
                if len(seen) > 1:
                    failures += 1
                    print(f"FAIL line {line}: output changes from run to run")
                elif normalise(expected) not in seen:
                    failures += 1
                    print(f"FAIL line {line}: page shows\n{expected!r}\nPython printed\n{out!r}\n")

    for problem in problems:
        print("PROBLEM", problem)
    print(f"{len(pairs)} examples, {failures} failures, {len(problems)} layout problems")
    return 1 if failures or problems else 0


if __name__ == "__main__":
    sys.exit(main())
