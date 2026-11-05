"use strict";

// Splits CSV text into rows of fields. Handles quoted fields, commas and doubled quotes inside them, and CRLF.
// Each row keeps its 1-based physical line number.
function parseCsv(text) {
  const rows = [];
  let fields = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    fields.push(field);
    rows.push({ line: rowLine, fields });
    fields = [];
    field = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line += 1;
        field += char;
      }
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      fields.push(field);
      field = "";
    } else if (char === "\r") continue;
    else if (char === "\n") {
      endRow();
      line += 1;
      rowLine = line;
    } else field += char;
  }
  if (field !== "" || fields.length > 0) endRow();
  return rows;
}

// Kept for callers that only have one line.
function parseLine(line) {
  const rows = parseCsv(line);
  return rows.length ? rows[0].fields : [""];
}

module.exports = { parseCsv, parseLine };
