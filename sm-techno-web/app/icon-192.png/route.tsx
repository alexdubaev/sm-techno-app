import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function GET() {
  const bytes = await readFile(join(process.cwd(), 'public', 'icon-512.png'));
  // oxlint-disable-next-line next/no-img-element -- ImageResponse renders this server-side PNG.
  return new ImageResponse(<img alt="" style={{width: 192, height: 192}} src={`data:image/png;base64,${bytes.toString('base64')}`} />, {width: 192, height: 192});
}
