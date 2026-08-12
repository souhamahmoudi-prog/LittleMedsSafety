import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string(),
    category: z.enum([
      'Medication Safety Concepts',
      'Pediatric Medication Safety',
      'Process Improvement',
      'Clinical Practice',
      'High-Alert Medications',
    ]),
    author: z.string(),
    publishDate: z.coerce.date(),
    lastReviewedDate: z.coerce.date(),
    featuredImage: z.string().optional(),
    references: z
      .array(
        z.object({
          label: z.string(),
          url: z.string().url().optional(),
        }),
      )
      .default([]),
    status: z.enum(['draft', 'published']).default('draft'),
  }),
});
const resources = defineCollection({});
const tools = defineCollection({});
const topics = defineCollection({});

export const collections = { articles, resources, tools, topics };
