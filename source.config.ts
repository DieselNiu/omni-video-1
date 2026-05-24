import { defineCollections, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

/**
 * Pages, like privacy policy, terms of service, etc.
 *
 * title is required, but description is optional in frontmatter
 */
export const pages = defineCollections({
  type: 'doc',
  dir: 'content/pages',
  schema: frontmatterSchema.extend({
    date: z.string().date(),
    published: z.boolean().default(true),
  }),
});

/**
 * Blog authors
 */
export const author = defineCollections({
  type: 'doc',
  dir: 'content/author',
  schema: z.object({
    name: z.string(),
    avatar: z.string(),
    description: z.string().optional(),
  }),
});

/**
 * Blog categories
 */
export const category = defineCollections({
  type: 'doc',
  dir: 'content/category',
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
});

/**
 * Blog posts
 */
export const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: frontmatterSchema.extend({
    image: z.string(),
    date: z.string().date(),
    published: z.boolean().default(true),
    premium: z.boolean().optional(),
    categories: z.array(z.string()),
    author: z.string(),
  }),
});
