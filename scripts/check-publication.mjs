import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

// A supplementary safeguard, not a claim that all sensitive information is detectable.
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const file of new Set(files)) {
  if (/(^|\/)(\.hisaab|\.venv|node_modules|\.next)\/|(^|\/)\.env(?!\.example$)|\.(dump|sqlite|pem|key)$|(^|\/)(MEMORY\.md|id_rsa|id_ed25519)$/.test(file)) findings.push([file, 'private/runtime file']);
  let data;
  try { if (!statSync(file).isFile()) continue; data = readFileSync(file); } catch { continue; }
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  const patterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
    ['credentialed database URL', /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@(?!localhost\b|127\.0\.0\.1\b)[^\s]+/],
  ];
  for (const [reason, pattern] of patterns) if (pattern.test(text)) findings.push([file, reason]);
}
if (findings.length) {
  // Print locations and categories, never the matching secret or surrounding text.
  for (const [file, reason] of findings) console.error(`${file}: ${reason}`);
  process.exitCode = 1;
} else console.log(`Publication checks passed for ${new Set(files).size} files. Manually review new data, images, logs and personal information before publishing.`);
