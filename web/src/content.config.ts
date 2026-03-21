import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const SEGMENT_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SLUG_PATTERN = new RegExp(`^${SEGMENT_PATTERN}(?:/${SEGMENT_PATTERN})*$`);

function assertSafeSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}". Use lowercase letters, numbers, hyphens, and optional path segments.`,
    );
  }
}

const news = defineCollection({
  // Load Markdown files in the `news-vault/published` directory.
  loader: glob({
    base: "../news-vault/published",
    pattern: "**/newspost.md",
    generateId: ({ entry, data }) => {
      if (typeof data.slug === "string" && data.slug.length > 0) {
        assertSafeSlug(data.slug);
        return data.slug;
      }
      const fallbackSlug = entry.replace(/[\\/]newspost\.md$/, "");
      assertSafeSlug(fallbackSlug);
      return fallbackSlug;
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
      heroImageAlt: z.string().optional(),
    }),
});

export const collections = { news };
