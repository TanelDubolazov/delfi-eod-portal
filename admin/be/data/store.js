import fs from 'fs';
import path from 'path';
import { slugify } from '../utils/slugify.js';
import { articleToMarkdown, parseMarkdown } from '../utils/markdown.js';

export { slugify };

let NEWS_VAULT;

export function initStore(baseDir) {
  NEWS_VAULT = path.join(baseDir, 'news-vault');
  if (!fs.existsSync(NEWS_VAULT)) fs.mkdirSync(NEWS_VAULT, { recursive: true });
}

export function getNewsVault() {
  return NEWS_VAULT;
}

export function getAllArticles() {
  if (!fs.existsSync(NEWS_VAULT)) return [];

  const dirs = fs.readdirSync(NEWS_VAULT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const articles = [];
  for (const dir of dirs) {
    const mdPath = path.join(NEWS_VAULT, dir, 'news.md');
    if (!fs.existsSync(mdPath)) continue;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const article = parseMarkdown(content);
    if (article) {
      article.slug = dir;
      articles.push(article);
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
  const mdPath = path.join(NEWS_VAULT, slug, 'news.md');
  if (!fs.existsSync(mdPath)) return null;
  const content = fs.readFileSync(mdPath, 'utf-8');
  const article = parseMarkdown(content);
  if (article) article.slug = slug;
  return article;
}

export function saveArticle(article) {
  const slug = article.slug || slugify(article.title);
  const articleDir = path.join(NEWS_VAULT, slug);
  const imagesDir = path.join(articleDir, 'images');

  if (!fs.existsSync(articleDir)) fs.mkdirSync(articleDir, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  article.slug = slug;
  const md = articleToMarkdown(article);
  fs.writeFileSync(path.join(articleDir, 'news.md'), md);
  return article;
}

export function deleteArticle(id) {
  const article = getArticle(id);
  if (!article) return false;
  const articleDir = path.join(NEWS_VAULT, article.slug);
  if (fs.existsSync(articleDir)) {
    fs.rmSync(articleDir, { recursive: true });
    return true;
  }
  return false;
}

export function getArticleImagesDir(articleSlugOrId) {

  let dir = path.join(NEWS_VAULT, articleSlugOrId, 'images');
  if (fs.existsSync(dir)) return dir;

  const article = getArticle(articleSlugOrId);
  if (article) {
    dir = path.join(NEWS_VAULT, article.slug, 'images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return null;
}
