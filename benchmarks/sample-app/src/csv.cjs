"use strict";

// Splits one line of a CSV file into fields.
function parseLine(line) {
  return line.split(",");
}

module.exports = { parseLine };
