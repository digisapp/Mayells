// Standard auction bid increment table
// All values in cents
const INCREMENT_TABLE = [
  { from: 0, to: 9_999, increment: 1_000 },           // $0-$99: $10
  { from: 10_000, to: 49_999, increment: 2_500 },      // $100-$499: $25
  { from: 50_000, to: 99_999, increment: 5_000 },      // $500-$999: $50
  { from: 100_000, to: 199_999, increment: 10_000 },    // $1K-$2K: $100
  { from: 200_000, to: 499_999, increment: 20_000 },    // $2K-$5K: $200
  { from: 500_000, to: 999_999, increment: 50_000 },    // $5K-$10K: $500
  { from: 1_000_000, to: 1_999_999, increment: 100_000 }, // $10K-$20K: $1,000
  { from: 2_000_000, to: 4_999_999, increment: 200_000 }, // $20K-$50K: $2,000
  { from: 5_000_000, to: 9_999_999, increment: 500_000 }, // $50K-$100K: $5,000
  { from: 10_000_000, to: Infinity, increment: 1_000_000 }, // $100K+: $10,000
];

export function getMinIncrement(currentBidCents: number): number {
  for (const tier of INCREMENT_TABLE) {
    if (currentBidCents >= tier.from && currentBidCents <= tier.to) {
      return tier.increment;
    }
  }
  return 1_000_000; // Default: $10,000
}

export function getNextMinBid(currentBidCents: number): number {
  return currentBidCents + getMinIncrement(currentBidCents);
}

export function getQuickBidOptions(currentBidCents: number): number[] {
  const increment = getMinIncrement(currentBidCents);
  return [
    currentBidCents + increment,
    currentBidCents + increment * 2,
    currentBidCents + increment * 5,
  ];
}
