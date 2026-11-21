/* Python Basics, Visualised — small interactive parts.
   Everything here is optional: without JavaScript the page still shows
   all text, code and outputs. No network access is used. */

/* ------------------------------------------------------------------
   Pure logic (no page needed). tools/check_widgets.js tests these
   against real Python, so keep them free of DOM code.
   ------------------------------------------------------------------ */
var PyLogic = (function () {
  // Python's str repr for simple strings (no quotes or backslashes inside).
  function reprStr(s) { return "'" + s + "'"; }
  function reprList(items) { return "[" + items.map(reprStr).join(", ") + "]"; }

  // word[start:stop] with step 1, following Python's rules.
  // start/stop may be null (left empty). Returns the list of characters.
  function sliceIndices(length, start, stop) {
    function norm(i, dflt) {
      if (i === null || i === undefined) return dflt;
      if (i < 0) i += length;
      if (i < 0) i = 0;
      if (i > length) i = length;
      return i;
    }
    var a = norm(start, 0), b = norm(stop, length);
    return { start: a, stop: Math.max(a, b) };
  }
  function slice(word, start, stop) {
    var chars = Array.from(word);
    var r = sliceIndices(chars.length, start, stop);
    return chars.slice(r.start, r.stop).join("");
  }
  // word[i]: returns {ok, value} or {ok:false, error}
  function index(word, i) {
    var chars = Array.from(word);
    var j = i < 0 ? i + chars.length : i;
    if (j < 0 || j >= chars.length) return { ok: false, error: "IndexError: string index out of range" };
    return { ok: true, value: chars[j] };
  }

  // List playground operations. Each returns {list, printed, error}.
  // "printed" is what the shown code prints (the code always ends with print(basket)).
  function listOp(list, op, arg) {
    var l = list.slice();
    var printed = [];
    var error = null;
    switch (op) {
      case "append": l.push(arg); break;
      case "insert0": l.splice(0, 0, arg); break;
      case "pop":
        if (!l.length) error = "IndexError: pop from empty list";
        else printed.push(l.pop());
        break;
      case "pop0":
        if (!l.length) error = "IndexError: pop from empty list";
        else printed.push(l.shift());
        break;
      case "remove":
        var at = l.indexOf(arg);
        if (at === -1) error = "ValueError: list.remove(x): x not in list";
        else l.splice(at, 1);
        break;
      case "sort": l.sort(); break;          // only plain lowercase ASCII words are used
      case "reverse": l.reverse(); break;
      default: throw new Error("unknown op " + op);
    }
    if (!error) printed.push(reprList(l));
    return { list: error ? list.slice() : l, printed: printed, error: error };
  }
  function listOpCode(op, arg) {
    switch (op) {
      case "append": return "basket.append(" + JSON.stringify(arg) + ")\nprint(basket)";
      case "insert0": return "basket.insert(0, " + JSON.stringify(arg) + ")\nprint(basket)";
      case "pop": return "print(basket.pop())\nprint(basket)";
      case "pop0": return "print(basket.pop(0))\nprint(basket)";
      case "remove": return "basket.remove(" + JSON.stringify(arg) + ")\nprint(basket)";
      case "sort": return "basket.sort()\nprint(basket)";
      case "reverse": return "basket.reverse()\nprint(basket)";
    }
  }

  return { reprStr: reprStr, reprList: reprList, slice: slice, sliceIndices: sliceIndices, index: index, listOp: listOp, listOpCode: listOpCode };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = PyLogic; }

/* ------------------------------------------------------------------
   Page behaviour
   ------------------------------------------------------------------ */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    highlightAll();
    setupQuizzes();
    document.querySelectorAll(".stepper").forEach(setupStepper);
    document.querySelectorAll("[data-widget]").forEach(function (el) {
      var fn = WIDGETS[el.getAttribute("data-widget")];
      if (fn) {
        var note = el.querySelector(".noscript-note");
        if (note) note.remove();
        fn(el);
      }
    });
  });
}

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === "text") node.textContent = attrs[k];
    else if (k === "class") node.className = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return node;
}
var SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, text) {
  var node = document.createElementNS(SVGNS, tag);
  Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- Syntax colouring (text is never changed, only wrapped) ---------- */
var KEYWORDS = new Set(["False", "None", "True", "and", "as", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "if", "import", "in", "is", "lambda", "not", "or", "pass", "return", "try", "while", "with", "yield"]);
var BUILTINS = new Set(["print", "len", "type", "int", "float", "str", "bool", "list", "tuple", "set", "dict", "range", "input", "round", "sorted", "sum", "min", "max", "abs", "isinstance", "enumerate", "super", "zip"]);
var TOKEN_RE = /(#[^\n]*)|([fFrRbB]?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

function highlightAll() {
  document.querySelectorAll("pre > code.language-python").forEach(function (code) {
    code.parentElement.classList.add("py");
    var text = code.textContent;
    var frag = document.createDocumentFragment();
    var last = 0, prevWord = "";
    text.replace(TOKEN_RE, function (m, com, str, num, word, offset) {
      if (offset > last) frag.appendChild(document.createTextNode(text.slice(last, offset)));
      var cls = null;
      if (com) cls = "tok-com";
      else if (str) cls = "tok-str";
      else if (num) cls = "tok-num";
      else if (word) {
        if (prevWord === "def" || prevWord === "class") cls = "tok-def";
        else if (KEYWORDS.has(word)) cls = "tok-kw";
        else if (word === "self") cls = "tok-self";
        else if (BUILTINS.has(word)) cls = "tok-bi";
        prevWord = word;
      }
      if (cls) { var s = document.createElement("span"); s.className = cls; s.textContent = m; frag.appendChild(s); }
      else frag.appendChild(document.createTextNode(m));
      last = offset + m.length;
      return m;
    });
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    code.textContent = "";
    code.appendChild(frag);
  });
}

/* ---------- "Predict the output" quizzes ---------- */
function setupQuizzes() {
  document.querySelectorAll(".quiz").forEach(function (quiz, n) {
    var out = quiz.querySelector("pre.output");
    var explain = quiz.querySelector(".explain");
    if (!out) return;
    var id = "quiz-answer-" + n;
    var wrap = el("div", { id: id });
    out.parentNode.insertBefore(wrap, out);
    wrap.appendChild(out);
    if (explain) wrap.appendChild(explain);
    wrap.hidden = true;
    var btn = el("button", { type: "button", class: "reveal primary", "aria-expanded": "false", "aria-controls": id, text: "Show the answer" });
    wrap.parentNode.insertBefore(btn, wrap.nextSibling);
    btn.addEventListener("click", function () {
      var show = wrap.hidden;
      wrap.hidden = !show;
      btn.setAttribute("aria-expanded", String(show));
      btn.textContent = show ? "Hide the answer" : "Show the answer";
    });
  });
}

/* ---------- Names-and-values stepper ---------- */
function setupStepper(root) {
  var data = JSON.parse(root.querySelector("script[type='application/json']").textContent);
  var noscript = root.querySelector(".noscript-note");
  if (noscript) noscript.remove();
  var codeList = el("ol", { class: "stepper-code", "aria-label": "Code" });
  data.lines.forEach(function (line) { codeList.appendChild(el("li", { text: line })); });
  var pic = el("div", { class: "stepper-pic" });
  var outBox = el("div", { class: "mini-out", "aria-label": "Output so far" });
  var note = el("p", { class: "stepper-note", "aria-live": "polite" });
  var back = el("button", { type: "button", text: "← Back" });
  var next = el("button", { type: "button", class: "primary", text: "Next line →" });
  var reset = el("button", { type: "button", text: "Start again" });
  var count = el("span", { class: "step-count" });
  var left = el("div", {}, [codeList, el("p", { class: "svg-label", text: "Output so far:" }), outBox]);
  root.appendChild(el("div", { class: "stepper-grid" }, [left, el("div", {}, [pic])]));
  root.appendChild(note);
  root.appendChild(el("div", { class: "btn-row" }, [back, next, reset, count]));
  var i = 0;
  function render() {
    var st = data.steps[i];
    Array.prototype.forEach.call(codeList.children, function (li, n) {
      li.className = n === st.line ? "current" : (n < st.line ? "done" : "");
    });
    outBox.textContent = st.out || "";
    note.textContent = st.note;
    count.textContent = "Step " + (i + 1) + " of " + data.steps.length;
    back.disabled = i === 0;
    next.disabled = i === data.steps.length - 1;
    pic.textContent = "";
    pic.appendChild(drawNames(st));
  }
  back.addEventListener("click", function () { if (i > 0) { i--; render(); } });
  next.addEventListener("click", function () { if (i < data.steps.length - 1) { i++; render(); } });
  reset.addEventListener("click", function () { i = 0; render(); });
  render();
}

function drawNames(st) {
  var rowH = 50, top = 34;
  var names = st.names || [], values = st.values || [];
  var rows = Math.max(names.length, values.length, 1);
  var valX = 190;
  var widths = values.map(function (v) { return Math.max(56, v[1].length * 10 + 24); });
  var maxW = Math.max.apply(null, [120].concat(widths));
  var W = valX + maxW + 16, H = top + rows * rowH + 8;
  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
  var desc = names.length ? names.map(function (n) {
    var v = values.filter(function (x) { return x[0] === n[1]; })[0];
    return n[0] + " points to " + (v ? v[1] : "?");
  }).join("; ") : "No names yet.";
  svg.setAttribute("aria-label", desc);
  svg.appendChild(svgEl("text", { x: 12, y: 20, class: "svg-label" }, "Names"));
  svg.appendChild(svgEl("text", { x: valX, y: 20, class: "svg-label" }, "Values"));
  var valPos = {};
  values.forEach(function (v, n) {
    var y = top + n * rowH;
    var used = names.some(function (x) { return x[1] === v[0]; });
    var g = svgEl("g", { class: "svg-value", opacity: used ? 1 : 0.45 });
    g.appendChild(svgEl("rect", { x: valX, y: y, width: widths[n], height: 36, rx: 6 }));
    g.appendChild(svgEl("text", { x: valX + 12, y: y + 24, class: "mono", "font-size": 16 }, v[1]));
    svg.appendChild(g);
    valPos[v[0]] = y + 18;
  });
  names.forEach(function (nm, n) {
    var y = top + n * rowH;
    var g = svgEl("g", { class: "svg-name" });
    g.appendChild(svgEl("rect", { x: 12, y: y + 4, width: 84, height: 28, rx: 14 }));
    g.appendChild(svgEl("text", { x: 54, y: y + 23, "text-anchor": "middle", class: "mono", "font-size": 16 }, nm[0]));
    svg.appendChild(g);
    var y1 = y + 18, y2 = valPos[nm[1]], x1 = 98, x2 = valX - 4;
    svg.appendChild(svgEl("path", { d: "M" + x1 + " " + y1 + " C " + (x1 + 45) + " " + y1 + ", " + (x2 - 45) + " " + y2 + ", " + (x2 - 8) + " " + y2, class: "svg-arrow" }));
    svg.appendChild(svgEl("polygon", { points: (x2 - 10) + "," + (y2 - 6) + " " + x2 + "," + y2 + " " + (x2 - 10) + "," + (y2 + 6), class: "svg-arrowhead" }));
  });
  return svg;
}

/* ---------- Individual widgets ---------- */
var WIDGETS = {};

/* // and % with sweets in bags */
WIDGETS.divmod = function (root) {
  var a = el("input", { type: "range", min: 0, max: 30, value: 17, id: "dm-a" });
  var b = el("input", { type: "range", min: 1, max: 10, value: 5, id: "dm-b" });
  var aLab = el("label", { for: "dm-a" }), bLab = el("label", { for: "dm-b" });
  var dots = el("div", { class: "dots", "aria-hidden": "true" });
  var code = el("div", { class: "mini-code" });
  var out = el("div", { class: "mini-out", "aria-live": "polite" });
  var words = el("p", {});
  root.appendChild(el("div", { class: "control-grid" }, [el("div", {}, [aLab, a]), el("div", {}, [bLab, b])]));
  root.appendChild(dots);
  root.appendChild(words);
  root.appendChild(code);
  root.appendChild(out);
  function render() {
    var A = Number(a.value), B = Number(b.value);
    var q = Math.floor(A / B), r = A % B;   // both numbers are 0 or positive here
    aLab.textContent = "Sweets: " + A;
    bLab.textContent = "Sweets per bag: " + B;
    dots.textContent = "";
    function bag(n, isLeft) {
      var g = el("div", { class: "bag" + (isLeft ? " left" : "") });
      for (var k = 0; k < n; k++) g.appendChild(el("span", { class: "dot" }));
      return g;
    }
    for (var k = 0; k < q; k++) dots.appendChild(bag(B, false));
    if (r) dots.appendChild(bag(r, true));
    words.textContent = q + " full bag" + (q === 1 ? "" : "s") + " of " + B + ", and " + r + " sweet" + (r === 1 ? "" : "s") + " left over (the dashed bag).";
    code.textContent = "print(" + A + " // " + B + ")\nprint(" + A + " % " + B + ")";
    out.textContent = q + "\n" + r;
  }
  a.addEventListener("input", render);
  b.addEventListener("input", render);
  render();
};

/* Truthiness: values were checked with real Python (see the example next to the widget) */
WIDGETS.truthy = function (root) {
  var out = el("div", { class: "mini-out", "aria-live": "polite", text: "Pick a value above." });
  root.querySelectorAll(".chips button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var res = btn.getAttribute("data-result");
      btn.classList.remove("is-true", "is-false");
      btn.classList.add(res === "True" ? "is-true" : "is-false");
      out.textContent = "print(bool(" + btn.textContent + "))  →  " + res;
    });
  });
  root.appendChild(out);
};

