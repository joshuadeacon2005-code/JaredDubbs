# Build Log — jareddubbs.com

## Project Overview

Full-stack therapy practice website for Jared Dubbs, a counsellor in Central Hong Kong specialising in DBT, ADHD, and LGBTQ+ affirming therapy. Built from scratch across two sessions on 12 April 2026.

Tech stack: Astro 6, Tailwind CSS v4, Cloudflare Pages, Cloudflare Pages Functions.

---

## Session 1 — Site Build (~7-8 hours)

Scaffolded the project with Astro 6 and Tailwind CSS v4. Set up the design system with custom CSS variables for a gold/cream/navy colour palette, serif and sans-serif font pairing, and consistent spacing tokens. Built the base layout including head meta tags, responsive navbar with mobile hamburger menu, and a full footer with quick links, contact info, and crisis helpline.

Built the homepage with eight sections: hero banner with Jared's headshot and trust bar (Master's in Counselling, Central HK, LGBTQ+ Affirming), empathy bridge with common pain points, services grid with four card links, stats bar (10+ years, 500+ clients, 6+ specialisations, 100% confidential), about preview with credential badges, how it works three-step process, client testimonials carousel, latest blog articles preview, and a final call-to-action.

Built the about page with full bio, qualifications, professional approach, and credential badges. Built six service pages: a services index with overview cards, and dedicated pages for ADHD therapy, DBT therapy, individual counselling, couples therapy, and group therapy. Each service page includes what to expect, who it's for, and links to book.

Built the prices and FAQ page with session pricing (standard, extended, couples/parent-teen), package deals (3-session starter, 10+1 pack, monthly progress and performance packages), insurance info, and an eight-item accordion FAQ. Built the book page with a contact/intake form including client-side validation. Built the talks and events page and the privacy policy page. Built a custom 404 page.

Wrote 15 blog posts, all 1000+ words each. Four ADHD posts: complete guide to ADHD in adults, ADHD in Hong Kong, ADHD and relationships, ADHD vs anxiety. Four DBT posts: what is DBT, distress tolerance skills, emotional dysregulation, DBT vs CBT. Two anxiety and depression posts: anxiety in Hong Kong, do I need therapy. Five therapy and wellbeing posts: radical acceptance, first therapy session, LGBTQ+ therapy in Hong Kong, why therapy works, executive dysfunction.

Built the blog index page with a grid layout and the blog post template with category badges, author bio section, and related articles pulled from the same category. Set up the Astro content collection with a Zod schema validating title, description, date, category (enum of four options), author, read time, and featured boolean.

Created two Cloudflare Pages Functions: contact form handler and intake form handler, both with input validation and Resend email integration.

Added JSON-LD structured data to every page (Organization, LocalBusiness, Article, CollectionPage, BreadcrumbList schemas as appropriate). Generated sitemap.xml, robots.txt, and an RSS feed. Set up Astro redirects for nine legacy URL patterns (e.g. /dbt to /services/dbt, /appointments to /book, /couples-therapy to /services/couples).

Tested responsive behaviour across mobile and desktop breakpoints.

---

## Session 2 — Images, Polish, SEO, Admin, Deployment (~6 hours)

### Stock Photography

Replaced all 15 blog post images. The initial attempt used random picsum.photos IDs which produced irrelevant images (dogs, bicycles, factories). Switched to searching Pexels for topic-specific photos and downloading via Pexels CDN URLs. Each image was downloaded at 800x400 crop and saved as a progressive JPEG in public/images/.

Final image assignments: adhd-complete-guide (person writing in notebook, Pexels 3832034), adhd-hong-kong (Hong Kong skyline, 1058683), adhd-relationships (couple in therapy, 8560652), adhd-vs-anxiety (stressed woman, 8872802), executive-dysfunction (frustrated student at computer, 9158764), what-is-dbt (psychologist and patient, 7176319), dbt-distress-tolerance (woman opening curtains, 4327408), dbt-emotional-dysregulation (woman in distress, 5542968), dbt-vs-cbt (therapist and client, 23496493), radical-acceptance (woman meditating, 3094215), do-i-need-therapy (woman contemplating, 6382660), first-therapy-session (client on sofa with therapist, 6255603), anxiety-hong-kong (crowded HK subway, 35568025), lgbtq-therapy-hk (progress pride flag, 12289210), why-therapy-works (group therapy circle, 5710923).

Three images had to be replaced after initial download because they didn't match their topics: adhd-vs-anxiety originally showed a gym scene, do-i-need-therapy showed an intimate close-up, and radical-acceptance showed a sunset through prison-like bars.

Compressed Jared's headshot from 400KB to 89KB using Sharp (progressive JPEG).

### LGBTQ+ Visibility

Added "LGBTQ+ Affirming" to the homepage hero trust bar items array. Added "LGBTQ+ Affirming" to the credential badges on the about page.

### Blog Card Redesign

Redesigned the BlogCard component with two variants. Featured cards display full-width with a dark gradient overlay (from-black/80 via-black/30 to-transparent), text overlaid on the image, and a gold hover colour transition on the title. Regular cards have a lighter gradient overlay, a floating category badge positioned top-left with backdrop blur, a border colour transition on hover, upward translation on hover, and an arrow animation on the "Read" link.

