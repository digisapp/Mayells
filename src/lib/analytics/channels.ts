/**
 * How a lead reached Mayells, in the order the admin charts stack them.
 * Colours are the validated categorical slots 1–5, fixed per channel so a
 * channel keeps its colour whichever filter is applied.
 */
export const LEAD_CHANNELS = [
  { key: 'web_form', label: 'mayells.com form', color: '#2a78d6' },
  { key: 'city_form', label: 'City site form', color: '#eb6834' },
  { key: 'chat', label: 'Website chat', color: '#1baf7a' },
  { key: 'ai_phone', label: 'AI phone line', color: '#eda100' },
  { key: 'manual', label: 'Added by staff', color: '#e87ba4' },
] as const;

export type LeadChannel = (typeof LEAD_CHANNELS)[number]['key'];

export const CALL_OUTCOMES = [
  { key: 'lead', label: 'Became a lead', color: '#2a78d6' },
  { key: 'transferred', label: 'Transferred to staff', color: '#eb6834' },
  { key: 'info', label: 'Questions only', color: '#1baf7a' },
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number]['key'];
