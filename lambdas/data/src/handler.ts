/**
 * AgentCore Gateway Lambda target — the `data` tool provider.
 *
 * Same Gateway contract as the calc target:
 *   - `event`   = the tool's input arguments (matching the tool's inputSchema).
 *   - tool name = context.clientContext.custom['bedrockAgentCoreToolName'],
 *                 prefixed as `${target}___${tool}` (e.g. `data___get_market_cap_rates`).
 *   - return    = { statusCode, body: <JSON string> }.
 *
 * The handler depends only on the DataRepository interface; the synthetic
 * FixtureRepository is the default, and a real AthenaRepository can be injected
 * later via createHandler() without changing dispatch logic.
 */

import { fixtureRepository } from './fixture-repository.js';
import {
  type DataRepository,
  type PropertyType,
  PROPERTY_TYPES,
} from './types.js';

export interface GatewayLambdaContext {
  clientContext?: {
    custom?: Record<string, unknown>;
    Custom?: Record<string, unknown>;
  };
}

export interface ToolResponse {
  statusCode: number;
  body: string;
}

const TOOL_NAME_KEY = 'bedrockAgentCoreToolName';
const PREFIX_SEPARATOR = '___';
const MAX_COMPS = 3;
const DEFAULT_COMPS = 3;

export function resolveToolName(
  context: GatewayLambdaContext | undefined,
): string | undefined {
  const custom = context?.clientContext?.custom ?? context?.clientContext?.Custom;
  const raw = custom?.[TOOL_NAME_KEY];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const idx = raw.lastIndexOf(PREFIX_SEPARATOR);
  return idx === -1 ? raw : raw.slice(idx + PREFIX_SEPARATOR.length);
}

const ok = (payload: unknown): ToolResponse => ({
  statusCode: 200,
  body: JSON.stringify(payload),
});

const fail = (statusCode: number, message: string): ToolResponse => ({
  statusCode,
  body: JSON.stringify({ error: message }),
});

function readPropertyType(event: Record<string, unknown>): PropertyType | undefined {
  const raw = event.propertyType;
  return PROPERTY_TYPES.find((t) => t === raw);
}

export function createHandler(repo: DataRepository = fixtureRepository) {
  return async function handler(
    event: Record<string, unknown> | undefined,
    context: GatewayLambdaContext,
  ): Promise<ToolResponse> {
    const tool = resolveToolName(context);
    if (!tool) {
      return fail(
        400,
        `Missing tool name (expected clientContext.custom.${TOOL_NAME_KEY}).`,
      );
    }

    const args = event ?? {};
    const market = typeof args.market === 'string' ? args.market : '';
    if (!market) {
      return fail(422, 'Missing required argument: market.');
    }

    const propertyType = readPropertyType(args);
    if (!propertyType) {
      return fail(
        422,
        `Invalid or missing propertyType. Expected one of: ${PROPERTY_TYPES.join(', ')}.`,
      );
    }

    switch (tool) {
      case 'get_market_cap_rates': {
        const benchmark = repo.getCapRates(market, propertyType);
        if (!benchmark) {
          return fail(
            404,
            `No data for ${market} / ${propertyType}. Known markets: ${repo.listMarkets().join(', ')}.`,
          );
        }
        return ok(benchmark);
      }

      case 'get_comparable_sales': {
        const requested =
          typeof args.limit === 'number' && Number.isFinite(args.limit)
            ? Math.floor(args.limit)
            : DEFAULT_COMPS;
        const limit = Math.min(MAX_COMPS, Math.max(1, requested));
        const comps = repo.getComparableSales(market, propertyType, limit);
        if (comps.length === 0) {
          return fail(
            404,
            `No comps for ${market} / ${propertyType}. Known markets: ${repo.listMarkets().join(', ')}.`,
          );
        }
        return ok({ market, propertyType, count: comps.length, comps });
      }

      default:
        return fail(404, `Unknown tool: ${tool}`);
    }
  };
}

/** Default handler wired to the synthetic fixture repository. */
export const handler = createHandler();
