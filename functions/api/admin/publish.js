import { verifyAuth, githubHeaders, getRepo } from './_auth.js';

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  if (!verifyAuth(context)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  try {
    const { title, description, category, date, readTime, featured, body, image } = await context.request.json();

    if (!title || !description || !body) {
      return Response.json({ error: 'Title, description, and body are required' }, { status: 400, headers });
    }

    // Build slug from title
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Build frontmatter
    const imageLine = image ? `\nimage: "${image}"` : '';
    const markdown = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: ${date}
category: "${category}"
readTime: "${readTime}"
featured: ${featured || false}${imageLine}
---

${body}
`;

    // Commit to GitHub via API
    const repo = getRepo(context);
    const path = `src/content/blog/${slug}.md`;
    const ghHeaders = githubHeaders(context);

    // Check if file already exists
    const existsRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: ghHeaders,
    });

    const commitBody = {
      message: `Add blog post: ${title}`,
      content: btoa(unescape(encodeURIComponent(markdown))),
      branch: 'main',
    };

    // If file exists, include its SHA to update
    if (existsRes.ok) {
      const existing = await existsRes.json();
      commitBody.sha = existing.sha;
      commitBody.message = `Update blog post: ${title}`;
    }

    const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(commitBody),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return Response.json({ error: err.message || 'Failed to publish' }, { status: 500, headers });
    }

    return Response.json({ success: true, slug }, { headers });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers });
  }
}
