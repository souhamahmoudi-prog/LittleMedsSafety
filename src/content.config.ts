import { defineCollection } from 'astro:content';

const articles = defineCollection({});
const resources = defineCollection({});
const tools = defineCollection({});
const topics = defineCollection({});

export const collections = { articles, resources, tools, topics };
