# Maintainer review: Python basics, visualised

Done after both runs finished, by the maintainer, the same way for both pages. The review list was written before either result was read.

## 1. Every output, run in real Python

`maintainer-check.py` takes every `<pre><code class="language-python">` block and the `<pre class="output">` block after it, runs the examples in page order in one shared namespace (so later examples can use names from earlier ones), and repeats the whole page under 8 hash seeds, because the print order of a set of strings changes between runs. An example that raises an error is compared on its last line, as both pages explain. Python 3.13.18.

| | Without kit | With kit |
|---|---|---|
| Code examples | 132 | 82 |
| Every example has its output block right after it | Yes | Yes |
| Outputs that match real Python | 132 of 132 | 82 of 82 |
| Sets shown in a fixed order Python does not promise | 0 | 0 |

Run B shows errors as `Traceback (most recent call last):`, `...`, then the last line. The first run of the maintainer check compared only the last line and flagged those 6 examples. That was the check's own format gap, not a wrong output: the last lines match.

## 2. The explanations, against a fixed list

Each page was read against 20 points that beginner material often gets wrong. Wrong means the page says something false; missing means the page does not say it.

| # | Point | Without kit | With kit |
|---|---|---|---|
| 1 | `-7 // 2` is `-4` (floors toward minus infinity) | Right | Right |
| 2 | `%` fits `(a // b) * b + a % b == a` | Right | Right |
| 3 | `/` always gives a float | Right | Right |
| 4 | `0.1 + 0.2` is not exactly `0.3` | Right | Right |
| 5 | `int()` cuts toward zero; `int("3.5")` is an error | Right (positive numbers only) | Right, including `int(-3.9)` is `-3` |
| 6 | Truthy and falsy; `"False"` is truthy | Right | Right |
| 7 | `is` is identity, use it for `None`, not for numbers or text | Right | Right |
| 8 | `and` / `or` give back one of the values | Right | Right |
| 9 | Strings are immutable; methods return a new string | Right | Right |
| 10 | `b = a` with a list: two names, one list; `.copy()` | Right | Right |
| 11 | `.sort()` returns `None`; `sorted()` returns a new list | Right | Right |
| 12 | One-item tuple needs a comma | Right | Right |
| 13 | Sets have no order; `{}` is an empty dict | Right | Right |
| 14 | Dict keys must be unchangeable; a list cannot be a key | Right | Right |
| 15 | `d[key]` errors on a missing key; `.get()` does not | Right | Right |
| 16 | Assigning through an object hides the class attribute | Right | Right |
| 17 | `self` is the object the method was called on | Right | Right |
| 18 | `super().__init__(...)` runs the parent's set-up | Right | Right |
| 19 | Without `__str__`, print shows `<... object at 0x...>` | Right | Right |
| 20 | A leading underscore is only a convention | Missing | Missing |

**Wrong statements found: 0 on both pages.** This is one reader with one list, not a full review; a teacher should still read both.

## 3. In a browser (headless Chrome, from the file, no server)

| | Without kit | With kit |
|---|---|---|
| Script errors at 390 px and 1366 px | 0 | 0 |
| Requests to other sites | 0 | 0 |
| Page scrolls sideways on a phone | No | No |
| Diagrams (SVG) | 14 | 9 |
| Visible focus outline on the first 25 Tab stops | 25 of 25 | 25 of 25 |
| Page length at 1366 px | 68,631 px | 49,181 px |

## 4. The kit's static checks

| | Without kit | With kit |
|---|---|---|
| Senior Bar check | 5 of 8 (no README, no test files, no test command) | 8 of 9 (no test command) |
| Design check (template tells) | 1 (emoji used as icons) | 0 |

The first Senior Bar run asked both pages for an `.env.example`, because their example checkers pass the environment on to Python. That was a false alarm in the check, fixed in the same change that added this sample.

## What this shows, honestly

On what matters most for students, both pages are equal: every output is right, and no explanation on the list is wrong. The run without the kit made a bigger and more visual page (more examples, more diagrams, 10 predict-the-output questions). The run with the kit made a shorter page and left more behind for the next person: a README, its tests, a design brief, a contrast check, and six imprecise sentences it found and fixed. One run per side.
