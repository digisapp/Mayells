import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';

const provider = process.env.AI_PROVIDER || 'openai';

/**
 * Get the AI model for text generation tasks.
 * Defaults to GPT-4o for OpenAI or Claude Sonnet for Anthropic.
 */
export function getModel() {
  if (provider === 'anthropic') {
    return anthropic('claude-sonnet-4-20250514');
  }
  return openai('gpt-4o');
}

/**
 * Get a fast/cheap model for simpler tasks (tagging, classification).
 */
export function getFastModel() {
  if (provider === 'anthropic') {
    return anthropic('claude-haiku-4-5-20251001');
  }
  return openai('gpt-4o-mini');
}

/**
 * Get the vision model for image analysis.
 */
export function getVisionModel() {
  if (provider === 'anthropic') {
    return anthropic('claude-sonnet-4-20250514');
  }
  return openai('gpt-4o');
}

/**
 * Get the xAI Grok model for the public chat widget.
 * Uses grok-4-1-fast-non-reasoning for vision support (image uploads).
 */
export function getChatModel() {
  return xai('grok-4-1-fast-non-reasoning');
}