/* String index ruler */
WIDGETS.ruler = function (root) {
  var input = el("input", { type: "text", value: "Python", maxlength: 12, id: "ru-word", autocomplete: "off", spellcheck: "false" });
  var startSel = el("select", { id: "ru-start" }), stopSel = el("select", { id: "ru-stop" });
  var ruler = el("div", { class: "ruler" });
  var code = el("div", { class: "mini-code" });
  var out = el("div", { class: "mini-out", "aria-live": "polite" });
  var help = el("p", {});
  root.appendChild(el("div", { class: "control-grid" }, [
    el("div", {}, [el("label", { for: "ru-word", text: "Your word (up to 12 characters)" }), input]),
    el("div", {}, [el("label", { for: "ru-start", text: "start" }), startSel]),
    el("div", {}, [el("label", { for: "ru-stop", text: "stop" }), stopSel])
  ]));
  root.appendChild(el("p", { text: "Tap a letter to read one character, or choose start and stop to cut a slice." }));
  root.appendChild(ruler);
  root.appendChild(code);
  root.appendChild(out);
  root.appendChild(help);
  var mode = "slice", picked = 0;

  function fillSelect(sel, n, current) {
    sel.textContent = "";
    sel.appendChild(el("option", { value: "", text: "(empty)" }));
    for (var k = -n; k <= n; k++) sel.appendChild(el("option", { value: String(k), text: String(k) }));
    sel.value = current;
    if (sel.value !== current) sel.value = "";
  }
  function val(sel) { return sel.value === "" ? null : Number(sel.value); }
  function word() { return input.value; }

  function render() {
    var w = word(), chars = Array.from(w), n = chars.length;
    ruler.textContent = "";
    var sel = null;
    if (mode === "slice") sel = PyLogic.sliceIndices(n, val(startSel), val(stopSel));
    chars.forEach(function (ch, k) {
      var cell = el("button", { type: "button", class: "cell", "aria-label": "index " + k + " and " + (k - n) + ": " + ch });
      var isSel = mode === "slice" ? (k >= sel.start && k < sel.stop) : k === picked;
      if (isSel) cell.classList.add("sel");
      cell.appendChild(el("span", { class: "pos", text: String(k) }));
      cell.appendChild(el("span", { class: "ch", text: ch === " " ? "␣" : ch }));
      cell.appendChild(el("span", { class: "neg", text: String(k - n) }));
      cell.addEventListener("click", function () { mode = "index"; picked = k; render(); });
      ruler.appendChild(cell);
    });
    var lit = JSON.stringify(w);
    if (mode === "index" && picked < n) {
      code.textContent = "word = " + lit + "\nprint(word[" + picked + "])\nprint(word[" + (picked - n) + "])";
      out.classList.remove("err");
      out.textContent = chars[picked] + "\n" + chars[picked];
      help.textContent = "Counting from the front starts at 0; counting from the back starts at -1. Both point at the same box.";
    } else {
      mode = "slice";
      var s = val(startSel), e = val(stopSel);
      var expr = "word[" + (s === null ? "" : s) + ":" + (e === null ? "" : e) + "]";
      var result = PyLogic.slice(w, s, e);
      code.textContent = "word = " + lit + "\nprint(" + expr + ")";
      out.classList.remove("err");
      out.textContent = result;
      help.textContent = result === ""
        ? "The slice is empty (''), so print shows an empty line. This happens when start is not before stop."
        : "The slice starts at index " + sel.start + " and stops just BEFORE index " + sel.stop + " (the stop box is not included).";
    }
  }
  function rebuild() {
    var n = Array.from(word()).length;
    var s = startSel.value || "1", e = stopSel.value || "4";
    fillSelect(startSel, n, startSel.options.length ? startSel.value : s);
    fillSelect(stopSel, n, stopSel.options.length ? stopSel.value : e);
    render();
  }
  input.addEventListener("input", function () { mode = "slice"; rebuild(); });
  startSel.addEventListener("change", function () { mode = "slice"; render(); });
  stopSel.addEventListener("change", function () { mode = "slice"; render(); });
  fillSelect(startSel, 6, "1");
  fillSelect(stopSel, 6, "4");
  render();
};

