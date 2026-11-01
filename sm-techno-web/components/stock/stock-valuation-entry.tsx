'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { StockValuationPanel } from '@/components/stock/stock-valuation-panel';
import { currentOwner, messageWorker, shareWorker } from '@/lib/stock-share';
import { textStockFile, validateStockFile } from '@/lib/stock-intake-source';
export function StockValuationEntry() {
  const {user} = useAuth();
  const [source, setSource] = useState<File | null>(null);
  const [error, setError] = useState('');
  const claim = useRef<Promise<File> | null>(null);
  useEffect(() => {
    let active = true;
    const recovery = 'Передача недоступна или истекла. Войдите в нужный аккаунт и отправьте файл заново либо выберите источник ниже.';
    if (!claim.current) {
      const url = new URL(window.location.href), nonce = url.searchParams.get('share');
      if (!nonce) return;
      url.searchParams.delete('share'); window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      claim.current = (async () => {
        if (!/^[0-9a-f]{32}$/.test(nonce)) throw Error('nonce');
        const owner = await currentOwner(user.id); const worker = await shareWorker(); const freshOwner = await currentOwner(user.id);
        if (owner.hash !== freshOwner.hash || owner.actor !== freshOwner.actor) throw Error('session');
        const reply = await messageWorker(worker, {type:'claim', nonce, owner:freshOwner});
        const finalOwner = await currentOwner(user.id);
        if (!reply.ok || finalOwner.hash !== freshOwner.hash || finalOwner.actor !== freshOwner.actor || !reply.payload) throw Error('claim');
        return typeof reply.payload === 'string' ? textStockFile(reply.payload) : validateStockFile(reply.payload);
      })();
    }
    void claim.current.then(file => { if (active) setSource(file); }, () => { if (active) setError(recovery); });
    return () => { active = false; };
  }, [user.id]);
  return <StockValuationPanel key={source ? "received" : error ? "error" : "empty"} receivedSource={source} receivedError={error} />;
}
