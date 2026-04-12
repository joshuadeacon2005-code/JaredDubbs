import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');
  return rss({
    title: 'Jared Dubbs Counselling — Blog',
    description: 'Articles on ADHD, DBT, anxiety, depression, and mental health from a counsellor in Central Hong Kong.',
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.description,
        link: `/blog/${post.id}/`,
        categories: [post.data.category],
      })),
    customData: '<language>en-HK</language>',
  });
}
