// Run only inside the isolated Playwright launcher, after npm run build.
import { cpSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const standalone = path.join(frontend, '.next/standalone');
if (!existsSync(path.join(standalone, 'server.js')))
  throw new Error('Run npm run build before production browser tests.');
for (const directory of ['public', '.next/static']) {
  cpSync(path.join(frontend, directory), path.join(standalone, directory), {
    recursive: true,
  });
}
const result = spawnSync(
  process.execPath,
  [path.join(standalone, 'server.js')],
  {
    cwd: standalone,
    stdio: 'inherit',
    env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: '13000' },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
