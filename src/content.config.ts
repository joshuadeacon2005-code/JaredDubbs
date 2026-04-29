import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(['ADHD', 'DBT', 'Anxiety & Depression', 'Therapy & Wellbeing', 'LGBTQ+', 'ASD & Autism']),
    author: z.string().default('Jared Dubbs, MoC'),
    readTime: z.string(),
    featured: z.boolean().default(false),
    image: z.string().optional(),
  }),
});

// Editable text blocks managed via the admin. Each JSON file in
// src/content/site-copy/ becomes one entry, keyed by filename (slug).
// Frontend code MUST always include the original hardcoded text as a
// fallback so the page never renders an empty string.
const siteCopy = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/site-copy' }),
  schema: z.object({
    label: z.string(),
    body: z.string(),
    page: z.string(),
    updated: z.string().optional(),
  }),
});

export const collections = { blog, siteCopy };