/* List playground */
WIDGETS.listplay = function (root) {
  var START = ["tea", "milk", "bread"];
  var NEW_ITEMS = ["eggs", "jam", "tea", "rice", "apple"];
  var list = START.slice(), nextItem = 0;
  var shelf = el("div", { class: "shelf", "aria-hidden": "true" });
  var listing = el("p", { class: "svg-label" });
  var code = el("div", { class: "mini-code" });
  var out = el("div", { class: "mini-out", "aria-live": "polite" });
  root.appendChild(el("div", { class: "mini-code", text: "basket = " + PyLogic.reprList(START) }));
  var row = el("div", { class: "btn-row" });
  root.appendChild(row);
  root.appendChild(shelf);
  root.appendChild(listing);
  root.appendChild(el("p", { text: "The last thing you did, as Python code, and what it prints:" }));
  root.appendChild(code);
  root.appendChild(out);

  function button(label, fn) { var b = el("button", { type: "button", class: "mono" }); b.textContent = label; b.addEventListener("click", fn); row.appendChild(b); return b; }
  var appendBtn = button("", function () { run("append", NEW_ITEMS[nextItem]); nextItem = (nextItem + 1) % NEW_ITEMS.length; labels(); });
  var insertBtn = button("", function () { run("insert0", NEW_ITEMS[nextItem]); nextItem = (nextItem + 1) % NEW_ITEMS.length; labels(); });
  button(".pop()", function () { run("pop"); });
  button(".pop(0)", function () { run("pop0"); });
  button('.remove("tea")', function () { run("remove", "tea"); });
  button(".sort()", function () { run("sort"); });
  button(".reverse()", function () { run("reverse"); });
  button("Start again", function () { list = START.slice(); nextItem = 0; labels(); code.textContent = ""; out.textContent = ""; out.classList.remove("err"); draw(); });
  function labels() {
    appendBtn.textContent = '.append("' + NEW_ITEMS[nextItem] + '")';
    insertBtn.textContent = '.insert(0, "' + NEW_ITEMS[nextItem] + '")';
  }
  function run(op, arg) {
    var r = PyLogic.listOp(list, op, arg);
    code.textContent = PyLogic.listOpCode(op, arg);
    if (r.error) {
      out.classList.add("err");
      out.textContent = r.error + "\n(The list did not change.)";
    } else {
      out.classList.remove("err");
      out.textContent = r.printed.join("\n");
    }
    list = r.list;
    draw();
  }
  function draw() {
    shelf.textContent = "";
    if (!list.length) shelf.appendChild(el("span", { class: "empty", text: "(empty list)" }));
    list.forEach(function (item, k) {
      shelf.appendChild(el("div", { class: "slot" }, [el("span", { class: "item", text: item }), el("span", { class: "idx", text: "[" + k + "]" })]));
    });
    listing.textContent = "Now: basket = " + PyLogic.reprList(list) + "   (len(basket) is " + list.length + ")";
  }
  labels();
  draw();
};

