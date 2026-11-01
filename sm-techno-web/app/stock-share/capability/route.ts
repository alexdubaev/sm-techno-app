export async function GET() { return Response.json({version: 1}, {headers: {'Cache-Control': 'no-store'}}); }
