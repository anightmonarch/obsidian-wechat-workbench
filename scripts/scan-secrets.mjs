import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'coverage',
  'main.js',
  'package-lock.json',
]);
const TEXT_EXTENSIONS = new Set([
  '.css', '.env', '.js', '.json', '.jsx', '.md', '.mjs', '.mts',
  '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const ALLOWED_SYNTHETIC_MARKERS = [
  /synthetic-/i,
  /must-not-load/i,
  /TEST_[A-Z_]+/,
  /wechat-workbench-(?:app-secret|access-token|image-api-key)/i,
];
const RULES = [
  { name: 'private-key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { name: 'openai-style-key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/ },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'bearer-token', pattern: /authorization\s*:\s*bearer\s+[A-Za-z0-9._~-]{16,}/i },
  {
    name: 'secret-assignment',
    pattern: /(?:appsecret|access[_ -]?token|api[_ -]?key)\s*[:=]\s*["'][^"']{16,}["']/i,
  },
];

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function isSynthetic(line) {
  return ALLOWED_SYNTHETIC_MARKERS.some(pattern => pattern.test(line));
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, path));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      const info = await stat(path);
      if (info.size <= 2 * 1024 * 1024) files.push(path);
    }
  }
  return files;
}

async function scan(root) {
  const files = await collectFiles(root);
  const findings = [];

  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (isSynthetic(line)) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({ file: relative(root, file), line: index + 1, rule: rule.name });
        }
      }
    });
  }

  if (findings.length > 0) {
    process.stderr.write(`Potential secret detected in ${findings.length} location(s). Values are redacted.\n`);
    for (const finding of findings) {
      process.stderr.write(`${finding.file}:${finding.line} [${finding.rule}]\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Sensitive information scan passed (${files.length} files).\n`);
}

try {
  const root = resolve(argumentValue('--root') ?? process.cwd());
  await scan(root);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown sensitive information scan failure';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
