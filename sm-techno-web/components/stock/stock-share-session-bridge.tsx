'use client';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { loadAuthSessionFromStorage } from '@/lib/storage';
import { currentOwner, messageWorker, sameSession, shareWorker } from '@/lib/stock-share';
export function StockShareSessionBridge() {
  const {user} = useAuth();
  useEffect(() => {
    let active = true;
    const captured = loadAuthSessionFromStorage();
    let synced: Awaited<ReturnType<typeof currentOwner>> | null = null;
    let worker: ServiceWorker | null = null;
    void (async () => { try { const owner = await currentOwner(user.id); const target = await shareWorker(); if (!active || !sameSession(captured, loadAuthSessionFromStorage())) return; const ack = await messageWorker(target, {type:'sync', owner}); if (!ack.ok) return; synced = owner; worker = target; if (!active && !sameSession(captured, loadAuthSessionFromStorage())) await messageWorker(target, {type:'clear', owner}); } catch { /* Share will report recovery on use. */ } })();
    return () => { active = false; if (synced && worker && !sameSession(captured, loadAuthSessionFromStorage())) void messageWorker(worker, {type:'clear', owner:synced}).catch(() => {}); };
  }, [user.id]);
  return null;
}
