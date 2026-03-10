export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ivory dark:bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-logo text-display-lg">MAYELLS</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
