/**
 * Domain types for the `data` Gateway target — market reference data a CRE deal
 * analyst uses to ground its assumptions (cap rates) and sanity-check a deal
 * against comparable sales.
 *
 * Every value carries `source: 'synthetic'`. This data is fabricated for a
 * portfolio demo — it is NOT real market data and must never be presented as
 * such. The tool descriptions say so too, so the agent surfaces the caveat.
 */

export type PropertyType = 'multifamily' | 'office' | 'industrial';

export const PROPERTY_TYPES: PropertyType[] = [
  'multifamily',
  'office',
  'industrial',
];

/** Prevailing going-in and exit cap-rate benchmarks for a market + property type. */
export interface CapRateBenchmark {
  market: string;
  propertyType: PropertyType;
  goingInCapRatePct: number;
  exitCapRateBenchmarkPct: number;
  asOf: string;
  source: 'synthetic';
}

/** A single comparable sale. salePriceUsd === round(noiUsd / (capRatePct / 100)). */
export interface SaleComp {
  address: string;
  market: string;
  propertyType: PropertyType;
  salePriceUsd: number;
  noiUsd: number;
  capRatePct: number;
  saleDate: string;
  source: 'synthetic';
}

/**
 * The data-access boundary. The handler depends only on this interface, so the
 * synthetic FixtureRepository (today) and a future AthenaRepository (real
 * lakehouse) are drop-in swappable without touching the handler.
 */
export interface DataRepository {
  getCapRates(
    market: string,
    propertyType: PropertyType,
  ): CapRateBenchmark | undefined;
  getComparableSales(
    market: string,
    propertyType: PropertyType,
    limit: number,
  ): SaleComp[];
  listMarkets(): string[];
}
