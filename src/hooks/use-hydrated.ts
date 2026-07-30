'use client';

import { useEffect, useState } from 'react';

/**
 * 用于避免 localStorage 持久化状态导致的 SSR / CSR 水合不一致。
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
