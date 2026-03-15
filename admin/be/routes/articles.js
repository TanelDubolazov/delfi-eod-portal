import { Router } from "express";
import {
  getAllArticles,
  getArticle,
  saveArticle,
  deleteArticle,
  moveArticleFolder,
} from "../data/store.js";

// TODO: soft-lock system

export const articlesRouter = Router();

articlesRouter.get("/", (req, res) => {
  const articles = getAllArticles();
  res.json(articles);
});

articlesRouter.get("/:id", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

articlesRouter.post("/", (req, res) => {
  const { title, lead, leadImage, body, images, author } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const article = {
    id: crypto.randomUUID(),
    title,
    lead: lead || "",
    leadImage: leadImage || null,
    body: body || "",
    images: images || [],
    author: author || null,
    published: false,
    publishDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveArticle(article);
  res.status(201).json(article);
});

articlesRouter.put("/:id", (req, res) => {
  const existing = getArticle(req.params.id);
  if (!existing) return res.status(404).json({ error: "Article not found" });

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  saveArticle(updated);
  res.json(updated);
});

articlesRouter.put("/:id/autosave", (req, res) => {
  const existing = getArticle(req.params.id);
  if (!existing) return res.status(404).json({ error: "Article not found" });

  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };

  saveArticle(updated);
  res.json({ autosavedAt: new Date().toISOString() });
});

articlesRouter.delete("/:id", (req, res) => {
  const success = deleteArticle(req.params.id);
  if (!success) return res.status(404).json({ error: "Article not found" });
  res.json({ success: true });
});

articlesRouter.post("/:id/publish", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });
  article.published = true;
  article.publishDate = new Date().toISOString();
  article.updatedAt = new Date().toISOString();
  moveArticleFolder(article.slug, "published");
  saveArticle(article);
  res.json(article);
});

articlesRouter.post("/:id/unpublish", (req, res) => {
  const article = getArticle(req.params.id);
  if (!article) return res.status(404).json({ error: "Article not found" });
  article.published = false;
  article.updatedAt = new Date().toISOString();
  moveArticleFolder(article.slug, "drafts");
  saveArticle(article);
  res.json(article);
});
