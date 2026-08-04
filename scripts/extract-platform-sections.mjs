import { readFile, mkdir, writeFile } from 'node:fs/promises';

const targets = [
  ['public/index.html', [
    'Open Positions',
    'id="chart"',
    'id="eventChart"',
    'function htlBuild',
    'function causalIndicatorSetFast',
    'function currentOptimizer',
    'function renderStrategyConfiguration',
    'function drawChart',
    'function eventDraw',
    'function renderPositions',
    'function renderOpenPositions',
    'function renderEngineStatus',
    'function saveEngineConfig',
    'function executeSelectedCandidate',
    'function bindEvents',
  ]],
  ['src/engine.js', [
    'function htlBuild',
    'function htlCausal',
    'function strategyEvents',
    'function currentOptimizer',
    'async execute',
    'async reconcile',
    'async optimizeDataset',
    'async tick',
  ]],
  ['src/worker.js', [
    'async function handleManualOrder',
    'async function handleProxy',
    'async function handleCandles',
    'export default',
  ]],
];

const output = [];
for (const [path, markers] of targets) {
  const source = await readFile(path, 'utf8');
  output.push(`\n===== ${path} (${source.length} chars) =====\n`);
  for (const marker of markers) {
    const index = source.indexOf(marker);
    output.push(`\n--- ${marker} @ ${index} ---\n`);
    if (index < 0) continue;
    const start = Math.max(0, index - 3000);
    const end = Math.min(source.length, index + 10000);
    output.push(source.slice(start, end));
    output.push('\n');
  }
}
await mkdir('tmp', { recursive: true });
await writeFile('tmp/platform-sections.txt', output.join(''), 'utf8');
