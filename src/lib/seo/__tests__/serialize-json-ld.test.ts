import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from '../structured-data';

describe('serializeJsonLd', () => {
  it('produces valid JSON that round-trips', () => {
    const data = { '@type': 'Product', name: 'A Vase', price: 1200 };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('escapes < > & so content cannot break out of the <script> tag', () => {
    const out = serializeJsonLd({ description: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');
  });

  it('still parses back to the original malicious-looking string', () => {
    const payload = { note: 'a & b < c > d' };
    expect(JSON.parse(serializeJsonLd(payload))).toEqual(payload);
  });
});
