export async function POST(request: Request) { return Response.redirect(new URL('/stock?share=unavailable', request.url), 303); }