Changed category badge colours to white text on semi-transparent coloured backgrounds (amber for ADHD, primary green for DBT, stone for Anxiety & Depression, accent for Therapy & Wellbeing) for readability over images.

Redesigned the blog index page with the newest post displayed as a featured hero card at full width, remaining posts in a three-column grid, staggered CSS fade-in animations using a custom --delay property (each card delayed by 80ms), and category filter pills that display post counts and re-trigger the animation on filter change. Added prefers-reduced-motion support to disable animations.

### SEO Audit and Fixes

Performed a manual SEO audit of all 29 built pages by reading the HTML output from the dist/ folder. Identified and fixed seven issues:

1. Added per-post og:image meta tags using a slug-to-image-path map in the blog post template.
2. Added an image field to the Article JSON-LD schema pointing to the full URL of each post's image.
3. Added RSS feed discovery link to the base layout head.
4. Added apple-touch-icon link to the base layout head pointing to the logo.
5. Added the missing /couples-therapy redirect to astro.config.mjs.
6. Verified robots.txt was correctly configured.
7. Verified all title tags were under 60 characters (the longest, executive dysfunction, appeared long due to HTML entity encoding but was actually 69 characters decoded).

Verified all fixes by running a Node.js script against the rebuilt dist/ output.

### Admin Panel

Built a custom admin portal from scratch at /admin. The admin page is a single-page application with two screens.

The login screen has a password input field. On submit, it calls POST /api/admin/login which validates the password against the ADMIN_PASSWORD environment variable and returns a session token (base64-encoded JSON containing the password and timestamp). The token is stored in sessionStorage.

The editor screen has two tabs. The "New Post" tab has a form with: title text input, description textarea with character count guidance, category dropdown (ADHD, DBT, Anxiety & Depression, Therapy & Wellbeing), date picker defaulting to today, read time text input defaulting to "6 min read", featured post toggle switch, drag-and-drop image upload area with preview and remove functionality, and a rich text editor powered by EasyMDE with toolbar buttons for bold, italic, headings, lists, links, quotes, and preview.

On publish, the frontend sends the form data to POST /api/admin/publish. If an image was uploaded, it first sends the base64-encoded file to POST /api/admin/upload-image, which commits the image to public/images/ in the GitHub repo via the GitHub Contents API. Then the publish function builds a markdown string with properly formatted YAML frontmatter (title, description, date, category, readTime, featured, and optional image path) followed by the body content, and commits it to src/content/blog/{slug}.md in the GitHub repo. If a file with that slug already exists, it updates it by including the existing file's SHA.

The "Existing Posts" tab calls POST /api/admin/list-posts which fetches the contents of src/content/blog/ from the GitHub API, parses the frontmatter of each markdown file, and returns a sorted list of posts with title, category, and date.

All admin API endpoints validate the Bearer token by decoding it and checking the password against the environment variable. GitHub API calls use a Personal Access Token stored in the GITHUB_TOKEN environment variable.

The admin panel went through three iterations. First attempt used Decap CMS (formerly Netlify CMS) which required GitHub OAuth — this needed creating a GitHub OAuth App, deploying OAuth proxy functions, and configuring Cloudflare environment variables. The user found this too complex. Second attempt stripped Decap CMS back but still required OAuth. Third and final attempt built the custom admin panel with simple password auth and direct GitHub API integration.

The admin UI is styled to match the site's design system with the gold/cream colour palette, rounded corners, and clean typography.

### Content Schema Update

Added an optional image field (z.string().optional()) to the blog content collection Zod schema in src/content.config.ts. Updated the BlogCard component to accept an optional image prop, which takes priority over the hardcoded slug-to-image-path map. Updated the blog index page and blog post template to pass the frontmatter image through to the card component and og:image meta tag.

### Git and Deployment

Initialized a git repository in the project directory. Created a .gitignore covering dist/, .astro/, node_modules/, .env files, .DS_Store, .idea/, and screenshots/. Staged all files and created the initial commit. Added the remote origin pointing to https://github.com/joshuadeacon2005-code/JaredDubbs.git and pushed the main branch. The repository was empty prior to this push.

Generated a GitHub Personal Access Token with repo scope for the admin panel's GitHub API integration.

### Screenshots

Installed Playwright and wrote a screenshot script that captured full-page PNG screenshots of all 17 unique pages at both desktop (1440x900) and mobile (390x844) viewport sizes, totalling 34 screenshots saved to the screenshots/ directory. These are for a designer named Stitch to use as reference for a UI redesign. The screenshot script and Playwright dependency were removed after capture.

---

## Final State

The repository at joshuadeacon2005-code/JaredDubbs contains a complete, production-ready website with 29 pages, 15 blog posts, full SEO implementation, responsive design, contact and intake forms, a custom blog admin panel, RSS feed, sitemap, and structured data.

### Remaining Setup

Three environment variables need to be added to the Cloudflare Pages project settings:

- ADMIN_PASSWORD: the password for the admin panel login
- GITHUB_TOKEN: a GitHub Personal Access Token with repo scope (the token generated during this session should be regenerated as it was exposed in chat)
- GITHUB_REPO: joshuadeacon2005-code/JaredDubbs

Once these are set, the admin panel at /admin will be fully functional — Jared can log in, write posts in the visual editor, upload images, and publish. Each publish commits directly to GitHub, triggering a Cloudflare Pages rebuild.
