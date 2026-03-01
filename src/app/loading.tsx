export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
        <p className="font-display text-sm text-muted-foreground tracking-wider">LOADING</p>
      </div>
    </div>
  );
}
