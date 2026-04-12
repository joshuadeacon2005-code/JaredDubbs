# jareddubbs.com — Deployment & Handoff Guide

## Quick Start

```bash
cd site
npm install
npm run dev    # Local dev at localhost:4321
npm run build  # Production build to dist/
```

## Cloudflare Pages Deployment

### 1. Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > Pages
2. Create a new project > Connect to Git
3. Select the repository containing the `site/` directory
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `site`
   - **Node.js version**: 20+ (set via environment variable `NODE_VERSION=20`)

### 2. Environment Variables

Set these in Cloudflare Pages > Settings > Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `CLINIKO_API_KEY` | No | Cliniko API key for patient intake. Get from Cliniko > Settings > API Keys |
| `GA_MEASUREMENT_ID` | No | Google Analytics 4 measurement ID (e.g., `G-XXXXXXXXXX`) |
| `RESEND_API_KEY` | No | Resend API key for contact form email notifications |

The site works without any of these — forms will show a success message and log submissions.

### 3. Custom Domain

1. In Cloudflare Pages > Custom domains > Add domain
2. Enter `jareddubbs.com` and `www.jareddubbs.com`
3. If the domain is already on Cloudflare DNS, it will auto-configure
4. Otherwise, update nameservers to Cloudflare

### 4. DNS Records

If not auto-configured:
```
CNAME  jareddubbs.com      <project-name>.pages.dev
CNAME  www.jareddubbs.com  <project-name>.pages.dev
```

### 5. SSL

Cloudflare Pages provides automatic SSL. Verify:
- SSL/TLS encryption mode: **Full (strict)**
- Always Use HTTPS: **On**
- HSTS: **Enabled**

---

## Cloudflare Workers (Functions)

The `functions/` directory contains Cloudflare Workers that handle:

- **`/api/intake`** — Intake form submissions (creates Cliniko patients)
- **`/api/contact`** — General contact form (sends email via Resend)

These are automatically deployed with Cloudflare Pages Functions.

---

## Content Management

### Blog Posts

Add new blog posts to `site/src/content/blog/`:

```markdown
---
title: "Your Post Title"
description: "150-char description for SEO"
date: 2026-05-01
category: "ADHD"  # Options: ADHD, DBT, Anxiety & Depression, Therapy & Wellbeing
readTime: "6 min read"
featured: false
---

Your content here...
```

### Internal Links

Use relative links to other pages:
- Services: `/services/dbt`, `/services/adhd`, `/services/individual`, `/services/couples`, `/services/group`
- Other: `/about`, `/talks`, `/prices`, `/book`, `/privacy`, `/blog`

---

## TODO Items for Jared

These items need real data from Jared before launch:

### Must-Do

- [ ] **Replace placeholder images**: Add real photos to `site/public/images/`:
  - `jared-headshot-sm.jpg` — Professional headshot (used on about page, blog posts)
  - `jared-casual.jpg` — Casual/lifestyle photo (used on about page)
  - Recommended: 800x800px minimum, optimised JPEG
- [ ] **Verify stats numbers** in `src/components/StatsBar.astro`:
  - Years experience (currently "10+")
  - Clients supported (currently "500+")
  - Therapeutic modalities (currently "6+")
- [ ] **Google Analytics**: Create GA4 property and set `GA_MEASUREMENT_ID` env var
- [ ] **Cliniko API**: Generate API key from Cliniko Settings > API Keys and set `CLINIKO_API_KEY` env var
- [ ] **Test intake form**: Submit a test form and verify it creates a patient in Cliniko

### Nice-to-Have

- [ ] **Google Business Profile**: Update with new website URL
- [ ] **Google Search Console**: Add property and submit sitemap at `https://jareddubbs.com/sitemap-index.xml`
- [ ] **Resend email**: Set up Resend account for contact form notifications
- [ ] **Expand ADHD personal story** on `/services/adhd` page
- [ ] **Add DBT training details** on `/services/dbt` page
- [ ] **Add ADHD assessment process details** on `/services/adhd` page
- [ ] **Review office hours** on footer (currently "By appointment")
- [ ] **Add hobbies/interests** to "Beyond the Office" section on `/about`

---

## Architecture Overview

```
site/
├── src/
│   ├── components/     # 16 reusable Astro components
│   ├── content/
│   │   └── blog/       # 15 Markdown blog posts
│   ├── layouts/        # BaseLayout.astro (shared HTML shell)
│   ├── pages/          # All routes (15 pages + blog dynamic route)
│   │   ├── services/   # 5 service pages + redirect index
│   │   └── blog/       # Blog index + [...slug] dynamic route
│   └── styles/         # global.css (Tailwind v4 theme)
├── functions/
│   └── api/            # Cloudflare Workers (intake.js, contact.js)
├── public/
│   ├── images/         # Static images
│   ├── favicon.svg
│   ├── favicon.ico
│   └── robots.txt
├── astro.config.mjs    # Astro config + Squarespace redirects
└── package.json
```

**Stack**: Astro 6, Tailwind CSS v4, Cloudflare Pages + Workers

---

## Squarespace URL Redirects

The following old Squarespace URLs are redirected:

| Old URL | New URL |
|---------|---------|
| `/dbt` | `/services/dbt` |
| `/adhd` | `/services/adhd` |
| `/talks-and-events` | `/talks` |
| `/prices-and-faq` | `/prices` |
| `/appointments` | `/book` |
| `/contact` | `/book` |
| `/individual-counselling` | `/services/individual` |
| `/couples` | `/services/couples` |
| `/group-therapy` | `/services/group` |

---

## SEO Checklist

- [x] XML Sitemap at `/sitemap-index.xml` (28 URLs)
- [x] RSS Feed at `/rss.xml` (15 posts)
- [x] `robots.txt` with sitemap reference
- [x] JSON-LD schema on all pages (LocalBusiness, Person, MedicalWebPage, Article, FAQPage, ContactPage, CollectionPage)
- [x] Open Graph and Twitter Card meta tags
- [x] Canonical URLs on all pages
- [x] All titles under 70 characters
- [x] All descriptions 50-160 characters
- [x] 9 Squarespace URL redirects configured
- [ ] Submit sitemap to Google Search Console
- [ ] Verify Google Business Profile links to new site
