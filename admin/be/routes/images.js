import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { getNewsVault } from "../data/store.js";

export const imagesRouter = Router();

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

function resolveArticleLocation(articleSlug, createIfMissing = false) {
  const newsVault = getNewsVault();
  const statuses = ["published", "drafts"];

  for (const status of statuses) {
    const articleDir = path.join(newsVault, status, articleSlug);
    if (fs.existsSync(articleDir)) {
      const mediaDir = path.join(articleDir, "media");
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      return { status, mediaDir };
    }
  }

  if (!createIfMissing) return null;

  const draftArticleDir = path.join(newsVault, "drafts", articleSlug);
  const mediaDir = path.join(draftArticleDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  return { status: "drafts", mediaDir };
}

function nextImageFilename(mediaDir) {
  const files = fs.readdirSync(mediaDir).filter((f) => /^\d+\.jpg$/i.test(f));
  const max = files.reduce((highest, file) => {
    const match = file.match(/^(\d+)\.jpg$/i);
    if (!match) return highest;
    return Math.max(highest, Number(match[1]));
  }, 0);
  return `${max + 1}.jpg`;
}

imagesRouter.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No image provided or invalid format" });
  }

  const { articleSlug, context } = req.body;
  if (!articleSlug) {
    return res.status(400).json({ error: "articleSlug is required" });
  }

  try {
    const imageContext = context || "article";
    const { status, mediaDir } = resolveArticleLocation(articleSlug, true);

    const filename =
      imageContext === "lead" ? "lead.jpg" : nextImageFilename(mediaDir);
    const outputPath = path.join(mediaDir, filename);

    await sharp(req.file.buffer)
      .rotate()
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    res.json({
      filename,
      originalName: req.file.originalname,
      url: `/uploads/${status}/${articleSlug}/media/${filename}`,
      size: req.file.size,
      context: imageContext,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Image upload error:", err);
    res.status(500).json({ error: "Failed to save image" });
  }
});

imagesRouter.get("/:articleSlug", (req, res) => {
  const location = resolveArticleLocation(req.params.articleSlug);
  if (!location) return res.json([]);
  const { status, mediaDir } = location;

  const files = fs.readdirSync(mediaDir).filter((f) => !f.startsWith("."));
  const images = files.map((f) => ({
    filename: f,
    url: `/uploads/${status}/${req.params.articleSlug}/media/${f}`,
    size: fs.statSync(path.join(mediaDir, f)).size,
  }));
  res.json(images);
});

imagesRouter.delete("/:articleSlug/:filename", (req, res) => {
  const location = resolveArticleLocation(req.params.articleSlug);
  if (!location) {
    return res.status(404).json({ error: "Article not found" });
  }
  const { mediaDir } = location;
  const filePath = path.join(mediaDir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Image not found" });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});
