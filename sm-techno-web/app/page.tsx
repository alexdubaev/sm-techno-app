'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';

export default function HomePage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  useEffect(() => { router.replace(isAdmin ? '/dashboard' : '/manager'); }, [isAdmin, router]);
  return <p>Открываем кабинет…</p>;
}
