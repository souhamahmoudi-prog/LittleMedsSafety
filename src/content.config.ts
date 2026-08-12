import { defineCollection, z } from 'astro:content';

const optionalNonEmptyString = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const optionalUrl = optionalNonEmptyString.pipe(z.string().url().optional());

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
    publishDate: z.coerce.date().optional(),
    lastReviewedDate: z.coerce.date().optional(),
    featuredImage: optionalNonEmptyString,
    references: z
      .array(
        z.object({
          label: z.string(),
          url: optionalUrl,
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
