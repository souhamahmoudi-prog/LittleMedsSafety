import { defineCollection } from 'astro:content';

const articles = defineCollection({});
const resources = defineCollection({});
const tools = defineCollection({});

export const collections = { articles, resources, tools };
