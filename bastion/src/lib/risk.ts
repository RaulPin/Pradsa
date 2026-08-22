import type { Risk } from '@/types';

export type RiskLevel = 'low' | 'med' | 'high' | 'crit';

/** Puntaje 1..25 a partir de probabilidad e impacto (1..5 cada uno). */
export function riskScore(likelihood: number, impact: number): number {
  return likelihood * impact;
}

/** Nivel a partir del puntaje, con el mismo corte del mapa de calor. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 17) return 'crit';
  if (score >= 11) return 'high';
  if (score >= 5) return 'med';
  return 'low';
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: 'Bajo',
  med: 'Medio',
  high: 'Alto',
  crit: 'Crítico',
};

/** Puntaje residual si hay valores residuales; si no, el inherente. */
export function residualScore(r: Pick<Risk, 'likelihood' | 'impact' | 'residual_likelihood' | 'residual_impact'>): number {
  const l = r.residual_likelihood ?? r.likelihood;
  const i = r.residual_impact ?? r.impact;
  return l * i;
}

/** Valor del activo = máximo de C-I-D (1..3). */
export function assetValue(c: number, i: number, a: number): number {
  return Math.max(c, i, a);
}

export const CIA_LABELS: Record<number, string> = { 1: 'Bajo', 2: 'Medio', 3: 'Alto' };
