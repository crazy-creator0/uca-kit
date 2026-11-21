// Page behaviour: code colouring and the five interactive parts.
// Python-like calculations live in logic.js (PyLogic) and are tested against real Python.
"use strict";

(function () {
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  var SVG = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, text) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- 1. colour the Python code (display only; the text is unchanged) ---------- */
  var KEYWORDS = "False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" ");
  var BUILTINS = "print len type int float str bool list tuple set dict range sorted sum min max round input isinstance enumerate super divmod".split(" ");
  var TOKEN = /(#[^\n]*)|([rRfFbBuU]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlight(code) {
    var text = code.textContent, out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      out += escapeHtml(text.slice(last, m.index));
      var cls = m[1] ? "tok-com" : m[2] ? "tok-str" : m[3] ? "tok-num"
        : KEYWORDS.indexOf(m[4]) >= 0 ? "tok-kw" : BUILTINS.indexOf(m[4]) >= 0 ? "tok-bi" : "";
      out += cls ? '<span class="' + cls + '">' + escapeHtml(m[0]) + "</span>" : escapeHtml(m[0]);
      last = TOKEN.lastIndex;
    }
    code.innerHTML = out + escapeHtml(text.slice(last));
  }
  document.querySelectorAll("pre > code.language-python").forEach(highlight);

  // Error lines in outputs get their own colour.
  document.querySelectorAll("pre.output").forEach(function (pre) {
    var text = pre.textContent;
    var at = text.indexOf("Traceback (most recent call last):");
    if (at < 0) return;
    pre.innerHTML = escapeHtml(text.slice(0, at)) + '<span class="err">' + escapeHtml(text.slice(at)) + "</span>";
  });

  // Code that is wider than the screen scrolls sideways; make those boxes reachable with the keyboard.
  function markScrollable() {
    document.querySelectorAll("pre").forEach(function (pre) {
      if (pre.scrollWidth > pre.clientWidth + 1) {
        pre.setAttribute("tabindex", "0");
        pre.setAttribute("role", "region");
        pre.setAttribute("aria-label", pre.classList.contains("output") ? "Output (scrolls sideways)" : "Code (scrolls sideways)");
      } else if (pre.getAttribute("role") === "region") {
        pre.removeAttribute("tabindex");
        pre.removeAttribute("role");
        pre.removeAttribute("aria-label");
      }
    });
  }
  var resizeTimer;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(markScrollable, 200); });
  markScrollable();

  /* ---------- 2. step through: names pointing to values ---------- */
  var PROGRAMS = {
    numbers: {
      lines: ["x = 5", "y = x", "x = x + 1", "print(x, y)"],
      steps: [
        { names: {}, values: {}, note: "Nothing has run yet. Press “Next line” to run line 1." },
        { names: { x: "v5" }, values: { v5: "5" }, changed: ["x", "v5"], note: "x = 5: Python makes the value 5 and ties the tag x to it." },
        { names: { x: "v5", y: "v5" }, values: { v5: "5" }, changed: ["y"], note: "y = x: the tag y is tied to the same value that x points to. Nothing is copied." },
        { names: { x: "v6", y: "v5" }, values: { v5: "5", v6: "6" }, changed: ["x", "v6"], note: "x = x + 1: Python works out 5 + 1, which makes a new value 6, and moves only the tag x. y still points to 5." },
        { names: { x: "v6", y: "v5" }, values: { v5: "5", v6: "6" }, print: "6 5", note: "print(x, y) prints 6 5." }
      ]
    },
    lists: {
      lines: ["a = [1, 2]", "b = a", "b.append(3)", "print(a)"],
      steps: [
        { names: {}, values: {}, note: "Nothing has run yet. Press “Next line” to run line 1." },
        { names: { a: "L" }, values: { L: "[1, 2]" }, changed: ["a", "L"], note: "a = [1, 2]: Python makes a list and ties the tag a to it." },
        { names: { a: "L", b: "L" }, values: { L: "[1, 2]" }, changed: ["b"], note: "b = a: the tag b is tied to the same list. There is still only one list." },
        { names: { a: "L", b: "L" }, values: { L: "[1, 2, 3]" }, changed: ["L"], note: "b.append(3): the list itself changes. No tag moves, so a and b both point to the changed list." },
        { names: { a: "L", b: "L" }, values: { L: "[1, 2, 3]" }, print: "[1, 2, 3]", note: "print(a) prints [1, 2, 3], because a points to the list that was changed through b." }
      ]
    }
  };

  var stepper = document.getElementById("stepper");
  if (stepper) {
    var state = { program: "numbers", step: 0 };
    var codeList = stepper.querySelector(".stepper-code");
    var pic = stepper.querySelector(".stepper-pic");
    var note = stepper.querySelector(".stepper-note");
    var outSamp = stepper.querySelector(".stepper-out samp");
    var count = stepper.querySelector(".stepper-count");
    var back = stepper.querySelector('[data-step="-1"]');
    var next = stepper.querySelector('[data-step="1"]');

    function drawPicture(step) {
      var names = Object.keys(step.names);
      var values = Object.keys(step.values);
      var changed = step.changed || [];
      var rows = Math.max(names.length, values.length, 1);
      var h = rows * 60 + 10;
      var svg = svgEl("svg", { viewBox: "0 0 340 " + h, role: "img", "aria-label": describe(step) });
      var defs = svgEl("defs");
      var marker = svgEl("marker", { id: "ar-step", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto" });
      marker.appendChild(svgEl("path", { d: "M0 0L10 5L0 10z", "class": "d-head" }));
      defs.appendChild(marker);
      svg.appendChild(defs);
      if (!names.length) {
        svg.appendChild(svgEl("text", { x: "170", y: "40", "class": "d-label" }, "(no names yet)"));
      }
      values.forEach(function (v, i) {
        var y = 10 + i * 60;
        svg.appendChild(svgEl("rect", { x: "190", y: String(y), width: "140", height: "40", "class": "d-box" + (changed.indexOf(v) >= 0 ? " d-new" : "") }));
        svg.appendChild(svgEl("text", { x: "260", y: String(y + 26), "class": "d-code" }, step.values[v]));
      });
      names.forEach(function (n, i) {
        var y = 10 + i * 60;
        var g = svgEl("g", { "class": "d-tag" });
        g.appendChild(svgEl("path", { d: "M14 " + y + "H84V" + (y + 40) + "H14L2 " + (y + 20) + "Z", "class": changed.indexOf(n) >= 0 ? "d-new" : "" }));
        g.appendChild(svgEl("circle", { cx: "16", cy: String(y + 20), r: "3" }));
        g.appendChild(svgEl("text", { x: "48", y: String(y + 26) }, n));
        svg.appendChild(g);
        var ty = 10 + values.indexOf(step.names[n]) * 60 + 20 + (i - (names.length - 1) / 2) * 4;
        var sy = y + 20;
        svg.appendChild(svgEl("path", { d: "M84 " + sy + "C135 " + sy + " 135 " + ty + " 186 " + ty, "class": "d-line", "marker-end": "url(#ar-step)" }));
      });
      var wrap = el("div", { "class": "diagram" });
      wrap.appendChild(svg);
      return wrap;
    }
    function describe(step) {
      var names = Object.keys(step.names);
      if (!names.length) return "No names yet.";
      return names.map(function (n) { return n + " points to " + step.values[step.names[n]]; }).join(". ") + ".";
    }
    function render() {
      var prog = PROGRAMS[state.program];
      var step = prog.steps[state.step];
      codeList.innerHTML = "";
      prog.lines.forEach(function (line, i) {
        var li = el("li", { text: line });
        if (i === state.step - 1) { li.className = "current"; li.setAttribute("aria-current", "step"); }
        else if (i < state.step - 1) li.className = "done";
        codeList.appendChild(li);
      });
      pic.innerHTML = "";
      pic.appendChild(drawPicture(step));
      note.textContent = step.note;
      var printed = prog.steps.slice(0, state.step + 1).filter(function (s) { return s.print; }).map(function (s) { return s.print; });
      outSamp.textContent = printed.length ? printed.join("\n") : "(nothing yet)";
      count.textContent = state.step === 0 ? "Not started" : "Ran line " + state.step + " of " + prog.lines.length;
      back.disabled = state.step === 0;
      next.textContent = state.step === prog.steps.length - 1 ? "Start again" : "Next line →";
    }
    stepper.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      if (btn.dataset.program) {
        state.program = btn.dataset.program;
        state.step = 0;
        stepper.querySelectorAll("[data-program]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      } else if (btn.dataset.step) {
        var last = PROGRAMS[state.program].steps.length - 1;
        if (btn.dataset.step === "1" && state.step === last) state.step = 0;
        else state.step = Math.max(0, Math.min(last, state.step + Number(btn.dataset.step)));
      }
      render();
    });
    render();
  }

  /* ---------- 3. truthy quiz ---------- */
  var quiz = document.getElementById("truthy");
  if (quiz) {
    var list = quiz.querySelector(".quiz-list");
    var score = quiz.querySelector(".quiz-score");
    var answers = {};
    PyLogic.TRUTHY_QUIZ.forEach(function (item, i) {
      var feedback = el("p", { "class": "quiz-feedback", "aria-live": "polite" });
      var buttons = el("div", { "class": "quiz-buttons", role: "group", "aria-label": "bool(" + item.expr + ")" });
      ["True", "False"].forEach(function (label) {
        var b = el("button", { type: "button", "aria-pressed": "false", text: label });
        b.addEventListener("click", function () {
          var guess = label === "True";
          answers[i] = guess === item.answer;
          buttons.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          feedback.className = "quiz-feedback " + (answers[i] ? "right" : "wrong");
          feedback.innerHTML = "";
          feedback.appendChild(el("strong", { text: answers[i] ? "Right. " : "Not quite. " }));
          feedback.appendChild(document.createTextNode("bool(" + item.expr + ") is " + (item.answer ? "True" : "False") + ". " + item.why));
          var done = Object.keys(answers).length;
          var right = Object.keys(answers).filter(function (k) { return answers[k]; }).length;
          score.textContent = right + " right out of " + done + " answered (" + PyLogic.TRUTHY_QUIZ.length + " in total).";
        });
        buttons.appendChild(b);
      });
      var row = el("div", { "class": "quiz-row" }, [el("code", { text: "bool(" + item.expr + ")" }), buttons]);
      list.appendChild(el("li", null, [row, feedback]));
    });
  }

  /* ---------- 4. division calculator ---------- */
  var calcBox = document.getElementById("divcalc");
  if (calcBox) {
    var inA = document.getElementById("calc-a");
    var inB = document.getElementById("calc-b");
    var results = calcBox.querySelector(".calc-results");
    var calcPic = calcBox.querySelector(".calc-pic");
    var WHOLE = /^-?\d{1,3}$/;
    function updateCalc() {
      results.innerHTML = "";
      calcPic.innerHTML = "";
      var ta = inA.value.trim(), tb = inB.value.trim();
      if (!WHOLE.test(ta) || !WHOLE.test(tb)) {
        results.appendChild(el("p", { "class": "calc-msg", text: "Type a whole number from -999 to 999 in both boxes." }));
        return;
      }
      var a = Number(ta), b = Number(tb);
      if (b === 0) {
        results.appendChild(el("p", { "class": "calc-msg", text: "b is 0. Python stops with a ZeroDivisionError for " + a + " // 0, " + a + " % 0 and " + a + " / 0: you cannot divide by zero." }));
        return;
      }
      var table = el("table");
      table.appendChild(el("caption", { text: "What Python prints" }));
      var tbody = el("tbody");
      ["//", "%", "/"].forEach(function (op) {
        var r = PyLogic.calc(a, op, b);
        tbody.appendChild(el("tr", null, [el("td", null, [el("code", { text: "print(" + a + " " + op + " " + b + ")" })]), el("td", { text: r.text })]));
      });
      table.appendChild(tbody);
      results.appendChild(table);
      var q = PyLogic.floorDiv(a, b), r = PyLogic.mod(a, b);
      results.appendChild(el("p", { "class": "calc-check", text: "Check: " + q + " * " + b + " + " + r + " = " + (q * b + r) + "  (that is a again)" }));
      if (a >= 0 && a <= 60 && b >= 1 && b <= 12) {
        for (var i = 0; i < q; i++) {
          var bag = el("div", { "class": "bagbox" });
          for (var j = 0; j < b; j++) bag.appendChild(el("span", { "class": "sweet" }));
          calcPic.appendChild(bag);
        }
        if (r > 0) {
          var left = el("div", { "class": "bagbox left" });
          for (var k = 0; k < r; k++) left.appendChild(el("span", { "class": "sweet" }));
          calcPic.appendChild(left);
        }
        calcPic.appendChild(el("p", { "class": "pic-caption", text: q + (q === 1 ? " full bag" : " full bags") + " of " + b + (r ? ", and " + r + " left over (yellow)." : ", nothing left over.") }));
      }
    }
    inA.addEventListener("input", updateCalc);
    inB.addEventListener("input", updateCalc);
    updateCalc();
  }

  /* ---------- 5. slicing explorer ---------- */
  var slicer = document.getElementById("slicer");
  if (slicer) {
    var WORD = "PYTHON";
    var fields = ["sl-start", "sl-stop", "sl-step"].map(function (id) { return document.getElementById(id); });
    var sliceOut = slicer.querySelector(".slice-result");
    var cells = slicer.querySelectorAll(".letter");
    var NUM = /^-?\d{1,2}$/;
    function updateSlice() {
      sliceOut.innerHTML = "";
      cells.forEach(function (c) { c.classList.remove("picked"); var o = c.querySelector(".order"); if (o) o.remove(); });
      var vals = [], bad = null;
      fields.forEach(function (f, i) {
        var t = f.value.trim();
        if (t === "") vals.push(null);
        else if (NUM.test(t)) vals.push(Number(t));
        else { vals.push(null); if (!bad) bad = ["start", "stop", "step"][i]; }
      });
      if (bad) {
        sliceOut.appendChild(el("p", { "class": "calc-msg", text: bad + " must be a whole number from -99 to 99, or empty." }));
        return;
      }
      var show = function (v) { return v === null ? "" : String(v); };
      var expr = "word[" + show(vals[0]) + ":" + show(vals[1]) + (fields[2].value.trim() === "" ? "" : ":" + show(vals[2])) + "]";
      sliceOut.appendChild(el("pre", { "class": "slice-code" }, [el("code", { text: "print(" + expr + ")" })]));
      var picked = PyLogic.sliceIndices(WORD.length, vals[0], vals[1], vals[2]);
      if (picked === null) {
        sliceOut.appendChild(el("pre", { "class": "output" }, [el("span", { "class": "err", text: "ValueError: slice step cannot be zero" })]));
        sliceOut.appendChild(el("p", { "class": "explain", text: "A step of 0 would never move, so Python refuses it." }));
        return;
      }
      var text = picked.map(function (i) { return WORD[i]; }).join("");
      sliceOut.appendChild(el("pre", { "class": "output", text: text === "" ? " " : text }));
      picked.forEach(function (i, n) {
        cells[i].classList.add("picked");
        cells[i].appendChild(el("span", { "class": "order", text: String(n + 1) }));
      });
      sliceOut.appendChild(el("p", { "class": "explain", text: text === ""
        ? "Nothing was picked, so print shows an empty line. The slice is the empty string \"\"."
        : "Python picked index " + picked.join(", ") + (picked.length > 1 ? ", in that order (see the small numbers)." : ".") }));
    }
    fields.forEach(function (f) { f.addEventListener("input", updateSlice); });
    slicer.querySelectorAll("[data-slice]").forEach(function (b) {
      b.addEventListener("click", function () {
        var parts = b.dataset.slice.split(",");
        fields.forEach(function (f, i) { f.value = parts[i]; });
        updateSlice();
      });
    });
    updateSlice();
  }

  /* ---------- 6. which collection? ---------- */
  var chooser = document.getElementById("chooser");
  if (chooser) {
    var body = chooser.querySelector(".chooser-body");
    var C = PyLogic.CHOOSER;
    var trail = [];
    function show(key) {
      body.innerHTML = "";
      if (trail.length) {
        var ul = el("ul", { "class": "chooser-trail" });
        trail.forEach(function (t) { ul.appendChild(el("li", { text: t })); });
        body.appendChild(ul);
      }
      var focusTarget;
      if (C.questions[key]) {
        var q = C.questions[key];
        focusTarget = el("p", { "class": "chooser-q", tabindex: "-1", text: q.text });
        body.appendChild(focusTarget);
        var actions = el("div", { "class": "chooser-actions" });
        [["Yes", q.yes], ["No", q.no]].forEach(function (pair) {
          var b = el("button", { type: "button", text: pair[0] });
          b.addEventListener("click", function () { trail.push(q.text + " " + pair[0] + "."); show(pair[1]); });
          actions.appendChild(b);
        });
        body.appendChild(actions);
      } else {
        var res = C.results[key];
        focusTarget = el("div", { "class": "chooser-result", tabindex: "-1" }, [
          el("span", { text: "Use a" }),
          el("span", { "class": "big", text: res.name }),
          el("p", { text: res.why }),
          el("code", { text: res.example })
        ]);
        body.appendChild(focusTarget);
        var again = el("button", { type: "button", text: "Start over" });
        again.addEventListener("click", function () { trail = []; show(C.start); });
        body.appendChild(again);
      }
      return focusTarget;
    }
    show(C.start);
    chooser.addEventListener("click", function (e) {
      if (e.target.closest("button")) {
        var target = body.querySelector("[tabindex='-1']");
        if (target) target.focus();
      }
    });
  }
})();
