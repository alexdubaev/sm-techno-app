'use client';

import { useSyncExternalStore } from 'react';
import { uiThemeAttribute, uiThemeStorageKey, type UiTheme } from '@/lib/ui-theme';

const themeChange = 'sm-techno-ui-theme-change';
const defaultTheme = (): UiTheme => 'classic';

function subscribe(listener: () => void) {
  window.addEventListener(themeChange, listener);
  return () => window.removeEventListener(themeChange, listener);
}

function getTheme(): UiTheme {
  return document.documentElement.getAttribute(uiThemeAttribute) === 'glassy' ? 'glassy' : 'classic';
}

export function useUiTheme() {
  return useSyncExternalStore(subscribe, getTheme, defaultTheme);
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
