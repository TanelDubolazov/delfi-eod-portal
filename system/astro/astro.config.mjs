// @ts-check

import mdx from "@astrojs/mdx";
import path from "node:path";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://web.demofoundry.ee/",
  integrations: [mdx()],
  vite: {
    server: {
      fs: {
        allow: [path.resolve("../../")],
      },
    },
  },
});
