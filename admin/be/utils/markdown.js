import matter from 'gray-matter';

function extractMediaFilename(value) {
  if (!value || typeof value !== 'string') return null;
  const clean = value.split('?')[0].split('#')[0];
  const match = clean.match(/\/([^/]+\.(?:jpg|jpeg|png|webp|gif|svg|avif))$/i);
  return match ? match[1] : null;
}

function toStorageMediaPath(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('./media/')) return value;
  const filename = extractMediaFilename(value);
  return filename ? `./media/${filename}` : value;
}

function toRuntimeMediaPath(value, fallbackPathPrefix) {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('./media/')) return value;
  const filename = value.slice('./media/'.length);
  return `${fallbackPathPrefix}${filename}`;
}

function normalizeMarkdownImagePathsForStorage(markdownBody) {
  if (!markdownBody) return '';
  return markdownBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
    const normalized = toStorageMediaPath(url.trim());
    return normalized ? `![${alt}](${normalized})` : full;
  });
}

function normalizeMarkdownImagePathsForRuntime(markdownBody, fallbackPathPrefix) {
  if (!markdownBody) return '';
  return markdownBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
    const normalized = toRuntimeMediaPath(url.trim(), fallbackPathPrefix);
    return normalized ? `![${alt}](${normalized})` : full;
  });
}

function parseLegacyFrontmatterOrNull(rawFrontmatter) {
  try {
    return JSON.parse(rawFrontmatter);
  } catch {
    return null;
  }
}

function toIsoStringOrNull(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function parseAnyFrontmatter(content) {
  try {
    return matter(content);
  } catch {
    const legacy = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!legacy) return null;
    const parsed = parseLegacyFrontmatterOrNull(legacy[1]);
    if (!parsed) return null;
    return { data: parsed, content: legacy[2] || '' };
  }
}

// article obj -> Astro-style YAML frontmatter + Markdown body
export function articleToMarkdown(article) {
  const markdownBody = normalizeMarkdownImagePathsForStorage(article.body || '');

  const heroImage = toStorageMediaPath(article.leadImage);

  const frontmatter = {
    title: article.title || '',
    description: article.lead || '',
    pubDate: article.publishDate || new Date().toISOString(),
    ...(article.updatedAt ? { updatedDate: article.updatedAt } : {}),
    ...(heroImage ? { heroImage } : {}),
    ...(article.leadImageAlt ? { heroImageAlt: article.leadImageAlt } : {}),
    id: article.id,
    ...(article.author ? { author: article.author } : {}),
    published: Boolean(article.published),
    createdAt: article.createdAt,
  };

  return matter.stringify(markdownBody, frontmatter);
}

// frontmatter string -> admin article obj (body stays markdown for editor)
export function parseMarkdown(content, options = {}) {
  const parsed = parseAnyFrontmatter(content);
  if (!parsed) return null;

  const meta = parsed.data || {};
  const slug = options.slug || null;
  const isPublished = options.published ?? false;
  const pathPrefix = slug
    ? `/uploads/${slug}/media/`
    : './media/';

  const rawBody = parsed.content || '';
  const bodyWithRuntimePaths = normalizeMarkdownImagePathsForRuntime(rawBody, pathPrefix);

  const title = meta.title || '';
  const lead = meta.lead ?? meta.description ?? '';
  const leadImage = toRuntimeMediaPath(meta.leadImage ?? meta.heroImage ?? null, pathPrefix);
  const leadImageAlt = meta.leadImageAlt ?? meta.heroImageAlt ?? '';
  const publishDate =
    toIsoStringOrNull(meta.publishDate ?? meta.pubDate) || new Date().toISOString();
  const updatedAt = toIsoStringOrNull(meta.updatedAt ?? meta.updatedDate) || publishDate;
  const createdAt = toIsoStringOrNull(meta.createdAt) || publishDate;
  const id =
    meta.id || `${slug || 'article'}-${publishDate.slice(0, 10)}`;

  return {
    id,
    title,
    lead,
    leadImage,
    leadImageAlt,
    author: meta.author || null,
    published: Boolean(meta.published ?? isPublished),
    publishDate,
    createdAt,
    updatedAt,
    images: meta.images || [],
    body: bodyWithRuntimePaths,
  };
}
