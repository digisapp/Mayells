'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, BellOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface RemindMeButtonProps {
  lotId: string;
  hasReminder?: boolean;
}

export function RemindMeButton({ lotId, hasReminder: initial = false }: RemindMeButtonProps) {
  const { isAuthenticated } = useAuth();
  const [active, setActive] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!isAuthenticated) {
      toast.error('Sign in to set reminders');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/reminders', {
        method: active ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
      if (res.ok) {
        setActive(!active);
        toast.success(active ? 'Reminder removed' : 'Reminder set! We\'ll email you before this lot closes.');
      } else {
        toast.error('Failed to update reminder');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={loading}
      className={active ? 'border-champagne text-champagne hover:text-champagne' : ''}
    >
      {active ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
      {active ? 'Reminder Set' : 'Remind Me'}
    </Button>
  );
}
