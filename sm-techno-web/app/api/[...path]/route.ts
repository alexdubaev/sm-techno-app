import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
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

async function streamNative(request: Request, target: URL, headers: Headers): Promise<Response> {
  return new Promise((resolve, reject) => {
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const upstream = send(target, { method: request.method, headers: Object.fromEntries(headers) }, (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (!hopByHopResponseHeaders.has(name.toLowerCase()) && value !== undefined) {
          responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
      }
      responseHeaders.set("Cache-Control", "no-store");
      resolve(new Response(Readable.toWeb(incoming) as ReadableStream, { status: incoming.statusCode ?? 502, headers: responseHeaders }));
    });
    upstream.on("error", reject);
    if (request.body) {
      const body = Readable.fromWeb(request.body as import("node:stream/web").ReadableStream);
      body.on("error", () => upstream.destroy());
      body.pipe(upstream);
    } else upstream.end();
  });
}

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
    const nativeShortcut = request.method === "POST" && path.length === 3 && path[0] === "shortcuts" && path[1] === "stock" && (path[2] === "intake" || path[2] === "resolve");
    if (nativeShortcut) return await streamNative(request, targetUrl, headers);
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
