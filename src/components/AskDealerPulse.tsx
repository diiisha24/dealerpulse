'use client';

import clsx from 'clsx';
import { usePathname, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CURATED_QUESTIONS } from '@/lib/curatedQuestions';
import { formatMonth } from '@/lib/format';

interface NavBranch {
  id: string;
  name: string;
}

interface NavRep {
  id: string;
  name: string;
  branchId: string;
}

interface Props {
  branches: NavBranch[];
  reps: NavRep[];
  /** First and last month in the data (YYYY-MM), for the default range label. */
  months: { first: string; last: string };
}

type Mode = 'live' | 'offline';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** Messages are tied to the scope they were asked in; history only sends the current one. */
  scopeKey: string;
  error?: boolean;
  unverified?: string[];
}

interface Scope {
  key: string;
  label: string;
  from?: string;
  to?: string;
  branchId?: string;
  repId?: string;
}

const MAX_CHARS = 500;
const HISTORY_TURNS = 4;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function rangeLabel(from: string, to: string): string {
  if (from === to) return formatMonth(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatMonth(from, sameYear)}–${formatMonth(to)}`;
}

/** Reads the branch or rep from the path and the range from ?from=&to=. */
function useScope({ branches, reps, months }: Props): Scope {
  const pathname = usePathname();
  const params = useSearchParams();
  const rawFrom = params.get('from') ?? undefined;
  const rawTo = params.get('to') ?? undefined;
  const from = rawFrom && MONTH_RE.test(rawFrom) ? rawFrom : undefined;
  const to = rawTo && MONTH_RE.test(rawTo) ? rawTo : undefined;
  const [lo, hi] = [from ?? months.first, to ?? months.last].sort() as [string, string];
  const period = rangeLabel(lo, hi);

  const branchMatch = /^\/branches\/([^/]+)/.exec(pathname);
  const repMatch = /^\/reps\/([^/]+)/.exec(pathname);
  const branch = branchMatch ? branches.find((b) => b.id === decodeURIComponent(branchMatch[1] ?? '')) : undefined;
  const rep = repMatch ? reps.find((r) => r.id === decodeURIComponent(repMatch[1] ?? '')) : undefined;

  let label = 'All branches';
  if (rep) label = rep.name;
  else if (branch) label = branch.name;

  return {
    key: `${rep?.id ?? branch?.id ?? 'group'}|${lo}|${hi}`,
    label: `${label} · ${period}`,
    from,
    to,
    branchId: rep ? undefined : branch?.id,
    repId: rep?.id,
  };
}

/** Bold (**text**) inside a line, rendered as React nodes; everything else is plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** Paragraphs and bullet lists from plain text. No HTML is ever injected. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const items = lines.filter((l) => BULLET_RE.test(l));
        const lead = lines.filter((l) => !BULLET_RE.test(l));
        if (items.length === 0) return <p key={i}>{inline(lines.join(' ').replace(/^#+\s*/, ''))}</p>;
        return (
          <div key={i} className="space-y-1">
            {lead.length > 0 && <p>{inline(lead.join(' ').replace(/^#+\s*/, ''))}</p>}
            <ul className="list-disc space-y-0.5 pl-5 marker:text-ink-muted">
              {items.map((item, j) => (
                <li key={j}>{inline(item.replace(BULLET_RE, ''))}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6.5 8.5h7M6.5 11h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function AskDealerPulse(props: Props) {
  const scope = useScope(props);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const wasOpen = useRef(false);
  const titleId = useId();
  const counterId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Focus the textarea on open and hand focus back to the button on close.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Learn the mode once, so the offline badge shows before the first question.
  useEffect(() => {
    if (!open || mode) return;
    const controller = new AbortController();
    fetch('/api/ask', { signal: controller.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mode?: Mode } | null) => {
        if (data?.mode === 'live' || data?.mode === 'offline') setMode(data.mode);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, mode]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  // Lock page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /** Sends a question. `base` is the conversation to continue (a retry passes it without the failed turn). */
  const ask = useCallback(
    async (question: string, base: Message[] = messages) => {
      const text = question.trim().slice(0, MAX_CHARS);
      if (!text || pending) return;

      const kept = base.filter((m) => !m.error);
      // The last few turns asked in this same scope.
      const history = kept
        .filter((m) => m.scopeKey === scope.key)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) }));

      setMessages([...kept, { id: nextId.current++, role: 'user', text, scopeKey: scope.key }]);
      setDraft('');
      setPending(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            question: text,
            history,
            from: scope.from,
            to: scope.to,
            branchId: scope.branchId,
            repId: scope.repId,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | { mode?: Mode; answer?: string; verified?: boolean; unverifiedNumbers?: string[]; error?: string }
          | null;
        if (!res.ok || !data?.answer) {
          throw new Error(data?.error ?? 'Something went wrong. Please try again.');
        }
        if (data.mode) setMode(data.mode);
        setMessages((list) => [
          ...list,
          {
            id: nextId.current++,
            role: 'assistant',
            text: data.answer ?? '',
            scopeKey: scope.key,
            unverified: data.verified === false ? data.unverifiedNumbers ?? [] : undefined,
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : "Couldn't reach DealerPulse. Check your connection and try again.";
        setMessages((list) => [
          ...list,
          { id: nextId.current++, role: 'assistant', text: message, scopeKey: scope.key, error: true },
        ]);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setPending(false);
        }
      }
    },
    [messages, pending, scope],
  );

  // Ask the failed question again, continuing from the conversation before it.
  const retry = () => {
    const idx = messages.map((m) => m.role).lastIndexOf('user');
    const lastUser = messages[idx];
    if (lastUser) void ask(lastUser.text, messages.slice(0, idx));
  };

  const clear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setMessages([]);
    setDraft('');
    inputRef.current?.focus();
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void ask(draft);
    }
  };

  // Esc closes; Tab stays inside the dialog while it is open.
  const onDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const lastIsError = messages[messages.length - 1]?.error === true;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={clsx(
          'fixed z-30 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-ink/20 transition hover:bg-brand-dark',
          open && 'invisible',
        )}
        style={{
          right: 'calc(1rem + env(safe-area-inset-right))',
          bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        }}
      >
        <ChatIcon />
        Ask DealerPulse
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/30" onClick={close} aria-hidden="true" />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={onDialogKey}
            className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-white shadow-2xl sm:max-w-[440px]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingRight: 'env(safe-area-inset-right)' }}
          >
            <header className="border-b border-line px-4 pb-3 pt-4 sm:px-5" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
                    Ask DealerPulse
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">Answers from this dashboard&apos;s data, as of 31 Dec 2025.</p>
                </div>
                <button type="button" onClick={close} className="btn -mr-1 px-2" aria-label="Close Ask DealerPulse">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex max-w-full items-center truncate rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-dark">
                  {scope.label}
                </span>
                {mode === 'offline' && (
                  <span className="inline-flex items-center rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                    Offline answers: AI not configured
                  </span>
                )}
              </div>
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite" aria-busy={pending}>
              {messages.length === 0 && (
                <div>
                  <p className="text-sm text-ink-soft">
                    {mode === 'offline'
                      ? 'Pick a question. Answers are worked out from the dashboard metrics for the scope above.'
                      : 'Ask about sales, leads, targets or deliveries for the scope above, or start with one of these.'}
                  </p>
                </div>
              )}

              <ul className="space-y-3">
                {messages.map((m) => (
                  <li key={m.id} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white">
                        <span className="sr-only">You: </span>
                        {m.text}
                      </div>
                    ) : m.error ? (
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-bad/30 bg-bad-soft px-3.5 py-2.5 text-sm text-bad" role="alert">
                        <p>{m.text}</p>
                        {lastIsError && m === messages[messages.length - 1] && (
                          <button type="button" onClick={retry} className="btn mt-2 border-bad/30 px-2.5 py-1 text-xs text-bad">
                            Retry
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                        <span className="sr-only">DealerPulse: </span>
                        <RichText text={m.text} />
                        {m.unverified && (
                          <p
                            className="mt-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn"
                            title={m.unverified.length > 0 ? `Not found in the data: ${m.unverified.join(', ')}` : undefined}
                          >
                            Couldn&apos;t verify every figure
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
                {pending && (
                  <li className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink-muted">
                      <span className="flex gap-1" aria-hidden="true">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="h-1.5 w-1.5 rounded-full bg-ink-muted motion-safe:animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                      <span>Thinking…</span>
                    </div>
                  </li>
                )}
              </ul>
            </div>

            <div className="border-t border-line px-4 pb-4 pt-3 sm:px-5">
              <div className="-mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Suggested questions">
                {CURATED_QUESTIONS.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    disabled={pending}
                    onClick={() => void ask(q.question)}
                    className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {q.question}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(draft);
                }}
              >
                <label htmlFor={`${titleId}-input`} className="sr-only">
                  Your question
                </label>
                <textarea
                  ref={inputRef}
                  id={`${titleId}-input`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onInputKey}
                  maxLength={MAX_CHARS}
                  rows={2}
                  placeholder="e.g. Why is Lakeside behind?"
                  aria-describedby={counterId}
                  className="block w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span id={counterId} className="num text-[11px] text-ink-muted">
                      {draft.length}/{MAX_CHARS}
                    </span>
                    {messages.length > 0 && (
                      <button type="button" onClick={clear} className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                        Clear chat
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={pending || !draft.trim()}
                    className="inline-flex items-center rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-muted">Enter to send, Shift+Enter for a new line.</p>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
