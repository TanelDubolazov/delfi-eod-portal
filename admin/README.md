# Delfi EOD Admin Panel

Admin panel for managing Delfi EOD articles. Articles are stored as markdown files on disk.

## Structure

```
admin/
├── be/                  # Express backend (port 3001)
│   ├── index.js         # Server entry point
│   ├── data/store.js    # Article CRUD (filesystem)
│   ├── routes/
│   │   ├── articles.js  # /api/articles endpoints
│   │   └── images.js    # /api/images endpoints
│   └── utils/
│       ├── slugify.js   # URL-safe slug generation
│       └── markdown.js  # Frontmatter serialization
└── fe/                  # Vue 3 + TypeScript frontend (port 5173)
    └── src/
        ├── views/       # Dashboard, ArticleEdit
        ├── components/  # NavBar
        ├── api.ts       # Axios client
        └── router.ts    # Vue Router
```

## Prerequisites

- Node.js ≥ 18

## Quick start

```bash
# Install dependencies
cd be && npm install
cd ../fe && npm install

# Run both servers (from project root)
cd ../..
./dev.sh
```

Or start them separately:

```bash
# Backend (http://localhost:3001)
cd be && npm run dev

# Frontend (http://localhost:5173)
cd fe && npm run dev
```

## API

| Method | Endpoint                      | Description         |
| ------ | ----------------------------- | ------------------- |
| GET    | `/api/health`                 | Health check        |
| GET    | `/api/articles`               | List all articles   |
| GET    | `/api/articles/:id`           | Get article by ID   |
| POST   | `/api/articles`               | Create article      |
| PUT    | `/api/articles/:id`           | Update article      |
| PATCH  | `/api/articles/:id/publish`   | Publish article     |
| PATCH  | `/api/articles/:id/unpublish` | Unpublish article   |
| DELETE | `/api/articles/:id`           | Delete article      |
| POST   | `/api/images/upload`          | Upload image        |
| GET    | `/api/images/:slug`           | List article images |
| DELETE | `/api/images/:slug/:filename` | Delete image        |
