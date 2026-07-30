'use client';

import { useMemo } from 'react';
import { analyzePlan } from '@/lib/rules/engine';
import type { AnalysisResult, Project, ScenarioKey } from '@/lib/types';

export function useAnalysis(
  project: Project | null,
  scenario: ScenarioKey,
): AnalysisResult | null {
  const elements = project?.scenarios[scenario].elements;
  const ppm = project?.pixelsPerMeter;
  const north = project?.northAngle;
  const canvas = project?.canvas;

  return useMemo(() => {
    if (!elements || !ppm || north === undefined || !canvas) return null;
    return analyzePlan(elements, {
      pixelsPerMeter: ppm,
      northAngle: north,
      canvas,
    });
  }, [elements, ppm, north, canvas]);
}
