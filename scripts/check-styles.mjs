/**
 * Structural checks on styles.js, CSS in a JS template literal that neither linter nor bundler validates:
 * stray backticks (truncate the literal), brace imbalance, and rules orphaned out of @media (an indented rule at depth 0).
 *   node scripts/check-styles.mjs
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../src/pages/Stats/styles.js');

const src = await readFile(FILE, 'utf8');

const OPEN = 'export const css = `';
const start = src.indexOf(OPEN);
const end = src.lastIndexOf('`;');
if (start < 0 || end < 0) {
  console.error('check-styles: could not locate the CSS template literal.');
  process.exit(1);
}

const css = src.slice(start + OPEN.length, end);
const errors = [];

/* 1. Stray backticks would have truncated the literal. */
const backticks = (css.match(/`/g) || []).length;
if (backticks) {
  errors.push(`${backticks} stray backtick(s) inside the CSS literal — these terminate the template early. Use plain words in CSS comments.`);
}

/* 2. Brace balance, ignoring comments. */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let depth = 0;
let line = 1;
const orphans = [];

const lines = stripped.split('\n');
lines.forEach((text, i) => {
  line = i + 1;

  // A rule opening at depth 0 that is indented never belongs there.
  const opensHere = /^\s*[^{}]*\{\s*$|^\s*[^{}]*\{.*\}\s*$/.test(text);
  const indented = /^\s\s+\S/.test(text);
  const isDeclaration = /^\s*--|^\s*[a-z-]+\s*:/i.test(text);

  if (depth === 0 && opensHere && indented && !isDeclaration && text.trim()) {
    orphans.push({ line, text: text.trim().slice(0, 72) });
  }

  for (const ch of text) {
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        errors.push(`line ${line}: unbalanced "}" — closes a block that was never opened.`);
        depth = 0;
      }
    }
  }
});

if (depth !== 0) {
  errors.push(`CSS ends at brace depth ${depth}; a block was left unclosed.`);
}

// 3. `--fib-blue` (fill) is 4.39:1 and fails AA as text; text must use `--fib-blue-ink`. Only `color:` is flagged.
const blueText = [];
stripped.split('\n').forEach((text, i) => {
  const decl = text.match(/(^|[;{]|\s)color\s*:\s*var\(\s*--fib-blue\s*\)/);
  if (decl) blueText.push({ line: i + 1, text: text.trim().slice(0, 72) });
});
if (blueText.length) {
  errors.push(
    `${blueText.length} use(s) of --fib-blue as a text colour (4.39:1, below AA). ` +
    'Use --fib-blue-ink (7.62:1); --fib-blue is the fill step:\n' +
    blueText.map((o) => `    line ${o.line}: ${o.text}`).join('\n'),
  );
}

if (orphans.length) {
  errors.push(
    `${orphans.length} indented rule(s) found at top level — they escaped their @media block ` +
    'and now apply at every viewport:\n' +
    orphans.map((o) => `    line ${o.line}: ${o.text}`).join('\n'),
  );
}

if (errors.length) {
  console.error('check-styles: FAILED\n');
  errors.forEach((e) => console.error(`  • ${e}\n`));
  process.exit(1);
}

const mediaBlocks = (stripped.match(/@media/g) || []).length;
console.log(`check-styles: OK — ${lines.length} lines, ${mediaBlocks} @media blocks, braces balanced, no orphans.`);
