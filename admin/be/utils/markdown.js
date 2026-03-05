// article obj -> frontmatter + html body string
export function articleToMarkdown(article) {
  const frontmatter = {
    id: article.id,
    title: article.title,
    lead: article.lead || '',
    leadImage: article.leadImage || null,
    author: article.author || null,
    published: article.published,
    publishDate: article.publishDate,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    images: article.images || [],
  };

  const fm = JSON.stringify(frontmatter, null, 2);
  return `---\n${fm}\n---\n\n${article.body || ''}`;
}

// frontmatter string -> article obj
export function parseMarkdown(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;

  try {
    const meta = JSON.parse(match[1]);
    return { ...meta, body: match[2] || '' };
  } catch {
    return null;
  }
}
