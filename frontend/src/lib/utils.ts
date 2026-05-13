import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.75) return '#005461';
  if (confidence >= 0.50) return '#FAB963';
  return '#EF4444';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High';
  if (confidence >= 0.50) return 'Medium';
  return 'Low';
}

export function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.95) return '#EF4444';
  if (similarity >= 0.85) return '#F97316';
  if (similarity >= 0.70) return '#FAB963';
  return '#005461';
}

export function getSimilarityStatus(
  similarity: number
): 'critical' | 'suspected' | 'review' {
  if (similarity >= 0.95) return 'critical';
  if (similarity >= 0.85) return 'suspected';
  return 'review';
}

export function calculatePercentage(obtained: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((obtained / total) * 100);
}