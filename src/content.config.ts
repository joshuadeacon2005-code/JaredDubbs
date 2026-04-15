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

export const collections = { blog };
