/**
 * AgentCore Gateway Lambda target — the `calc` tool provider.
 *
 * Gateway invokes this Lambda once per tool call. The contract (per the
 * AgentCore Gateway quickstart):
 *   - `event`   = the tool's input arguments, matching the tool's inputSchema.
 *   - tool name = context.clientContext.custom['bedrockAgentCoreToolName'],
 *                 prefixed by the target name as `${target}___${tool}`.
 *   - return    = { statusCode, body: <JSON string> }.
 *
 * The math lives in @michitson/cre-irr; this handler only dispatches, coerces,
 * and turns the package's thrown validation errors into clean tool errors the
 * agent can read.
 */

import {
  calculateIrr,
  runSensitivity,
  type IrrInputs,
} from '@michitson/cre-irr';

/**
 * Minimal shape of the Lambda context fields we rely on. The documented key is
 * `clientContext.custom` (Python: `client_context.custom`); the Node runtime can
 * surface the same dict as `Custom`, so we read both.
 */
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

/**
 * Pull the bare tool name out of the Gateway-prefixed name. Gateway exposes
 * tools as `${target}___${tool}`; we dispatch on the suffix.
 */
export function resolveToolName(
  context: GatewayLambdaContext | undefined,
): string | undefined {
  const custom = context?.clientContext?.custom ?? context?.clientContext?.Custom;
  const raw = custom?.[TOOL_NAME_KEY];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const idx = raw.lastIndexOf(PREFIX_SEPARATOR);
  return idx === -1 ? raw : raw.slice(idx + PREFIX_SEPARATOR.length);
}

/**
 * Coerce the raw event into IrrInputs. Missing/garbage fields become NaN, which
 * calculateIrr rejects with a clear "must be finite" error — so we never solve
 * against silently-defaulted numbers.
 */
function coerceInputs(event: Record<string, unknown>): IrrInputs {
  return {
    purchasePrice: Number(event.purchasePrice),
    netOperatingIncome: Number(event.netOperatingIncome),
    noiGrowthRate: Number(event.noiGrowthRate),
    holdPeriod: Number(event.holdPeriod),
    exitCapRate: Number(event.exitCapRate),
  };
}

const ok = (payload: unknown): ToolResponse => ({
  statusCode: 200,
  body: JSON.stringify(payload),
});

const fail = (statusCode: number, message: string): ToolResponse => ({
  statusCode,
  body: JSON.stringify({ error: message }),
});

export async function handler(
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

  try {
    const inputs = coerceInputs(event ?? {});
    switch (tool) {
      case 'calculate_irr':
        return ok(calculateIrr(inputs));
      case 'run_sensitivity':
        return ok(runSensitivity(inputs));
      default:
        return fail(404, `Unknown tool: ${tool}`);
    }
  } catch (err) {
    // @michitson/cre-irr throws RangeError/TypeError on invalid or
    // unsolvable deals — surface the message, not a 500 stack trace.
    const message = err instanceof Error ? err.message : String(err);
    return fail(422, message);
  }
}
