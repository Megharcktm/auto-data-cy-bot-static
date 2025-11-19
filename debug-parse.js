// debug-parse.js - uses @babel/parser directly (JSX-aware)
const fs = require("fs");
const path = require("path");
const babelParser = require("@babel/parser");

const file = process.argv[2] || "sample-component.jsx";
if (!fs.existsSync(file)) {
  console.error("File not found:", file);
  process.exit(2);
}
const code = fs.readFileSync(file, "utf8");

const pluginSets = [
  [
    "jsx",
    "typescript",
    "classProperties",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "decorators-legacy",
  ],
  [
    "jsx",
    "classProperties",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "dynamicImport",
  ],
];

function tryParse(plugins) {
  return babelParser.parse(code, {
    sourceType: "module",
    plugins,
  });
}

let parsed = false;
for (const plugins of pluginSets) {
  try {
    tryParse(plugins);
    console.log("Parsed OK with plugins:", plugins.join(", "));
    parsed = true;
    break;
  } catch (e) {
    console.error(
      `Parse attempt failed with plugins [${plugins.join(", ")}]:`,
      e.message
    );
    if (e.loc) {
      const L = e.loc.line;
      const lines = code.split("\\n");
      const start = Math.max(1, L - 6);
      const end = Math.min(lines.length, L + 6);
      console.error(`Context (lines ${start}-${end}):`);
      for (let i = start; i <= end; i++) {
        const prefix = i === L ? ">>" : "  ";
        console.error(
          prefix + String(i).padStart(4) + ": " + (lines[i - 1] || "")
        );
      }
    } else {
      console.error("No location info. Full stack:\\n", e.stack);
    }
  }
}

if (!parsed) {
  console.error(
    "All parse attempts failed. Fix the file (see context) and try again."
  );
  process.exit(1);
}
