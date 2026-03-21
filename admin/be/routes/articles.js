import { Router } from "express";
import {
  getAllArticles,
  getArticle,
  saveArticle,
  deleteArticle,
  moveArticleFolder,
} from "../data/store.js";
import {
  acquireArticleLock,
  getArticleLock,
  refreshArticleLock,
  releaseArticleLock,
  validateArticleLock,
} from "../utils/locks.js";

// TODO: soft-lock system

export const articlesRouter = Router();

async function ensureArticleLock(req, res, article) {
  const token = req.get("x-article-lock-token") || "";
  const result = await validateArticleLock(req.session, article.slug, token);
  if (result.ok) return true;

  if (result.reason === "unavailable") {
    res.status(503).json({ error: result.error || "Lock service unavailable" });
    return false;
  }

  if (result.reason === "locked") {
    res.status(423).json({ error: "Article is locked by another editor", lock: result.lock });
    return false;
  }

  res.status(423).json({ error: "Article lock missing or expired" });
  return false;
}

articlesRouter.get("/", (req, res) => {
  const articles = getAllArticles();
  res.json(articles);
});

articlesRouter.get("/:id", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

articlesRouter.get("/:id/lock", async (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  try {
    const state = await getArticleLock(req.session, article.slug);
    if (!state.available) {
      return res.status(503).json({ error: state.error || "Lock service unavailable" });
    }
    res.json({ lock: state.lock || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to read lock state" });
  }
});

articlesRouter.post("/:id/lock/acquire", async (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  const { installationId, token } = req.body || {};
  if (!installationId || !token) {
    return res.status(400).json({ error: "installationId and token are required" });
  }

  try {
    const result = await acquireArticleLock(req.session, article.slug, installationId, token);
    if (result.ok) return res.json({ success: true, lock: result.lock });
    if (result.reason === "locked") {
      return res.status(423).json({ error: "Article is locked by another editor", lock: result.lock });
    }
    if (result.reason === "unavailable") {
      return res.status(503).json({ error: result.error || "Lock service unavailable" });
    }
    res.status(409).json({ error: "Could not acquire lock", lock: result.lock || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to acquire lock" });
  }
});

articlesRouter.post("/:id/lock/refresh", async (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  const { installationId, token } = req.body || {};
  if (!installationId || !token) {
    return res.status(400).json({ error: "installationId and token are required" });
  }

  try {
    const result = await refreshArticleLock(req.session, article.slug, installationId, token);
    if (result.ok) return res.json({ success: true, lock: result.lock });
    if (result.reason === "locked") {
      return res.status(423).json({ error: "Article is locked by another editor", lock: result.lock });
    }
    if (result.reason === "unavailable") {
      return res.status(503).json({ error: result.error || "Lock service unavailable" });
    }
    res.status(409).json({ error: "Lock expired or missing" });
  } catch (err) {
    res.status(500).json({ error: "Failed to refresh lock" });
  }
});

articlesRouter.post("/:id/lock/release", async (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });

  try {
    const result = await releaseArticleLock(req.session, article.slug, token);
    if (result.ok) return res.json({ success: true });
    if (result.reason === "locked") {
      return res.status(423).json({ error: "Article is locked by another editor", lock: result.lock });
    }
    res.status(409).json({ error: "Could not release lock" });
  } catch (err) {
    res.status(500).json({ error: "Failed to release lock" });
  }
});

articlesRouter.post("/", (req, res) => {
  const { title, lead, leadImage, leadImageAlt, body, images, author } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const article = {
    id: crypto.randomUUID(),
    title,
    lead: lead || "",
    leadImage: leadImage || null,
    leadImageAlt: leadImageAlt || "",
    body: body || "",
    images: images || [],
    author: author || null,
    published: false,
    publishDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const saved = saveArticle(article, "draft");
  res.status(201).json(saved);
});

articlesRouter.put("/:id", async (req, res) => {
  const existing = getArticle(req.params.id);
  if (!existing) return res.status(404).json({ error: "Article not found" });
  if (!(await ensureArticleLock(req, res, existing))) return;

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const targetVersion = existing.published ? "draft" : "draft";
  const saved = saveArticle(
    {
      ...updated,
      published: targetVersion === "live",
    },
    targetVersion,
  );
  res.json(saved);
});

articlesRouter.delete("/:id", (req, res) => {
  const success = deleteArticle(req.params.id);
  if (!success) return res.status(404).json({ error: "Article not found" });
  res.json({ success: true });
});

articlesRouter.post("/:id/publish", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  const now = new Date().toISOString();
  const wasPublished = Boolean(article.published);
  article.published = true;
  article.publishDate = wasPublished
    ? article.publishDate || now
    : now;
  article.updatedAt = now;
  moveArticleFolder(article.slug, "published");

  const saved = saveArticle(article, "live");
  res.json(saved);
});

articlesRouter.post("/:id/unpublish", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });

  article.published = false;
  article.updatedAt = new Date().toISOString();
  moveArticleFolder(article.slug, "drafts");

  const updated = getArticle(article.id);
  res.json(updated || article);
});
