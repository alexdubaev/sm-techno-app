"use client";

import { useEffect } from "react";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route rendering failed", error);
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
          <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <h1 className="text-xl font-semibold">Не удалось открыть страницу</h1>
            <p className="mt-2 text-sm text-slate-600">Попробуйте обновить страницу или повторить действие.</p>
            <button type="button" onClick={reset} className="mt-5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold">
              Повторить
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
