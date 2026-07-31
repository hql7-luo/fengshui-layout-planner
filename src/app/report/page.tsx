import type { Metadata } from 'next';
import { ReportClient } from '@/components/analysis/ReportClient';

export const metadata: Metadata = {
  title: '分析报告 · AI 风水户型助手',
  description: '基于确定性规则引擎生成的户型布局分析报告，可直接打印或导出 PDF。',
};

export default function ReportPage() {
  return <ReportClient />;
}
