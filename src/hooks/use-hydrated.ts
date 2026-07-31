'use client';

import { useSyncExternalStore } from 'react';

/** 永不变化的订阅源：水合状态只在服务端 / 客户端之间切换一次 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * 用于避免 localStorage 持久化状态导致的 SSR / CSR 水合不一致。
 * 服务端渲染返回 false，客户端水合后返回 true。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
