import type { Metadata } from 'next';
import { UnsubscribeForm } from './UnsubscribeForm';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const { email } = await searchParams;
  // An optional ?email= prefills the address, so a link that carries it
  // needs only one tap to confirm.
  const defaultEmail = typeof email === 'string' ? email.slice(0, 320) : '';

  return (
    <div className="max-w-md mx-auto px-4 py-20 md:py-28">
      <h1 className="font-display text-display-md mb-4">Unsubscribe</h1>
      <UnsubscribeForm defaultEmail={defaultEmail} />
    </div>
  );
}
