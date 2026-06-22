/**
 * Synthetic, in-memory implementation of DataRepository.
 *
 * The cap-rate table is hand-authored to plausible 2026 levels; the comps are
 * *derived* from it so the dataset is internally consistent — every comp's
 * salePrice is exactly its NOI capitalized at its own cap rate, and the comp
 * cap rates straddle the going-in benchmark. Deterministic (no randomness), so
 * tests can assert exact values.
 *
 * SYNTHETIC DATA — fabricated for a portfolio demo, not real market data.
 */

import {
  type CapRateBenchmark,
  type DataRepository,
  type PropertyType,
  type SaleComp,
} from './types.js';

interface CapEntry {
  goingIn: number;
  exit: number;
}

const AS_OF = '2026-06-01';

/** market -> propertyType -> going-in / exit benchmark (percent). */
const CAP_TABLE: Record<string, Partial<Record<PropertyType, CapEntry>>> = {
  Austin: {
    multifamily: { goingIn: 5.0, exit: 5.25 },
    office: { goingIn: 8.5, exit: 8.75 },
    industrial: { goingIn: 5.75, exit: 6.0 },
  },
  Manhattan: {
    multifamily: { goingIn: 4.25, exit: 4.5 },
    office: { goingIn: 7.5, exit: 8.0 },
    industrial: { goingIn: 5.0, exit: 5.25 },
  },
  Phoenix: {
    multifamily: { goingIn: 5.25, exit: 5.5 },
    office: { goingIn: 8.75, exit: 9.0 },
    industrial: { goingIn: 6.0, exit: 6.25 },
  },
};

/** Base year-1 NOI per property type, used to scale the derived comps. */
const BASE_NOI: Record<PropertyType, number> = {
  multifamily: 600_000,
  office: 1_500_000,
  industrial: 900_000,
};

const STREETS: Record<string, string> = {
  Austin: 'Congress',
  Manhattan: 'Park',
  Phoenix: 'Camelback',
};

/** Deterministic sale dates for the three comps per combo. */
const SALE_DATES = ['2026-01-15', '2026-03-15', '2026-05-15'];

/** Canonicalize a user-supplied market string to a known key (case-insensitive). */
function canonicalMarket(market: string): string | undefined {
  const lower = market.trim().toLowerCase();
  return Object.keys(CAP_TABLE).find((m) => m.toLowerCase() === lower);
}

function round(n: number): number {
  return Math.round(n);
}

export class FixtureRepository implements DataRepository {
  getCapRates(
    market: string,
    propertyType: PropertyType,
  ): CapRateBenchmark | undefined {
    const key = canonicalMarket(market);
    if (!key) return undefined;
    const entry = CAP_TABLE[key]?.[propertyType];
    if (!entry) return undefined;
    return {
      market: key,
      propertyType,
      goingInCapRatePct: entry.goingIn,
      exitCapRateBenchmarkPct: entry.exit,
      asOf: AS_OF,
      source: 'synthetic',
    };
  }

  getComparableSales(
    market: string,
    propertyType: PropertyType,
    limit: number,
  ): SaleComp[] {
    const key = canonicalMarket(market);
    if (!key) return [];
    const entry = CAP_TABLE[key]?.[propertyType];
    if (!entry) return [];

    const street = STREETS[key] ?? 'Main';
    const baseNoi = BASE_NOI[propertyType];

    // Three derived comps whose cap rates straddle the going-in benchmark.
    const comps: SaleComp[] = [0, 1, 2].map((i) => {
      const capRatePct = entry.goingIn + (i - 1) * 0.15;
      const noiUsd = round(baseNoi * (1 + i * 0.25));
      const salePriceUsd = round(noiUsd / (capRatePct / 100));
      return {
        address: `${100 + i * 50} ${street} Ave, ${key}`,
        market: key,
        propertyType,
        salePriceUsd,
        noiUsd,
        capRatePct: Math.round(capRatePct * 100) / 100,
        saleDate: SALE_DATES[i],
        source: 'synthetic',
      };
    });

    return comps.slice(0, Math.max(0, limit));
  }

  listMarkets(): string[] {
    return Object.keys(CAP_TABLE);
  }
}

export const fixtureRepository = new FixtureRepository();
