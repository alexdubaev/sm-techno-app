const backendApiBaseUrl = process.env.BACKEND_API_BASE_URL?.replace(/\/$/, "");

const requestHeaderNames = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "range",
] as const;

const hopByHopResponseHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(request: Request, context: RouteContext) {
  if (!backendApiBaseUrl) {
    return Response.json(
      { detail: "Сервер приложения пока не настроен." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { path } = await context.params;
  const targetUrl = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}`,
    `${backendApiBaseUrl}/`,
  );
  targetUrl.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of requestHeaderNames) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    for (const [name, value] of backendResponse.headers) {
      if (!hopByHopResponseHeaders.has(name.toLowerCase())) {
        responseHeaders.set(name, value);
      }
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "Сервис временно недоступен. Повторите попытку." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
