# Python Basics, Visualised

A single study page for adults learning Python from zero: variables, data types, operators, strings, list/tuple/set/dict, and classes. It has diagrams, five small interactive parts, and the real output under every code example.

## Open it

Double-click `index.html`. It works offline, with no server and no internet. To share it, copy these files together: `index.html`, `style.css`, `logic.js`, `app.js`.

## Check the examples yourself

Every code example is in a `<pre><code class="language-python">` block, followed by its output in a `<pre class="output">` block. To run them all and compare (needs Python 3):

    python3 check_examples.py
    python3 check_examples.py --python python3.12   # test with another Python version

It runs each example on its own, three times with different hash seeds, and also checks the values in the tables. Error outputs are written as the first line of the traceback, `...`, and the last line; only those two lines are compared, because the lines in between depend on the file name and the Python version.

## Developer checks

    python3 tests/test_logic.py          # the page's JavaScript maths and slicing vs real Python (needs Node.js)
    node tests/browser_check.cjs [dir]    # headless Chrome: widgets, keyboard, phone/laptop widths; optional screenshots

The design brief is in `DESIGN.md`.
