import type { Metadata } from 'next';
import { EditorClient } from '@/components/editor/EditorClient';

export const metadata: Metadata = {
  title: '户型编辑器 · AI 风水户型助手',
  description: '标记房间、门窗与家具，实时查看规则引擎给出的布局问题与评分。',
};

export default function EditorPage() {
  return <EditorClient />;
}
