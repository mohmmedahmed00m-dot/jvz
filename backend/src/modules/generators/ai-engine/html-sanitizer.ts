import sanitizeHtml from 'sanitize-html';

/**
 * HTML sanitization for Review & Bonus generators (Section 3.1 / 3.2).
 * Strips disallowed tags (script, iframe, style, etc.) and keeps only the
 * semantic tags + CSS classes used by the generators' output format.
 */
const SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'div', 'span',
    'a', 'strong', 'em', 'b', 'i', 'br', 'blockquote',
  ],
  allowedAttributes: {
    a: ['href', 'class'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // No <script> / <iframe> / <style> / on* handlers survive this config.
  disallowedTagsMode: 'discard',
};

export function sanitizeReviewBonusHtml(dirty: string): string {
  return sanitizeHtml(dirty, SANITIZE_CONFIG);
}

/** Basic well-formedness check (no unclosed tags) used by the parser. */
export function isWellFormedHtml(html: string): boolean {
  // sanitize-html balances/closes unclosed tags, so after sanitization a
  // non-empty document that still contains expected structure passes.
  if (!html || !html.trim()) return false;
  // Reject if any disallowed tag survived (shouldn't, but defensive).
  if (/<script|<iframe|<style/i.test(html)) return false;
  // crude balance check for the tags we expect
  const tags = ['h1', 'h2', 'h3', 'p', 'ul', 'li', 'div', 'span', 'a'];
  for (const t of tags) {
    const open = (html.match(new RegExp(`<${t}[ >]`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${t}>`, 'gi')) || []).length;
    if (open !== close) return false;
  }
  return true;
}
