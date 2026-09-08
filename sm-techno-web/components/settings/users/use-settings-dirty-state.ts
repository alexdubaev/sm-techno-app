'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The callback boundary lets the route supply navigation without importing a router here. */
export function useSettingsDirtyState(dirty: boolean) {
  const pending = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const request = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      pending.current = action;
      setConfirming(true);
    },
    [dirty],
  );

  useEffect(() => {
    if (!dirty) return;
    let allowUnload = false;
    let allowTraversal = false;
    let revertingHistory = false;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowUnload) {
        event.preventDefault();
        // Legacy browsers still need returnValue alongside preventDefault.
        // oxlint-disable-next-line typescript/no-deprecated
        event.returnValue = '';
      }
    };
    type NavigateEvent = Event & {
      navigationType: string;
      destination: { key: string };
    };
    const navigation = (
      window as Window & {
        navigation?: EventTarget & { traverseTo: (key: string) => unknown };
      }
    ).navigation;
    const onNavigate = (raw: Event) => {
      const event = raw as NavigateEvent;
      if (event.navigationType !== 'traverse' || !event.cancelable) return;
      if (allowTraversal) {
        allowTraversal = false;
        return;
      }
      event.preventDefault();
      request(() => {
        allowTraversal = true;
        allowUnload = true;
        navigation?.traverseTo(event.destination.key);
      });
    };
    // Older browsers do not offer cancellable navigation. Warn synchronously before
    // the router handles popstate and restore the previous entry on cancellation.
    const onPopState = (event: PopStateEvent) => {
      if (revertingHistory) {
        revertingHistory = false;
        return;
      }
      if (
        window.confirm('Есть несохранённые изменения. Выйти без сохранения?')
      ) {
        allowUnload = true;
        return;
      }
      event.stopImmediatePropagation();
      revertingHistory = true;
      window.history.go(1);
    };
    const onLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.download ||
        target.target === '_blank' ||
        target.href === window.location.href ||
        target.protocol === 'javascript:'
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      request(() => {
        allowUnload = true;
        window.location.assign(target.href);
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onLink, true);
    if (navigation) navigation.addEventListener('navigate', onNavigate);
    else window.addEventListener('popstate', onPopState, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onLink, true);
      navigation?.removeEventListener('navigate', onNavigate);
      window.removeEventListener('popstate', onPopState, true);
    };
  }, [dirty, request]);

  const cancel = useCallback(() => {
    pending.current = null;
    setConfirming(false);
  }, []);
  const discard = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    setConfirming(false);
    action?.();
  }, []);
  return { request, confirming, cancel, discard };
}
