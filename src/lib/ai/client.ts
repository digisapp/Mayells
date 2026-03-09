import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

const provider = process.env.AI_PROVIDER || 'xai';

export function getModel() {
  if (provider === 'xai') return xai('grok-3-fast');
  if (provider === 'anthropic') return anthropic('claude-sonnet-4-20250514');
  return openai('gpt-4o');
}

export function getFastModel() {
  if (provider === 'xai') return xai('grok-3-fast');
  if (provider === 'anthropic') return anthropic('claude-haiku-4-5-20251001');
  return openai('gpt-4o-mini');
}

export function getVisionModel() {
  if (provider === 'xai') return xai('grok-2-vision-1212');
  if (provider === 'anthropic') return anthropic('claude-sonnet-4-20250514');
  return openai('gpt-4o');
}

/**
 * Get the xAI Grok model for the public chat widget.
 * Uses grok-4-1-fast-non-reasoning for vision support (image uploads).
 */
export function getChatModel() {
  return xai('grok-4-1-fast-non-reasoning');
}
