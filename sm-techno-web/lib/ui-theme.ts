export const uiThemeStorageKey = 'sm-techno-ui-theme';
export const uiThemeAttribute = 'data-ui-theme';
export type UiTheme = 'classic' | 'glassy';
export const defaultUiTheme: UiTheme = 'glassy';

// Runs from the document head, before the first paint on a direct visit.
export const uiThemeBootstrap = `(() => {
  let theme = ${JSON.stringify(defaultUiTheme)};
  try {
    const saved = localStorage.getItem(${JSON.stringify(uiThemeStorageKey)});
    if (saved === 'classic' || saved === 'glassy') theme = saved;
  } catch {}
  document.documentElement.setAttribute(${JSON.stringify(uiThemeAttribute)}, theme);
})();`;
