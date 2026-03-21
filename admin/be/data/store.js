import fs from "fs";
import path from "path";
import { slugify } from "../utils/slugify.js";
import { articleToMarkdown, parseMarkdown } from "../utils/markdown.js";

export { slugify };

let NEWS_VAULT;
const LEGACY_DIRS = new Set(["published", "drafts"]);

export function initStore(baseDir) {
  NEWS_VAULT = path.join(baseDir, "news-vault");
  if (!fs.existsSync(NEWS_VAULT)) fs.mkdirSync(NEWS_VAULT, { recursive: true });
}

export function getNewsVault() {
  return NEWS_VAULT;
}

function getArticlePaths(slug) {
  const articleDir = path.join(NEWS_VAULT, slug);
  return {
    articleDir,
    livePath: path.join(articleDir, "live.md"),
    draftPath: path.join(articleDir, "draft.md"),
    mediaDir: path.join(articleDir, "media"),
  };
}

function getArticleSlugs() {
  if (!fs.existsSync(NEWS_VAULT)) return [];
  return fs
    .readdirSync(NEWS_VAULT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !LEGACY_DIRS.has(name));
}

function ensureArticleDirs(slug) {
  const { articleDir, mediaDir } = getArticlePaths(slug);
  if (!fs.existsSync(articleDir)) fs.mkdirSync(articleDir, { recursive: true });
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
}

function readVersion(slug, version) {
  const { livePath, draftPath } = getArticlePaths(slug);
  const filePath = version === "live" ? livePath : draftPath;
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  const article = parseMarkdown(content, {
    slug,
    published: version === "live",
  });

  if (!article) return null;
  article.slug = slug;
  article.version = version;
  return article;
}

function writeVersion(slug, version, article) {
  ensureArticleDirs(slug);
  const { livePath, draftPath } = getArticlePaths(slug);
  const filePath = version === "live" ? livePath : draftPath;
  const normalized = {
    ...article,
    slug,
    published: version === "live",
  };
  const md = articleToMarkdown(normalized);
  fs.writeFileSync(filePath, md);
  return normalized;
}

function locateArticleById(id) {
  for (const slug of getArticleSlugs()) {
    const draft = readVersion(slug, "draft");
    const live = readVersion(slug, "live");
    if (draft?.id === id) return { slug, draft, live, matched: "draft" };
    if (live?.id === id) return { slug, draft, live, matched: "live" };
  }
  return null;
}

function toComparableArticle(article) {
  if (!article) return null;

  const normalizedPublishDate = (() => {
    const date = new Date(article.publishDate || "");
    if (Number.isNaN(date.getTime())) return article.publishDate || null;
    return date.toISOString().slice(0, 16);
  })();

  return {
    title: article.title || "",
    lead: article.lead || "",
    leadImage: article.leadImage || null,
    leadImageAlt: article.leadImageAlt || "",
    body: article.body || "",
    author: article.author || null,
    publishDate: normalizedPublishDate,
  };
}

function hasPendingDraftChanges(draft, live) {
  if (!draft || !live) return false;
  const draftComparable = toComparableArticle(draft);
  const liveComparable = toComparableArticle(live);
  return JSON.stringify(draftComparable) !== JSON.stringify(liveComparable);
}

function toListArticle(slug, draft, live) {
  if (live && draft) {
    const hasPendingChanges = hasPendingDraftChanges(draft, live);
    return {
      ...draft,
      id: draft.id || live.id,
      slug,
      published: true,
      hasPendingChanges,
      hasDraft: true,
      version: "draft",
      publishDate: live.publishDate || draft.publishDate,
      updatedAt: hasPendingChanges
        ? (draft.updatedAt || live.updatedAt)
        : (live.updatedAt || draft.updatedAt),
    };
  }

  if (live) {
    return {
      ...live,
      slug,
      published: true,
      hasPendingChanges: false,
      hasDraft: false,
      version: "live",
    };
  }

  if (draft) {
    return {
      ...draft,
      slug,
      published: false,
      hasPendingChanges: false,
      hasDraft: true,
      version: "draft",
    };
  }

  return null;
}

