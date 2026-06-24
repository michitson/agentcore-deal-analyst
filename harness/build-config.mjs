/**
 * Generate deal-analyst.harness.json — the CreateHarness request body for the
 * deal-analyst harness. The system prompt is inlined from instructions.md so the
 * deployed harness can never drift from the readable source.
 *
 * Shape is grounded in the AgentCore control-plane API:
 *   CreateHarness            -> model, systemPrompt[], tools[], allowedTools[], limits
 *   HarnessTool              -> { type, name, config }
 *   HarnessToolConfiguration -> { agentCoreGateway: HarnessAgentCoreGatewayConfig }
 *   HarnessAgentCoreGatewayConfig -> { gatewayArn, outboundAuth? (defaults AWS_IAM) }
 *
 * The gateway ARNs and execution-role ARN are placeholders — fill them in after
 * the gateways exist (see README.md, "Deploy"). Nothing here touches AWS.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(resolve(here, 'instructions.md'), 'utf8').trim();

const config = {
  harnessName: 'deal_analyst',
  // Fill in after creating the execution role (see README "Deploy").
  executionRoleArn: 'arn:aws:iam::<ACCOUNT_ID>:role/DealAnalystHarnessRole',
  // Pinned to match v1 (config.ts BEDROCK_MODEL_ID); also the harness default.
  model: {
    bedrockModelConfig: { modelId: 'global.anthropic.claude-sonnet-4-6' },
  },
  systemPrompt: [{ text: instructions }],
  tools: [
    {
      type: 'agentcore_gateway',
      name: 'calc',
      config: {
        agentCoreGateway: {
          gatewayArn:
            'arn:aws:bedrock-agentcore:<REGION>:<ACCOUNT_ID>:gateway/calc-XXXXXXXXXX',
        },
      },
    },
    {
      type: 'agentcore_gateway',
      name: 'data',
      config: {
        agentCoreGateway: {
          gatewayArn:
            'arn:aws:bedrock-agentcore:<REGION>:<ACCOUNT_ID>:gateway/data-XXXXXXXXXX',
        },
      },
    },
  ],
  // Restrict the agent to exactly our two gateways' tools (no built-ins).
  allowedTools: ['@calc/*', '@data/*'],
  maxIterations: 20,
  maxTokens: 8192,
  timeoutSeconds: 300,
};

const out = resolve(here, 'deal-analyst.harness.json');
writeFileSync(out, JSON.stringify(config, null, 2) + '\n');
console.log(`Wrote harness config (${config.tools.length} gateways) to ${out}`);
