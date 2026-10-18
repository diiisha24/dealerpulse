import type { WhatIfBase } from './metrics';

export interface WhatIfResult {
  units: number;
  revenue: number;
  extraUnits: number;
  extraRevenue: number;
  testDriveRate: number;
  orderRate: number;
}

const safe = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Scales two funnel rates by a relative uplift (0.1 = 10% better) and keeps
 * everything else fixed: same lead volume, same order-to-delivery rate, same
 * average deal value. Rates are capped at 100%.
 */
export function simulate(base: WhatIfBase, testDriveUplift: number, orderUplift: number): WhatIfResult {
  const testDriveRate = Math.min(safe(base.leadToTestDrive) * (1 + testDriveUplift), 1);
  const orderRate = Math.min(safe(base.testDriveToOrder) * (1 + orderUplift), 1);
  const units = base.leads * testDriveRate * orderRate * safe(base.orderToDelivery);
  const revenue = units * safe(base.avgDealValue);
  return {
    units,
    revenue,
    extraUnits: units - base.units,
    extraRevenue: revenue - base.revenue,
    testDriveRate,
    orderRate,
  };
}
