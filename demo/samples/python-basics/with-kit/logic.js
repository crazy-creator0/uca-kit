// Pure helpers that copy Python's behaviour for the interactive parts of the page.
// No page code here, so tests/test_logic.py can compare every function with real Python.
"use strict";

var PyLogic = (function () {
  // Python's // on whole numbers: divide, then round DOWN (towards minus infinity).
  function floorDiv(a, b) {
    var q = Math.floor(a / b);
    return q === 0 ? 0 : q; // turn -0 into 0
  }

  // Python's % on whole numbers: the result has the same sign as b.
  function mod(a, b) {
    var r = a - b * Math.floor(a / b);
    return r === 0 ? 0 : r;
  }

  // How Python prints a float (for the small numbers the calculator allows).
  function floatRepr(x) {
    if (Object.is(x, -0)) return "-0.0";
    if (Number.isInteger(x)) return String(x) + ".0";
    return String(x);
  }

  // One calculation as Python would print it. a and b are whole numbers.
  function calc(a, op, b) {
    if ((op === "/" || op === "//" || op === "%") && b === 0) {
      return { ok: false, error: "ZeroDivisionError" };
    }
    switch (op) {
      case "+": return { ok: true, text: String(a + b) };
      case "-": return { ok: true, text: String(a - b) };
      case "*": return { ok: true, text: String(a * b === 0 ? 0 : a * b) };
      case "/": return { ok: true, text: floatRepr(a / b) };
      case "//": return { ok: true, text: String(floorDiv(a, b)) };
      case "%": return { ok: true, text: String(mod(a, b)) };
      default: throw new Error("unknown operator " + op);
    }
  }

  // The positions Python picks for text[start:stop:step].
  // start, stop and step are whole numbers or null (left empty). Same rules as CPython.
  function sliceIndices(length, start, stop, step) {
    if (step === null) step = 1;
    if (step === 0) return null; // Python raises ValueError
    var lower = step > 0 ? 0 : -1;
    var upper = step > 0 ? length : length - 1;
    function fix(value, fallback) {
      if (value === null) return fallback;
      if (value < 0) {
        value += length;
        return value < lower ? lower : value;
      }
      return value > upper ? upper : value;
    }
    var from = fix(start, step < 0 ? upper : lower);
    var to = fix(stop, step < 0 ? lower : upper);
    var picked = [];
    for (var i = from; step > 0 ? i < to : i > to; i += step) picked.push(i);
    return picked;
  }

  // text[index] for one position: the letter, or null when Python raises IndexError.
  function indexAt(text, index) {
    var i = index < 0 ? index + text.length : index;
    if (i < 0 || i >= text.length) return null;
    return text[i];
  }

  // Values for the "True or False?" quiz. expr is Python source; answer is bool(expr).
  var TRUTHY_QUIZ = [
    { expr: "0", answer: false, why: "The number zero is falsy." },
    { expr: "7", answer: true, why: "Every number except zero is truthy." },
    { expr: "-1", answer: true, why: "Negative numbers are not zero, so they are truthy." },
    { expr: "0.0", answer: false, why: "0.0 is zero too, so it is falsy." },
    { expr: '""', answer: false, why: "An empty string (no characters at all) is falsy." },
    { expr: '" "', answer: true, why: "A space is a character, so this string is not empty." },
    { expr: '"0"', answer: true, why: "This is text containing the character 0, not the number zero. Any non-empty string is truthy." },
    { expr: '"False"', answer: true, why: "This is a non-empty string. Python does not read the word inside it." },
    { expr: "None", answer: false, why: "None always counts as false." },
    { expr: "[]", answer: false, why: "An empty list is falsy." },
    { expr: "[0]", answer: true, why: "This list has one item in it, so it is not empty. What the item is does not matter." },
    { expr: "{}", answer: false, why: "An empty dict is falsy." }
  ];

  // The "which collection?" questions. Each answer leads to another question or a result.
  var CHOOSER = {
    start: "key",
    questions: {
      key: {
        text: "Will you look things up by a label, like a name to find a phone number?",
        yes: "dict",
        no: "unique"
      },
      unique: {
        text: "Do you only care whether something is in the group, with no duplicates and no order?",
        yes: "set",
        no: "change"
      },
      change: {
        text: "Will you add, remove or replace items after you create the collection?",
        yes: "list",
        no: "tuple"
      }
    },
    results: {
      dict: { name: "dict", example: 'phone = {"Ana": "555-0101"}', why: "A dict finds a value by its key, like a word in a dictionary." },
      set: { name: "set", example: 'visitors = {"Ana", "Ben"}', why: "A set keeps each item once and answers \"is it in there?\" very quickly." },
      list: { name: "list", example: 'shopping = ["eggs", "milk"]', why: "A list keeps items in order and you can change it at any time." },
      tuple: { name: "tuple", example: "point = (3, 5)", why: "A tuple keeps items in order and cannot be changed, so nobody changes it by mistake." }
    }
  };

  return {
    floorDiv: floorDiv,
    mod: mod,
    floatRepr: floatRepr,
    calc: calc,
    sliceIndices: sliceIndices,
    indexAt: indexAt,
    TRUTHY_QUIZ: TRUTHY_QUIZ,
    CHOOSER: CHOOSER
  };
})();

if (typeof module === "object" && module.exports) module.exports = PyLogic;
