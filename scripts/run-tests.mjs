// Runs each server test file in its own process, one after another, against the test database.
// (Files share one Postgres test database, so they must not run in parallel.)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join('server', 'tests');
const only = process.argv.slice(2);
const files = readdirSync(dir)
  .filter(file => file.endsWith('.test.ts'))
  .filter(file => !only.length || only.some(name => file.includes(name)))
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(dir, file)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  if (result.status !== 0) failed += 1;
}
console.log(failed ? `\n✖ ${failed} test file(s) failed` : `\n✔ all ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
