# agentcore-deal-analyst

A commercial-real-estate **deal analyst** agent built on the Amazon Bedrock
**AgentCore harness** — the managed agentic offering that went GA in June 2026.

This repo is the "after" picture in a deliberate before/after. The v1 of this
project (`cre-chatbot-amplify`) hand-authored the agent loop the long way: a
Strands agent in a Lambda behind a Function URL, with the orchestration,
session, and tool-calling all written by hand. The harness inverts that: the
agent loop becomes **configuration**, and the only code worth authoring is the
domain math the platform can't supply.

## Architecture — "AgentCore purity"

> Full rationale and the superseded designs: ADR 0002 in the `cre-chatbot-amplify`
> repo (`docs/adr/0002-portfolio-kit-architecture.md`).

| Concern | Who owns it |
| --- | --- |
| Agent loop (model, instructions, tool selection) | **Harness config** — no authored agent code |
| Compute, session, memory, identity, observability | **Managed** by AgentCore |
| IRR / sensitivity math | **`calc` Lambda** → [`@michitson/cre-irr`](https://www.npmjs.com/package/@michitson/cre-irr) |
| Market data (cap rates, comps via Athena) | **`data` Lambda** (consume-only lakehouse) |
| Tool exposure | **AgentCore Gateway** — turns each Lambda into a managed MCP endpoint |

The guiding principle: **author only what the platform can't.** A hand-built
agent runtime or a hand-written MCP server would be a "museum piece" in
AgentCore-world — so the authored surface collapses to two small Lambdas, each a
Gateway target.

## What's built

- **`lambdas/calc/`** — the IRR + sensitivity Gateway target. Dispatches
  `calculate_irr` and `run_sensitivity` over the published
  [`@michitson/cre-irr`](https://www.npmjs.com/package/@michitson/cre-irr)
  package. `tools.json` (generated from `src/tools.ts`) is the schema Gateway
  registers. 13 tests cover the Gateway contract, input coercion, and error
  mapping.
- **`lambdas/data/`** — the market reference-data Gateway target. Dispatches
  `get_market_cap_rates` and `get_comparable_sales` so the agent can ground its
  exit-cap assumption and sanity-check a deal against comps. Built **mock-first**:
  the handler depends only on a `DataRepository` interface, with a deterministic
  **synthetic** `FixtureRepository` today (every value flagged `source: 'synthetic'`;
  comps are internally consistent — `salePrice === NOI ÷ capRate`) and a real
  Athena-backed repository to drop in later via `createHandler(repo)`. 16 tests.

### The Gateway → Lambda contract

Gateway invokes the Lambda once per tool call:

- `event` is the tool's arguments (matching the tool's `inputSchema`).
- The tool name arrives as `context.clientContext.custom.bedrockAgentCoreToolName`,
  prefixed by the target name: `calc___calculate_irr`. The handler strips the
  prefix and dispatches on the suffix.
- The handler returns `{ statusCode, body: <JSON string> }`.

Invalid or unsolvable deals throw inside `@michitson/cre-irr`; the handler maps
those to a `422` with the package's own message, so the agent gets a readable
tool error instead of a stack trace.

## What's next

- Swap the `data` Lambda's synthetic `FixtureRepository` for a real
  Athena-backed repository (S3 + Glue catalog + Athena workgroup).
- Harness configuration (`agentcore.json`): model + instructions (ported from
  the v1 system prompt) + the two Gateway targets.
- Thin Next.js front end + invocation proxy (ADR 0003, "Shape A").

## Develop

```bash
cd lambdas/calc
npm install
npm test           # vitest
npm run build      # tsc -> dist/ (handler entrypoint: dist/handler.handler)
npm run emit-schema  # regenerate tools.json from src/tools.ts
```
