/**
 * Tool definitions for the `calc` Gateway target.
 *
 * This array is the single source of truth. The handler dispatches on these
 * names (see handler.ts), and `tools.json` — consumed by
 * `agentcore add gateway-target --tool-schema-file tools.json` — is generated
 * from it (see scripts/emit-tools.mjs). Keep schemas self-contained: AgentCore
 * Gateway rejects targets whose tool schemas use $ref / $defs / $anchor.
 *
 * The two tools are thin wrappers over the published @michitson/cre-irr package
 * — the one authored domain artifact in the AgentCore-purity design. The agent
 * loop, session, memory, auth, and observability are all managed by the harness;
 * this Lambda exists only because the IRR math must be a real, auditable tool
 * (not LLM arithmetic).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
    additionalProperties: boolean;
  };
}

/** Shared input schema — both tools take the same five deal parameters. */
const DEAL_INPUT_SCHEMA: ToolDefinition['inputSchema'] = {
  type: 'object',
  properties: {
    purchasePrice: {
      type: 'number',
      description: 'Acquisition price in USD. Must be greater than 0.',
    },
    netOperatingIncome: {
      type: 'number',
      description: 'Year-1 net operating income (NOI) in USD.',
    },
    noiGrowthRate: {
      type: 'number',
      description: 'Annual NOI growth as a percent, e.g. 3 for 3%.',
    },
    holdPeriod: {
      type: 'number',
      description: 'Hold period in whole years. Must be at least 1.',
    },
    exitCapRate: {
      type: 'number',
      description:
        'Exit capitalization rate as a percent, e.g. 6.5 for 6.5%. Must be greater than 0.',
    },
  },
  required: [
    'purchasePrice',
    'netOperatingIncome',
    'noiGrowthRate',
    'holdPeriod',
    'exitCapRate',
  ],
  additionalProperties: false,
};

export const TOOLS: ToolDefinition[] = [
  {
    name: 'calculate_irr',
    description:
      'Compute the IRR for a commercial real estate deal from its purchase ' +
      'price, year-1 NOI, NOI growth rate, hold period, and exit cap rate. ' +
      'Returns the IRR %, total return %, year-1 cash flow, exit value, and ' +
      'the full cash-flow series. Deterministic bisection solver.',
    inputSchema: DEAL_INPUT_SCHEMA,
  },
  {
    name: 'run_sensitivity',
    description:
      'Run a one-variable-at-a-time tornado sensitivity for a CRE deal: sweep ' +
      'each input around the base case and report how much the IRR moves. Rate ' +
      'inputs sweep in basis points; dollar/period inputs sweep ±10/±20%. ' +
      'Variables are returned sorted by IRR spread (widest first).',
    inputSchema: DEAL_INPUT_SCHEMA,
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
