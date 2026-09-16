import { sha256Hex } from './security.js';

export interface RssSelectors {
  item?: string | null;
  title?: string | null;
  link?: string | null;
  content?: string | null;
  date?: string | null;
}

export interface ExtractedRssItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  guid: string;
}

type Draft = {
  title: string;
  linkText: string;
  href: string;
  description: string;
  dateText: string;
  datetime: string;
};

const DEFAULT_SELECTORS = {
  title: 'h1,h2,h3,h4,[itemprop="headline"]',
  link: 'a[href]',
  content: 'p,[itemprop="description"]',
  date: 'time,[itemprop="datePublished"]',
};

const AUTO_ITEM_SELECTORS = [
  'main article',
  'article',
  '[role="article"]',
  '.post',
  '.entry',
  '.article',
];

function cleanText(value: string, max = 2_000): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanSelector(value: string | null | undefined): string | null {
  const selector = typeof value === 'string' ? value.trim() : '';
  if (!selector) return null;
  if (selector.length > 300) throw new Error('RSS selector is limited to 300 characters');
  return selector;
}

function absoluteUrl(href: string, sourceUrl: string): string | null {
  try {
    const resolved = new URL(href, sourceUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return null;
  }
}

function parsedDate(value: string, fallback: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

async function finalizeDrafts(drafts: Draft[], sourceUrl: string, now: string): Promise<ExtractedRssItem[]> {
  const result: ExtractedRssItem[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const link = absoluteUrl(draft.href, sourceUrl);
    const title = cleanText(draft.title || draft.linkText, 300);
    if (!link || !title) continue;
    const description = cleanText(draft.description || draft.linkText, 2_000);
    const publishedAt = parsedDate(draft.datetime || draft.dateText, now);
    const guid = await sha256Hex(`${link}\n${title}`);
    if (seen.has(guid)) continue;
    seen.add(guid);
    result.push({ title, link, description, publishedAt, guid });
  }
  return result;
}

async function extractByContainer(
  html: string,
  sourceUrl: string,
  itemSelector: string,
  selectors: RssSelectors,
  now: string,
): Promise<ExtractedRssItem[]> {
  const drafts: Draft[] = [];
  const stack: number[] = [];
  const current = (): Draft | undefined => stack.length ? drafts[stack[stack.length - 1]] : undefined;

  const titleSelector = cleanSelector(selectors.title) || DEFAULT_SELECTORS.title;
  const linkSelector = cleanSelector(selectors.link) || DEFAULT_SELECTORS.link;
  const contentSelector = cleanSelector(selectors.content) || DEFAULT_SELECTORS.content;
  const dateSelector = cleanSelector(selectors.date) || DEFAULT_SELECTORS.date;

  const rewriter = new HTMLRewriter()
    .on(itemSelector, {
      element(element) {
        const index = drafts.push({ title: '', linkText: '', href: '', description: '', dateText: '', datetime: '' }) - 1;
        stack.push(index);
        element.onEndTag(() => {
          const position = stack.lastIndexOf(index);
          if (position >= 0) stack.splice(position, 1);
        });
      },
    })
    .on(titleSelector, {
      text(text) {
        const item = current();
        if (item) item.title += ` ${text.text}`;
      },
    })
    .on(linkSelector, {
      element(element) {
        const item = current();
        if (item && !item.href) item.href = element.getAttribute('href') || '';
      },
      text(text) {
        const item = current();
        if (item) item.linkText += ` ${text.text}`;
      },
    })
    .on(contentSelector, {
      text(text) {
        const item = current();
        if (item && item.description.length < 4_000) item.description += ` ${text.text}`;
      },
    })
    .on(dateSelector, {
      element(element) {
        const item = current();
        if (item && !item.datetime) item.datetime = element.getAttribute('datetime') || element.getAttribute('content') || '';
      },
      text(text) {
        const item = current();
        if (item) item.dateText += ` ${text.text}`;
      },
    });

  await rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text();
  return finalizeDrafts(drafts, sourceUrl, now);
}

async function extractHeadingLinks(html: string, sourceUrl: string, now: string): Promise<ExtractedRssItem[]> {
  const drafts: Draft[] = [];
  const stack: number[] = [];
  const rewriter = new HTMLRewriter().on('h2 a[href],h3 a[href],h4 a[href]', {
    element(element) {
      const index = drafts.push({ title: '', linkText: '', href: element.getAttribute('href') || '', description: '', dateText: '', datetime: '' }) - 1;
      stack.push(index);
      element.onEndTag(() => {
        const position = stack.lastIndexOf(index);
        if (position >= 0) stack.splice(position, 1);
      });
    },
    text(text) {
      if (stack.length) drafts[stack[stack.length - 1]].title += ` ${text.text}`;
    },
  });
  await rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })).text();
  return finalizeDrafts(drafts, sourceUrl, now);
}

export async function extractRssItems(
  html: string,
  sourceUrl: string,
  selectors: RssSelectors = {},
  now = new Date().toISOString(),
): Promise<{ mode: 'selectors' | 'auto-container' | 'auto-headings'; itemSelector: string | null; items: ExtractedRssItem[] }> {
  const explicitItem = cleanSelector(selectors.item);
  if (explicitItem) {
    const items = await extractByContainer(html, sourceUrl, explicitItem, selectors, now);
    return { mode: 'selectors', itemSelector: explicitItem, items };
  }

  for (const itemSelector of AUTO_ITEM_SELECTORS) {
    const items = await extractByContainer(html, sourceUrl, itemSelector, {}, now);
    if (items.length >= 2) return { mode: 'auto-container', itemSelector, items };
  }

  const headings = await extractHeadingLinks(html, sourceUrl, now);
  return { mode: 'auto-headings', itemSelector: null, items: headings };
}
