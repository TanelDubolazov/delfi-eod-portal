// @ts-check

import path from "node:path";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://web.demofoundry.ee/", // for absolute URLs in sitemap, RSS, etc.
  vite: {
    server: {
      fs: {
        allow: [path.resolve("."), path.resolve("../news-vault")],
      },
    },
  },
});
