import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pager } from './Pager';

const render = (page: number, totalPages: number) =>
  renderToStaticMarkup(createElement(Pager, { page, totalPages, hrefFor: (n: number) => `/admin/x?page=${n}` }));

describe('Pager', () => {
  it('renders nothing for a single page', () => {
    expect(render(1, 1)).toBe('');
    expect(render(1, 0)).toBe('');
  });

  it('renders Previous/Next within range', () => {
    const html = render(2, 3);
    expect(html).toContain('Page 2 of 3');
    expect(html).toContain('href="/admin/x?page=1"');
    expect(html).toContain('href="/admin/x?page=3"');
  });

  it('stays visible past the end and links to the last page', () => {
    const html = render(4, 2);
    expect(html).toContain('Go to last page');
    expect(html).toContain('href="/admin/x?page=2"');
    expect(html).not.toContain('href="/admin/x?page=5"');
  });

  it('offers the first page when the list emptied entirely', () => {
    const html = render(2, 0);
    expect(html).toContain('Go to first page');
    expect(html).toContain('href="/admin/x?page=1"');
  });
});
