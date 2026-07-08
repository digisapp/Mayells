import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

const provider = process.env.AI_PROVIDER || 'xai';

const models = {
  standard: { xai: 'grok-3-fast', anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o' },
  fast: { xai: 'grok-3-fast', anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini' },
  vision: { xai: 'grok-2-vision-1212', anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o' },
} as const;

// The public chat widget always uses xAI (Grok) for its vision support,
// independent of AI_PROVIDER — kept as a standalone constant so the provider
// model map doesn't carry misleading per-provider duplicates.
const CHAT_MODEL = 'grok-4-1-fast-non-reasoning';

type ModelType = keyof typeof models | 'chat';

export function getModel(type: ModelType = 'standard') {
  if (type === 'chat') return xai(CHAT_MODEL);
  const modelId = models[type][provider as keyof (typeof models)[keyof typeof models]] ?? models[type].openai;
  if (provider === 'xai') return xai(modelId);
  if (provider === 'anthropic') return anthropic(modelId);
  return openai(modelId);
}
