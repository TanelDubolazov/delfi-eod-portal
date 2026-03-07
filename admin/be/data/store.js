import fs from 'fs';
import path from 'path';
import { slugify } from '../utils/slugify.js';
import { articleToMarkdown, parseMarkdown } from '../utils/markdown.js';

export { slugify };

let NEWS_VAULT;

export function initStore(baseDir) {
  NEWS_VAULT = path.join(baseDir, 'news-vault');
  if (!fs.existsSync(NEWS_VAULT)) fs.mkdirSync(NEWS_VAULT, { recursive: true });
  const publishedDir = path.join(NEWS_VAULT, 'published');
  const draftsDir = path.join(NEWS_VAULT, 'drafts');
  if (!fs.existsSync(publishedDir)) fs.mkdirSync(publishedDir, { recursive: true });
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
}

export function getNewsVault() {
  return NEWS_VAULT;
}

export function getAllArticles() {
  if (!fs.existsSync(NEWS_VAULT)) return [];

  const articles = [];
  const subdirs = ['published', 'drafts'];
  for (const subdir of subdirs) {
    const subPath = path.join(NEWS_VAULT, subdir);
    if (!fs.existsSync(subPath)) continue;
    
    const dirs = fs.readdirSync(subPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const mdPath = path.join(subPath, dir, 'newspost.md');
      if (!fs.existsSync(mdPath)) continue;
      const content = fs.readFileSync(mdPath, 'utf-8');
      const article = parseMarkdown(content);
      if (article) {
        article.slug = dir;
        articles.push(article);
      }
    }
  }

  return articles.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));
}

export function getArticle(id) {
  // scans all dirs, not great for large vaults
  const articles = getAllArticles();
  return articles.find(a => a.id === id) || null;
}

export function getArticleBySlug(slug) {
  const subdirs = ['published', 'drafts'];
  for (const subdir of subdirs) {
    const mdPath = path.join(NEWS_VAULT, subdir, slug, 'newspost.md');
    if (!fs.existsSync(mdPath)) continue;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const article = parseMarkdown(content);
    if (article) article.slug = slug;
    return article;
  }
  return null;
}

export function saveArticle(article) {
  let slug = article.slug;
  if (!slug) {
    const date = new Date(article.publishDate || article.createdAt);
    const dateStr = date.toISOString().split('T')[0];
    const titleSlug = slugify(article.title);
    slug = `${dateStr}-${titleSlug}`;
  }

  const status = article.published ? 'published' : 'drafts';
  const articleDir = path.join(NEWS_VAULT, status, slug);
  const mediaDir = path.join(articleDir, 'media');

  if (!fs.existsSync(articleDir)) fs.mkdirSync(articleDir, { recursive: true });
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

  article.slug = slug;
  const md = articleToMarkdown(article);
  fs.writeFileSync(path.join(articleDir, 'newspost.md'), md);
  return article;
}

export function deleteArticle(id) {
  const article = getArticle(id);
  if (!article) return false;
  const subdirs = ['published', 'drafts'];
  for (const subdir of subdirs) {
    const articleDir = path.join(NEWS_VAULT, subdir, article.slug);
    if (fs.existsSync(articleDir)) {
      fs.rmSync(articleDir, { recursive: true });
      return true;
    }
  }
  return false;
}

export function getArticleImagesDir(articleSlugOrId) {
  const subdirs = ['published', 'drafts'];
  for (const subdir of subdirs) {
    const dir = path.join(NEWS_VAULT, subdir, articleSlugOrId, 'media');
    if (fs.existsSync(dir)) return dir;
  }

  const article = getArticle(articleSlugOrId);
  if (article) {
    const status = article.published ? 'published' : 'drafts';
    const dir = path.join(NEWS_VAULT, status, article.slug, 'media');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return null;
}
