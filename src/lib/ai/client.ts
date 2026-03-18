import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

const provider = process.env.AI_PROVIDER || 'xai';

const models = {
  standard: { xai: 'grok-3-fast', anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o' },
  fast: { xai: 'grok-3-fast', anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini' },
  vision: { xai: 'grok-2-vision-1212', anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o' },
  /** Public chat widget. Always uses xAI grok-4-1-fast-non-reasoning for vision support. */
  chat: { xai: 'grok-4-1-fast-non-reasoning', anthropic: 'grok-4-1-fast-non-reasoning', openai: 'grok-4-1-fast-non-reasoning' },
} as const;

type ModelType = keyof typeof models;

export function getModel(type: ModelType = 'standard') {
  const modelId = models[type][provider as keyof (typeof models)[ModelType]] ?? models[type].openai;
  if (type === 'chat') return xai(modelId);
  if (provider === 'xai') return xai(modelId);
  if (provider === 'anthropic') return anthropic(modelId);
  return openai(modelId);
}
