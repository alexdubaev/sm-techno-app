'use client';

import { setUiTheme, useUiTheme } from '@/hooks/use-ui-theme';

export function AppearanceSettings() {
  const theme = useUiTheme();

  return (
    <section className="app-surface mb-4 rounded-2xl border border-[var(--border-color)] bg-white p-4" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="text-lg font-semibold">Внешний вид</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Тема сохраняется в этом браузере.</p>
      <fieldset className="app-segmented mt-3 inline-flex gap-1 p-1">
        <legend className="sr-only">Тема оформления</legend>
        <button type="button" className="app-segmented__item min-h-10 px-3" aria-pressed={theme === 'classic'} onClick={() => setUiTheme('classic')}>
          Классическая
        </button>
        <button type="button" className="app-segmented__item min-h-10 px-3" aria-pressed={theme === 'glassy'} onClick={() => setUiTheme('glassy')}>
          Стекло
        </button>
      </fieldset>
    </section>
  );
}
