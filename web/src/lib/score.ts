/** scoreLabel turns a provider score (0-100) into the label shown on its badge. */
export function scoreLabel(score: number): string {
  if (score >= 93) return 'Excellent'
  if (score >= 88) return 'Very good'
  if (score >= 80) return 'Good'
  return 'Fair'
}
