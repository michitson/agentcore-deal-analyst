import { describe, expect, it } from 'vitest';
import {
  createHandler,
  handler,
  resolveToolName,
  type GatewayLambdaContext,
} from '../src/handler.js';
import { fixtureRepository } from '../src/fixture-repository.js';
import { TOOL_NAMES, TOOLS } from '../src/tools.js';

function ctx(toolName: string, key: 'custom' | 'Custom' = 'custom'): GatewayLambdaContext {
  return { clientContext: { [key]: { bedrockAgentCoreToolName: toolName } } };
}

describe('resolveToolName', () => {
  it('strips the Gateway target prefix', () => {
    expect(resolveToolName(ctx('data___get_market_cap_rates'))).toBe(
      'get_market_cap_rates',
    );
  });

  it('reads the Node-cased `Custom` key', () => {
    expect(resolveToolName(ctx('data___get_comparable_sales', 'Custom'))).toBe(
      'get_comparable_sales',
    );
  });

  it('returns undefined when absent', () => {
    expect(resolveToolName({})).toBeUndefined();
  });
});

describe('handler — get_market_cap_rates', () => {
  it('returns going-in and exit benchmarks for a known combo', async () => {
    const res = await handler(
      { market: 'Austin', propertyType: 'multifamily' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.goingInCapRatePct).toBe(5.0);
    expect(body.exitCapRateBenchmarkPct).toBe(5.25);
    expect(body.source).toBe('synthetic');
  });

  it('is case-insensitive on market', async () => {
    const res = await handler(
      { market: 'manhattan', propertyType: 'office' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).market).toBe('Manhattan');
  });

  it('404 with known markets listed for an unknown market', async () => {
    const res = await handler(
      { market: 'Atlantis', propertyType: 'office' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/Austin/);
  });
});

describe('handler — get_comparable_sales', () => {
  it('returns internally-consistent comps (price === noi / cap)', async () => {
    const res = await handler(
      { market: 'Phoenix', propertyType: 'industrial' },
      ctx('data___get_comparable_sales'),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.count).toBe(3);
    for (const c of body.comps) {
      expect(c.salePriceUsd).toBe(Math.round(c.noiUsd / (c.capRatePct / 100)));
      expect(c.source).toBe('synthetic');
    }
  });

  it('clamps limit to the 1–3 range', async () => {
    const res = await handler(
      { market: 'Austin', propertyType: 'multifamily', limit: 1 },
      ctx('data___get_comparable_sales'),
    );
    expect(JSON.parse(res.body).count).toBe(1);

    const over = await handler(
      { market: 'Austin', propertyType: 'multifamily', limit: 99 },
      ctx('data___get_comparable_sales'),
    );
    expect(JSON.parse(over.body).count).toBe(3);
  });
});

describe('handler — validation & errors', () => {
  it('400 when no tool name is supplied', async () => {
    const res = await handler(
      { market: 'Austin', propertyType: 'office' },
      {},
    );
    expect(res.statusCode).toBe(400);
  });

  it('422 when market is missing', async () => {
    const res = await handler(
      { propertyType: 'office' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/market/);
  });

  it('422 on an invalid propertyType', async () => {
    const res = await handler(
      { market: 'Austin', propertyType: 'casino' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/propertyType/);
  });

  it('404 on an unknown tool', async () => {
    const res = await handler(
      { market: 'Austin', propertyType: 'office' },
      ctx('data___nope'),
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('repository injection', () => {
  it('createHandler accepts a custom repository', async () => {
    const empty = {
      getCapRates: () => undefined,
      getComparableSales: () => [],
      listMarkets: () => ['Testville'],
    };
    const h = createHandler(empty);
    const res = await h(
      { market: 'Austin', propertyType: 'office' },
      ctx('data___get_market_cap_rates'),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/Testville/);
  });
});

describe('tool definitions', () => {
  it('handler routes every declared tool name', async () => {
    for (const name of TOOL_NAMES) {
      const res = await handler(
        { market: 'Austin', propertyType: 'multifamily' },
        ctx(`data___${name}`),
      );
      expect(res.statusCode).toBe(200);
    }
  });

  it('schemas are self-contained (no $ref/$defs)', () => {
    expect(JSON.stringify(TOOLS)).not.toMatch(/\$ref|\$defs|\$anchor/);
  });

  it('fixture markets are non-empty', () => {
    expect(fixtureRepository.listMarkets().length).toBeGreaterThan(0);
  });
});
