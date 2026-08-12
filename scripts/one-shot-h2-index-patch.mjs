import { readFile, writeFile } from "node:fs/promises";

const path = "public/index.html";
let html = await readFile(path, "utf8");

const replacements = [
  [
    'const TIMEFRAMES = Object.freeze(["W","D","H4","H1","M30","M15","M5","M1","S30","S5"]);',
    'const TIMEFRAMES = Object.freeze(["W","D","H4","H2","H1","M30","M15","M5","M1","S30","S5"]);',
  ],
  [
    'aria-label="28 currency pairs by ten timeframes with buy and sell signals"',
    'aria-label="28 currency pairs by eleven timeframes with buy and sell signals"',
  ],
  [
    '<option value="H1" selected>H1</option>',
    '<option value="H1" selected>H1</option>\n                  <option value="H2">H2</option>',
  ],
];

for (const [before, after] of replacements) {
  const occurrences = html.split(before).length - 1;
  if (occurrences !== 1) throw new Error(`Expected exactly one index.html occurrence for: ${before}; found ${occurrences}`);
  html = html.replace(before, after);
}

if (!html.includes('"H4","H2","H1"')) throw new Error("H2 browser timeframe order not installed");
if (!html.includes('<option value="H2">H2</option>')) throw new Error("H2 Evaluation filter option not installed");
await writeFile(path, html);
