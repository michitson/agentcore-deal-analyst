import { describe, expect, it } from 'vitest';
import {
  handler,
  resolveToolName,
  type GatewayLambdaContext,
} from '../src/handler.js';
import { TOOLS, TOOL_NAMES } from '../src/tools.js';

/** Build a Gateway-style context for a given prefixed tool name. */
function ctx(toolName: string, key: 'custom' | 'Custom' = 'custom'): GatewayLambdaContext {
  return { clientContext: { [key]: { bedrockAgentCoreToolName: toolName } } };
}

const STANDARD = {
  purchasePrice: 5_000_000,
  netOperatingIncome: 400_000,
  noiGrowthRate: 3,
  holdPeriod: 10,
  exitCapRate: 6.5,
};

// The golden IRR contract value from @michitson/cre-irr's standard case.
const STANDARD_IRR = 12.544692996050152;

describe('resolveToolName', () => {
  it('strips the Gateway target prefix', () => {
    expect(resolveToolName(ctx('calc___calculate_irr'))).toBe('calculate_irr');
  });

  it('accepts an unprefixed name', () => {
    expect(resolveToolName(ctx('run_sensitivity'))).toBe('run_sensitivity');
  });

  it('reads the Node-cased `Custom` key as well as `custom`', () => {
    expect(resolveToolName(ctx('calc___calculate_irr', 'Custom'))).toBe(
      'calculate_irr',
    );
  });

  it('returns undefined when the tool name is absent', () => {
    expect(resolveToolName({})).toBeUndefined();
    expect(resolveToolName({ clientContext: {} })).toBeUndefined();
  });
});

describe('handler — calculate_irr', () => {
  it('returns the golden IRR for the standard deal', async () => {
    const res = await handler(STANDARD, ctx('calc___calculate_irr'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.irrPercentage).toBeCloseTo(STANDARD_IRR, 9);
    expect(body.cashFlows.length).toBe(STANDARD.holdPeriod + 1);
  });

  it('coerces string-valued arguments (Gateway may pass strings)', async () => {
    const stringy = Object.fromEntries(
      Object.entries(STANDARD).map(([k, v]) => [k, String(v)]),
    );
    const res = await handler(stringy, ctx('calc___calculate_irr'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).irrPercentage).toBeCloseTo(STANDARD_IRR, 9);
  });
});

describe('handler — run_sensitivity', () => {
  it('returns one tornado entry per variable, widest spread first', async () => {
    const res = await handler(STANDARD, ctx('calc___run_sensitivity'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.variables.length).toBeGreaterThan(0);
    for (let i = 0; i < body.variables.length - 1; i++) {
      expect(body.variables[i].spreadPp).toBeGreaterThanOrEqual(
        body.variables[i + 1].spreadPp,
      );
    }
  });
});

describe('handler — error handling', () => {
  it('400 when no tool name is supplied', async () => {
    const res = await handler(STANDARD, {});
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/tool name/i);
  });

  it('404 on an unknown tool', async () => {
    const res = await handler(STANDARD, ctx('calc___nope'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/unknown tool/i);
  });

  it('422 with the package message on an invalid deal (exitCapRate 0)', async () => {
    const res = await handler(
      { ...STANDARD, exitCapRate: 0 },
      ctx('calc___calculate_irr'),
    );
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/exitCapRate/);
  });

  it('422 on missing arguments (NaN → "must be finite")', async () => {
    const res = await handler({}, ctx('calc___calculate_irr'));
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toMatch(/finite/);
  });
});

describe('tool definitions', () => {
  it('handler dispatches every declared tool name', async () => {
    // Every name in tools.ts must be routable (no 404) given valid inputs.
    for (const name of TOOL_NAMES) {
      const res = await handler(STANDARD, ctx(`calc___${name}`));
      expect(res.statusCode).toBe(200);
    }
  });

  it('schemas are self-contained (no $ref/$defs — Gateway rejects them)', () => {
    const json = JSON.stringify(TOOLS);
    expect(json).not.toMatch(/\$ref|\$defs|\$anchor/);
  });
});
