// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://jareddubbs.com',
  output: 'static',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap()],

  redirects: {
    '/dbt': '/services/dbt',
    '/adhd': '/services/adhd',
    '/talks-and-events': '/talks',
    '/prices-and-faq': '/prices',
    '/appointments': '/book',
    '/contact': '/book',
    '/individual-counselling': '/services/individual',
    '/couples': '/services/couples',
    '/couples-therapy': '/services/couples',
    '/group-therapy': '/services/group',
  },

  adapter: cloudflare(),
});