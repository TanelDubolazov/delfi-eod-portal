import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const news = defineCollection({
  // Load Markdown files in the `news-vault/published` directory.
  loader: glob({
    base: "../../news-vault/published",
    pattern: "**/newspost.md",
    generateId: ({ entry, data }) => {
      if (typeof data.slug === "string" && data.slug.length > 0) {
        return data.slug;
      }
      return entry.replace(/\/newspost\.md$/, "");
    },
  }),
  // Type-check frontmatter using a schema
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      // Transform string to Date object
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      heroImage: image().optional(),
    }),
});

export const collections = { news };