/* Venn diagram for set operators */
WIDGETS.venn = function (root) {
  var ops = root.querySelectorAll("button[data-op]");
  var code = el("div", { class: "mini-code" });
  var out = el("div", { class: "mini-out", "aria-live": "polite" });
  var words = el("p", {});
  root.appendChild(code);
  root.appendChild(out);
  root.appendChild(words);
  var regions = { a: root.querySelector("#venn-a-only"), both: root.querySelector("#venn-both"), b: root.querySelector("#venn-b-only") };
  function show(btn) {
    ops.forEach(function (o) { o.setAttribute("aria-pressed", String(o === btn)); });
    var on = btn.getAttribute("data-regions").split(" ");
    Object.keys(regions).forEach(function (k) { regions[k].setAttribute("fill-opacity", on.indexOf(k) >= 0 ? "0.85" : "0"); });
    code.textContent = "print(" + btn.getAttribute("data-op") + ")";
    out.textContent = btn.getAttribute("data-result");
    words.textContent = btn.getAttribute("data-words");
  }
  ops.forEach(function (btn) { btn.addEventListener("click", function () { show(btn); }); });
  show(ops[0]);
};

/* Which collection should I use? */
WIDGETS.decide = function (root) {
  var steps = [
    { q: "Do you want to look things up by a label (a key), like looking up a word to find its meaning?", yes: "dict", no: 1 },
    { q: "Do you only care WHETHER something is in the group (no duplicates, order does not matter)?", yes: "set", no: 2 },
    { q: "Will you need to add, remove or replace items after you create the collection?", yes: "list", no: "tuple" }
  ];
  var answers = {
    dict: ["dict", "Keys point to values, e.g. {\"tea\": 20, \"coffee\": 35}. Fast lookup by key: prices[\"tea\"]."],
    set: ["set", "Keeps each item once, e.g. {\"Asha\", \"Ravi\"}. Fast \"is it in there?\" checks with in."],
    list: ["list", "An ordered row you can change, e.g. [\"tea\", \"milk\"]. Use append, remove, sort..."],
    tuple: ["tuple", "A fixed, ordered group, e.g. (18.5, 73.8). A list would also work, but a tuple says \"this will not change\"."]
  };
  var box = el("div", { "aria-live": "polite" });
  root.appendChild(box);
  function ask(k) {
    box.textContent = "";
    var s = steps[k];
    box.appendChild(el("p", { class: "decide-q", text: (k + 1) + ". " + s.q }));
    var yes = el("button", { type: "button", class: "primary", text: "Yes" });
    var no = el("button", { type: "button", text: "No" });
    yes.addEventListener("click", function () { go(s.yes); });
    no.addEventListener("click", function () { go(s.no); });
    box.appendChild(el("div", { class: "btn-row" }, [yes, no]));
    yes.focus({ preventScroll: true });
  }
  function go(next) {
    if (typeof next === "number") { ask(next); return; }
    box.textContent = "";
    var a = answers[next];
    var ans = el("p", { class: "decide-answer" }, ["Use a ", el("code", { text: a[0] }), ". " + a[1]]);
    var again = el("button", { type: "button", text: "Ask again" });
    again.addEventListener("click", function () { ask(0); });
    box.appendChild(ans);
    box.appendChild(el("div", { class: "btn-row" }, [again]));
    again.focus({ preventScroll: true });
  }
  // first question without stealing focus on page load
  var s = steps[0];
  box.appendChild(el("p", { class: "decide-q", text: "1. " + s.q }));
  var yes = el("button", { type: "button", class: "primary", text: "Yes" });
  var no = el("button", { type: "button", text: "No" });
  yes.addEventListener("click", function () { go(s.yes); });
  no.addEventListener("click", function () { go(s.no); });
  box.appendChild(el("div", { class: "btn-row" }, [yes, no]));
};

/* Where does Python find an attribute? */
WIDGETS.lookup = function (root) {
  var boxes = { obj: root.querySelector("#lk-obj"), dog: root.querySelector("#lk-dog"), animal: root.querySelector("#lk-animal") };
  var out = el("div", { class: "mini-out", "aria-live": "polite" });
  root.appendChild(out);
  var btns = root.querySelectorAll("button[data-path]");
  function show(btn) {
    btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
    var path = btn.getAttribute("data-path").split(" ");
    var found = btn.getAttribute("data-found");
    Object.keys(boxes).forEach(function (k) {
      var box = boxes[k];
      box.classList.remove("lk-looked", "lk-found");
      if (path.indexOf(k) >= 0) box.classList.add(k === found ? "lk-found" : "lk-looked");
    });
    out.classList.toggle("err", found === "none");
    out.textContent = btn.getAttribute("data-words");
  }
  btns.forEach(function (b) { b.addEventListener("click", function () { show(b); }); });
};
