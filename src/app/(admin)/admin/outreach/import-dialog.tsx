'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { readFailure } from './form-utils';

interface ImportResult {
  imported: number;
  skipped: { duplicates: number; invalid: number };
  errors: Array<{ row: number; error: string }>;
}

const EXAMPLE = `companyName,contactName,email,phone,category,city,state
Smith & Associates,Jane Smith,jane@smithlaw.com,(561) 555-0100,Estate Attorney,Palm Beach,FL`;

/** Paste-or-upload CSV import; POSTs the raw text and shows the outcome. */
export function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setCsv('');
    setFileName(null);
    setResult(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File is larger than 5 MB');
      return;
    }
    file.text().then((text) => {
      setCsv(text);
      setFileName(file.name);
      setResult(null);
    }).catch(() => toast.error('Could not read that file'));
  }

  async function submit() {
    if (!csv.trim()) {
      toast.error('Paste CSV text or choose a file first');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/outreach/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        toast.error((await readFailure(res, 'Import failed')).error);
        return;
      }
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} contact${data.imported !== 1 ? 's' : ''}`);
        onImported();
      } else {
        toast.warning('Nothing was imported');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { setOpen(next); if (!next) reset(); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>
            Header row required. Columns: <code className="text-xs">companyName, contactName, email, phone, category, city, state</code>
            {' '}(title, website, notes, source, address also accepted). Rows whose email already exists are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} disabled={busy} />
              <Button size="sm" variant="outline" type="button" asChild>
                <span><FileUp className="h-3.5 w-3.5 mr-1" /> Choose file</span>
              </Button>
            </label>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            <span className="text-xs text-muted-foreground">or paste below</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CSV</Label>
            <Textarea
              value={csv}
              onChange={(e) => { setCsv(e.target.value); setResult(null); }}
              rows={10}
              className="font-mono text-xs"
              placeholder={EXAMPLE}
              disabled={busy}
            />
          </div>
          {result && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
              <p>
                <strong>{result.imported}</strong> imported ·{' '}
                <strong>{result.skipped.duplicates}</strong> duplicate{result.skipped.duplicates !== 1 ? 's' : ''} skipped ·{' '}
                <strong>{result.skipped.invalid}</strong> invalid
              </p>
              {result.errors.length > 0 && (
                <ul className="list-disc pl-4 text-destructive max-h-32 overflow-y-auto">
                  {result.errors.map((e) => <li key={`${e.row}-${e.error}`}>Row {e.row}: {e.error}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Close</Button>
            <Button onClick={submit} disabled={busy || !csv.trim()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
