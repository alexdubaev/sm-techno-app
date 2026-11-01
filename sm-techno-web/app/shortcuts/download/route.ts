import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function GET() {
  const bytes = await readFile(join(process.cwd(), 'public', 'shortcuts', 'sm-techno-stock.shortcut'));
  return new Response(bytes, { headers: {'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="sm-techno-stock.shortcut"; filename*=UTF-8''${encodeURIComponent('Поделиться СМ ТЕХНО.shortcut')}`, 'Cache-Control': 'no-store'} });
}
