import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const key = process.env.CLAUDE_API;
if (!key || key.length < 15)
  throw new Error('Load the backend environment to run the secret check.');
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path);
    else paths.push(path);
  }
}
if (existsSync('dist')) walk('dist');
let leaked = false;
for (const path of paths) {
  if (existsSync(path) && readFileSync(path).includes(Buffer.from(key))) {
    console.error('Credential found in:', path);
    leaked = true;
  }
}
if (paths.includes('.env') || paths.some(p=> p.startsWith('.local/')))
  throw new Error('Private environment or runtime ledger is tracked.');
if (leaked) process.exit(1);
console.log(
  `PASS: backend key absent from ${paths.length} tracked/exported files; private environment and ledger are untracked.`);
