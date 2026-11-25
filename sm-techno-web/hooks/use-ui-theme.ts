'use client';

import { useSyncExternalStore } from 'react';
import { defaultUiTheme, uiThemeAttribute, uiThemeStorageKey, type UiTheme } from '@/lib/ui-theme';

const themeChange = 'sm-techno-ui-theme-change';
const getServerTheme = (): UiTheme => defaultUiTheme;

function subscribe(listener: () => void) {
  window.addEventListener(themeChange, listener);
  return () => window.removeEventListener(themeChange, listener);
}

function getTheme(): UiTheme {
  const theme = document.documentElement.getAttribute(uiThemeAttribute);
  return theme === 'classic' || theme === 'glassy' ? theme : defaultUiTheme;
}

export function useUiTheme() {
  return useSyncExternalStore(subscribe, getTheme, getServerTheme);
}

export function setUiTheme(theme: UiTheme) {
  document.documentElement.setAttribute(uiThemeAttribute, theme);
  window.dispatchEvent(new Event(themeChange));
  try {
    localStorage.setItem(uiThemeStorageKey, theme);
  } catch {
    // The attribute still applies the selection for the current page.
  }
}
