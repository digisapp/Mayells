import type { Viewport } from 'next';

// The sign-in screens are zinc-950 edge to edge; tint Safari's toolbar to match.
export const viewport: Viewport = {
  themeColor: '#09090B',
};

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-logo text-display-lg text-white">MAYELLS</h1>
          <p className="text-zinc-400 text-sm mt-2 tracking-widest uppercase">Administration</p>
        </div>
        {children}
      </div>
    </div>
  );
}
