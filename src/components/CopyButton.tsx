'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button type="button" onClick={copy} className="btn py-1 text-[13px]" aria-live="polite">
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked by browser' : label}
    </button>
  );
}
