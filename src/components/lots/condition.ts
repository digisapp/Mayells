const CONDITION_LABELS: Record<string, string> = {
  mint: 'Mint',
  excellent: 'Excellent',
  very_good: 'Very Good',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  as_is: 'As Is',
};

/** Display label for a `lot_condition` enum value ("very_good" → "Very Good"). */
export function formatCondition(condition: string): string {
  return (
    CONDITION_LABELS[condition] ??
    condition
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}
