"""Run every Python example on a study page and compare with the output the page shows.

Pairs: <pre><code class="language-python">CODE</code></pre> followed by <pre class="output">OUTPUT</pre>.
Examples run in order in one shared namespace (later examples may use names from earlier ones),
each under several hash seeds, because set and dict-of-set order of strings changes between runs.
An example that raises prints the last traceback line ("TypeError: ..."), as Python would.

Usage: python3 check_examples.py page.html [more.html ...] > report.json
"""
import html, json, os, re, subprocess, sys, tempfile

PAIR = re.compile(
    r'<pre[^>]*>\s*<code[^>]*class="[^"]*language-python[^"]*"[^>]*>(.*?)</code>\s*</pre>'
    r'(\s*(?:<[^>]+>\s*)*?<pre[^>]*class="[^"]*\boutput\b[^"]*"[^>]*>(.*?)</pre>)?',
    re.S,
)
TAG = re.compile(r"<[^>]+>")
SEEDS = ["0", "1", "2", "3", "4", "5", "6", "7"]

DRIVER = r'''
import contextlib, io, json, sys, traceback, builtins
examples = json.load(open(sys.argv[1]))
builtins.input = lambda prompt="": (print(prompt, end=""), "")[1]
ns = {"__name__": "__main__"}
results = []
for code in examples:
    buf = io.StringIO()
    error = None
    with contextlib.redirect_stdout(buf):
        try:
            exec(compile(code, "<example>", "exec"), ns)
        except BaseException as exc:
            error = "".join(traceback.format_exception_only(type(exc), exc)).strip().splitlines()[-1]
    results.append({"out": buf.getvalue(), "error": error})
print(json.dumps(results))
'''


def text(fragment):
    return html.unescape(TAG.sub("", fragment))


def norm(value):
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").strip("\n").split("\n")]
    return "\n".join(lines).strip()


def addresses(value):
    return re.sub(r"0x[0-9a-fA-F]+", "0x…", value)


def set_order(value):
    """Sort the items inside each {...} that has no ":" (a set, whose print order is not fixed)."""
    return re.sub(r"\{([^{}:]*)\}", lambda m: "{" + ", ".join(sorted(part.strip() for part in m.group(1).split(","))) + "}", value)


def check(path):
    page = open(path, encoding="utf-8").read()
    pairs = [(text(m.group(1)), text(m.group(3)) if m.group(3) is not None else None) for m in PAIR.finditer(page)]
    codes = [code for code, _ in pairs]
    with tempfile.TemporaryDirectory() as tmp:
        data = os.path.join(tmp, "examples.json")
        driver = os.path.join(tmp, "driver.py")
        json.dump(codes, open(data, "w"))
        open(driver, "w").write(DRIVER)
        runs = []
        for seed in SEEDS:
            env = {"PATH": os.environ.get("PATH", ""), "PYTHONHASHSEED": seed, "PYTHONIOENCODING": "utf-8"}
            done = subprocess.run([sys.executable, "-I", driver, data], capture_output=True, text=True, timeout=120, env=env, cwd=tmp, stdin=subprocess.DEVNULL)
            if done.returncode != 0:
                raise SystemExit(f"driver failed for {path}: {done.stderr[-2000:]}")
            runs.append(json.loads(done.stdout))
    report = {"page": path, "examples": len(pairs), "with_output": 0, "match": 0, "order_varies": 0, "mismatch": 0, "no_output_block": 0, "details": []}
    for index, (code, shown) in enumerate(pairs):
        actual = []
        for run in runs:
            result = run[index]
            out = result["out"]
            if result["error"]:
                out = (out + ("\n" if out and not out.endswith("\n") else "") + result["error"])
            actual.append(norm(out))
        if shown is None:
            report["no_output_block"] += 1
            if actual[0]:
                report["details"].append({"n": index + 1, "kind": "prints but no output block", "code": code, "actual": actual[0]})
            continue
        report["with_output"] += 1
        want = addresses(norm(shown))
        hits = [addresses(a) == want for a in actual]
        if all(hits):
            report["match"] += 1
        elif any(hits) or all(set_order(addresses(a)) == set_order(want) for a in actual):
            report["order_varies"] += 1
            report["details"].append({"n": index + 1, "kind": "right items, but a set is shown in a fixed order that Python does not promise", "code": code, "shown": norm(shown), "actual_examples": sorted(set(actual))[:3]})
        else:
            report["mismatch"] += 1
            report["details"].append({"n": index + 1, "kind": "mismatch", "code": code, "shown": norm(shown), "actual": actual[0]})
    return report


if __name__ == "__main__":
    print(json.dumps([check(p) for p in sys.argv[1:]], indent=1, ensure_ascii=False))
