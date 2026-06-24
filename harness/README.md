# Harness configuration

This folder is the **agent-as-config** artifact — the heart of the
AgentCore-purity design. There is no agent loop to author; the agent *is* this
configuration.

## Files

| File | Role |
| --- | --- |
| `instructions.md` | The system prompt (source of truth). A port of the v1 Strands prompt. |
| `build-config.mjs` | Inlines `instructions.md` into `deal-analyst.harness.json`. Run `node build-config.mjs`. |
| `deal-analyst.harness.json` | Generated `CreateHarness` request body — model + instructions + the two Gateway tools + limits. ARNs are placeholders until deploy. |

## The "config ceiling" finding — what the port revealed

The v1 Strands agent had **four** tools, two of which were *stateful
accumulators*:

| v1 tool | What it did | Fate under purity |
| --- | --- | --- |
| `set_property_type` | wrote property type into server-side session state | **removed** |
| `record_field` | wrote one parsed field into session state, returned progress | **removed** |
| `calculate_irr` | read accumulated state, **took no arguments** | now takes all 5 inputs |
| `run_sensitivity` | read accumulated state, **took no arguments** | now takes all 5 inputs |

A Gateway-fronted Lambda is **stateless** — it's pure compute behind an MCP
endpoint, with no per-session memory to accumulate into. So the two accumulator
tools have nothing to write to and simply disappear. The "collect six fields one
at a time, confirm each, show N/6 progress" state machine doesn't vanish — it
moves **into the instructions**, and the model holds the partial deal in its own
conversation context until it has every input, then calls `calculate_irr`
**once** with all five.

**Verdict: the guided flow survives as configuration.** What was a server-side
state machine (tools mutating a `Map<sessionId, SessionState>`) collapses into
*instructions + the model's working context*. That is exactly the trade the
harness asks you to make, and for this workflow it holds. The new tools added
on top (`get_market_cap_rates`, `get_comparable_sales`) are pure reads, so they
fit the stateless model with no friction.

## Deploy ⚠️ (this is the first step that spends)

Everything above is local and free. The steps below create AWS resources and
incur charges. Run them yourself with your AWS credentials when ready.

1. **Build + deploy the two Lambdas** (`lambdas/calc`, `lambdas/data`):
   `npm run build` in each, then deploy the `dist/` + `node_modules/` as a
   Node.js Lambda (CodeZip, ARM64). Handler entrypoint: `dist/handler.handler`.

2. **Create a Gateway per Lambda** and register a `lambda-function-arn` target
   using that Lambda's generated `tools.json`:
   ```bash
   agentcore add gateway --name calc
   agentcore add gateway-target --name calc --type lambda-function-arn \
     --lambda-arn <CALC_LAMBDA_ARN> --tool-schema-file ../lambdas/calc/tools.json --gateway calc
   # repeat for data → ../lambdas/data/tools.json
   ```
   Note the resulting **gateway ARNs**. Gateway exposes the tools prefixed by the
   target name (`calc___calculate_irr`, `data___get_market_cap_rates`).

3. **Fill in `deal-analyst.harness.json`** — replace the `<ACCOUNT_ID>`,
   `<REGION>`, and `gateway/<...>-XXXXXXXXXX` placeholders with the real
   execution-role ARN and the two gateway ARNs (re-run `build-config.mjs` only if
   you changed `instructions.md`; it doesn't touch the ARNs once you've edited
   them — keep them in the generated file or move them into the template).

4. **Create the harness** from that body:
   ```bash
   aws bedrock-agentcore-control create-harness \
     --cli-input-json file://deal-analyst.harness.json
   # poll get-harness until status == READY; note the harness ARN
   ```
   The execution role needs `bedrock:InvokeModel*` for the model and permission
   to invoke the two gateways. `allowedTools: ["@calc/*", "@data/*"]` restricts
   the agent to exactly our tools (no built-ins).

5. **Invoke** (Bedrock default model is Sonnet 4.6; we pin it explicitly):
   ```python
   client.invoke_harness(
       harnessArn=HARNESS_ARN,
       runtimeSessionId="<a UUID, >= 33 chars>",
       messages=[{"role": "user", "content": [{"text": "Analyze an Austin office deal."}]}],
   )
   ```
   Session state, memory, identity, and observability are managed — there is no
   DynamoDB, no session map, no audit-log plumbing to write. That's the point.

## Schema provenance

The config shape is grounded in the AgentCore control-plane API reference:
`CreateHarness` (model / systemPrompt / tools / allowedTools / limits),
`HarnessTool` (`type` ∈ remote_mcp | agentcore_browser | agentcore_gateway |
inline_function | agentcore_code_interpreter), `HarnessToolConfiguration`
(`agentCoreGateway` union member), and `HarnessAgentCoreGatewayConfig`
(`gatewayArn` + optional `outboundAuth`, default AWS_IAM SigV4).
