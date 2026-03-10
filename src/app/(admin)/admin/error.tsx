'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-red-600 mb-4">Something went wrong</h2>
      <pre className="bg-red-50 text-red-800 p-4 rounded-lg text-sm overflow-auto mb-4 max-h-64">
        {error.message}
        {error.digest && `\nDigest: ${error.digest}`}
        {error.stack && `\n\n${error.stack}`}
      </pre>
      <button
        onClick={reset}
        className="px-4 py-2 bg-charcoal text-white rounded-md hover:bg-charcoal/90"
      >
        Try again
      </button>
    </div>
  );
}
