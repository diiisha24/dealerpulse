'use client';

import { useState } from 'react';
import { formatInr, formatPct } from '@/lib/format';
import type { WhatIfBase } from '@/lib/metrics';
import { simulate } from '@/lib/whatif';
import { EmptyState } from './Section';

interface SliderProps {
  id: string;
  label: string;
  base: number;
  value: number;
  onChange: (v: number) => void;
}

function UpliftSlider({ id, label, base, value, onChange }: SliderProps) {
  const next = Math.min(base * (1 + value), 1);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
          {label}
        </label>
        <span className="num text-[13px] text-ink">
          {formatPct(base)} <span className="text-ink-muted">→</span>{' '}
          <span className="font-semibold text-brand">{formatPct(next)}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={30}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-2 w-full accent-brand"
        aria-valuetext={`${Math.round(value * 100)}% better`}
      />
      <div className="flex justify-between text-[11px] text-ink-muted">
        <span>Today</span>
        <span className="num">+{Math.round(value * 100)}%</span>
        <span>+30%</span>
      </div>
    </div>
  );
}

export function WhatIf({ base }: { base: WhatIfBase }) {
  const [tdUplift, setTdUplift] = useState(0);
  const [orderUplift, setOrderUplift] = useState(0.1);

  if (base.leads === 0 || base.testDrives === 0) {
    return <EmptyState title="Not enough funnel data" body="Pick a period with test drives to model improvements." />;
  }

  const result = simulate(base, tdUplift, orderUplift);
  const unchanged = tdUplift === 0 && orderUplift === 0;

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_220px] md:items-center">
      <div className="grid gap-5">
        <UpliftSlider
          id="whatif-td"
          label="Leads that book a test drive"
          base={base.leadToTestDrive}
          value={tdUplift}
          onChange={setTdUplift}
        />
        <UpliftSlider
          id="whatif-order"
          label="Test drives that become orders"
          base={base.testDriveToOrder}
          value={orderUplift}
          onChange={setOrderUplift}
        />
      </div>
      <div className="rounded-lg bg-brand-soft p-4" aria-live="polite">
        <p className="eyebrow text-brand-dark">Extra revenue</p>
        <p className="num mt-1 text-2xl font-semibold text-brand-dark">
          {unchanged ? '–' : `+${formatInr(Math.max(result.extraRevenue, 0))}`}
        </p>
        <p className="num mt-1 text-[13px] text-ink-soft">
          {unchanged ? 'Move a slider to see the impact.' : `about +${Math.round(Math.max(result.extraUnits, 0))} cars delivered`}
        </p>
        <p className="mt-3 text-[11px] leading-snug text-ink-muted">
          Same {base.leads} leads, same {formatPct(base.orderToDelivery)} order-to-delivery rate and average deal of{' '}
          {formatInr(base.avgDealValue)}.
        </p>
      </div>
    </div>
  );
}
