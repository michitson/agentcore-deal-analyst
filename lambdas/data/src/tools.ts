/**
 * Tool definitions for the `data` Gateway target. Single source of truth for
 * both handler dispatch and `tools.json` (the Gateway tool schema). Schemas are
 * self-contained — no $ref/$defs — per the Gateway target constraint.
 *
 * Both tools return SYNTHETIC reference data (fabricated for a portfolio demo).
 * The descriptions say so explicitly so the agent passes the caveat through to
 * the user rather than implying these are real market quotes.
 */

import { PROPERTY_TYPES } from './types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
}

const MARKET_PROP: Record<string, unknown> = {
  market: {
    type: 'string',
    description: 'Metro market name, e.g. "Austin", "Manhattan", "Phoenix".',
  },
  propertyType: {
    type: 'string',
    enum: PROPERTY_TYPES,
    description: 'Property type.',
  },
};

export const TOOLS: ToolDefinition[] = [
  {
    name: 'get_market_cap_rates',
    description:
      'Look up prevailing going-in and exit cap-rate benchmarks for a market ' +
      'and property type. Use this to ground a deal’s exit cap rate ' +
      'assumption in market context. Returns SYNTHETIC reference data ' +
      '(demo dataset, not real market quotes).',
    inputSchema: {
      type: 'object',
      properties: { ...MARKET_PROP },
      required: ['market', 'propertyType'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_comparable_sales',
    description:
      'Return recent comparable sales (address, sale price, NOI, cap rate, ' +
      'date) for a market and property type, to sanity-check a deal against ' +
      'the market. Returns SYNTHETIC comps (demo dataset, not real sales).',
    inputSchema: {
      type: 'object',
      properties: {
        ...MARKET_PROP,
        limit: {
          type: 'number',
          description: 'Max number of comps to return (1–3). Defaults to 3.',
        },
      },
      required: ['market', 'propertyType'],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
