import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getNewsVault } from '../data/store.js';

export const imagesRouter = Router();

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

imagesRouter.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided or invalid format' });
  }

  const { articleSlug, context } = req.body;
  if (!articleSlug) {
    return res.status(400).json({ error: 'articleSlug is required' });
  }

  try {
    const newsVault = getNewsVault();
    const imagesDir = path.join(newsVault, articleSlug, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const imageContext = context || 'article';
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';

    let filename;
    if (imageContext === 'lead') {
      filename = `lead${ext}`;
    } else {
      const existing = fs.readdirSync(imagesDir).filter(f => f.startsWith('image'));
      const num = String(existing.length + 1).padStart(3, '0');
      filename = `image${num}${ext}`;
    }

    const outputPath = path.join(imagesDir, filename);
    fs.writeFileSync(outputPath, req.file.buffer);

    res.json({
      filename,
      originalName: req.file.originalname,
      url: `/uploads/${articleSlug}/images/${filename}`,
      size: req.file.size,
      context: imageContext,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

imagesRouter.get('/:articleSlug', (req, res) => {
  const newsVault = getNewsVault();
  const imagesDir = path.join(newsVault, req.params.articleSlug, 'images');
  if (!fs.existsSync(imagesDir)) return res.json([]);

  const files = fs.readdirSync(imagesDir).filter(f => !f.startsWith('.'));
  const images = files.map(f => ({
    filename: f,
    url: `/uploads/${req.params.articleSlug}/images/${f}`,
    size: fs.statSync(path.join(imagesDir, f)).size,
  }));
  res.json(images);
});

imagesRouter.delete('/:articleSlug/:filename', (req, res) => {
  const newsVault = getNewsVault();
  const filePath = path.join(newsVault, req.params.articleSlug, 'images', req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});
