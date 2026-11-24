export const uiThemeStorageKey = 'sm-techno-ui-theme';
export const uiThemeAttribute = 'data-ui-theme';
export type UiTheme = 'classic' | 'glassy';

// Runs from the document head, before the first paint on a direct visit.
export const uiThemeBootstrap = `try {
  const theme = localStorage.getItem(${JSON.stringify(uiThemeStorageKey)});
  if (theme === 'glassy') document.documentElement.setAttribute(${JSON.stringify(uiThemeAttribute)}, theme);
} catch {}`;
