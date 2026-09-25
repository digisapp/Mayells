/**
 * Scroll `el` into view if its top is above the sticky header's bottom edge.
 * Used when a lead form is swapped for its (much shorter) confirmation, which
 * would otherwise sit above the viewport on a phone. Where it lands is set by
 * the element's scroll-margin-top. Honours reduced motion.
 */
export function revealIfHidden(el: HTMLElement | null, headerBottom = 80) {
  if (!el || el.getBoundingClientRect().top >= headerBottom) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}