export function getAllArticles() {
  if (!fs.existsSync(NEWS_VAULT)) return [];

  const articles = [];

  for (const slug of getArticleSlugs()) {
    const draft = readVersion(slug, "draft");
    const live = readVersion(slug, "live");
    const article = toListArticle(slug, draft, live);
    if (article) articles.push(article);
  }

  return articles.sort(
    (a, b) =>
      new Date(b.publishDate || b.updatedAt || b.createdAt) -
      new Date(a.publishDate || a.updatedAt || a.createdAt),
  );
}

export function getArticle(id) {
  const located = locateArticleById(id);
  if (!located) return null;
  const { slug, draft, live } = located;
  if (draft) {
    const hasPendingChanges = Boolean(live) && hasPendingDraftChanges(draft, live);
    return {
      ...draft,
      slug,
      published: Boolean(live),
      hasPendingChanges,
      hasDraft: true,
      version: "draft",
    };
  }

  return {
    ...live,
    slug,
    published: true,
    hasPendingChanges: false,
    hasDraft: false,
    version: "live",
  };
}

export function getArticleBySlug(slug) {
  const draft = readVersion(slug, "draft");
  const live = readVersion(slug, "live");
  return toListArticle(slug, draft, live);
}

export function saveArticle(article, targetVersion = "auto") {
  let slug = article.slug;
  if (!slug) {
    const date = new Date(article.publishDate || article.createdAt);
    const dateStr = date.toISOString().split("T")[0];
    const titleSlug = slugify(article.title);
    slug = `${dateStr}-${titleSlug}`;
  }

  const version =
    targetVersion === "auto"
      ? article.published
        ? "live"
        : "draft"
      : targetVersion;

  const saved = writeVersion(slug, version, article);

  if (version === "draft") {
    const live = readVersion(slug, "live");
    const draft = readVersion(slug, "draft");

    if (live && draft && !hasPendingDraftChanges(draft, live)) {
      removeDraft(slug);
      return {
        ...live,
        slug,
        published: true,
        hasPendingChanges: false,
        hasDraft: false,
        version: "live",
      };
    }
  }

  return saved;
}

export function deleteArticle(id) {
  const located = locateArticleById(id);
  if (!located) return false;
  const { articleDir } = getArticlePaths(located.slug);
  if (!fs.existsSync(articleDir)) return false;
  fs.rmSync(articleDir, { recursive: true, force: true });
  return true;
}

export function removeDraft(slug) {
  const { draftPath } = getArticlePaths(slug);
  if (fs.existsSync(draftPath)) {
    fs.rmSync(draftPath, { force: true });
    return true;
  }
  return false;
}

export function removePublished(slug) {
  const { livePath } = getArticlePaths(slug);
  if (fs.existsSync(livePath)) {
    fs.rmSync(livePath, { force: true });
    return true;
  }
  return false;
}

export function moveArticleFolder(slug, targetStatus) {
  if (targetStatus === "published") {
    const draft = readVersion(slug, "draft");
    if (!draft) return false;
    writeVersion(slug, "live", {
      ...draft,
      updatedAt: new Date().toISOString(),
      publishDate: draft.publishDate || new Date().toISOString(),
    });
    removeDraft(slug);
    return true;
  }

  if (targetStatus === "drafts") {
    const live = readVersion(slug, "live");
    if (!live) return false;

    const existingDraft = readVersion(slug, "draft");
    if (!existingDraft) {
      writeVersion(slug, "draft", {
        ...live,
        published: false,
        updatedAt: new Date().toISOString(),
      });
    }

    removePublished(slug);
    return true;
  }

  return false;
}

export function getArticleImagesDir(articleSlugOrId) {
  const directPaths = getArticlePaths(articleSlugOrId);
  if (fs.existsSync(directPaths.articleDir)) {
    if (!fs.existsSync(directPaths.mediaDir)) {
      fs.mkdirSync(directPaths.mediaDir, { recursive: true });
    }
    return directPaths.mediaDir;
  }

  const article = getArticle(articleSlugOrId);
  if (article) {
    const paths = getArticlePaths(article.slug);
    if (!fs.existsSync(paths.mediaDir)) fs.mkdirSync(paths.mediaDir, { recursive: true });
    return paths.mediaDir;
  }
  return null;
}
