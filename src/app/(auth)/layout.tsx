export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory dark:bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-display-lg tracking-tight">MAYELLS</h1>
          <p className="text-muted-foreground mt-1">The Auction House of the Future</p>
        </div>
        {children}
      </div>
    </div>
  );
}
