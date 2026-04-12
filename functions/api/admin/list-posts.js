import { verifyAuth, githubHeaders, getRepo } from './_auth.js';

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  if (!verifyAuth(context)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  try {
    const repo = getRepo(context);
    const ghHeaders = githubHeaders(context);

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/src/content/blog`, {
      headers: ghHeaders,
    });

    if (!res.ok) {
      return Response.json({ posts: [] }, { headers });
    }

    const files = await res.json();
    const posts = [];

    for (const file of files) {
      if (!file.name.endsWith('.md')) continue;

      // Fetch file content to parse frontmatter
      const fileRes = await fetch(file.url, { headers: ghHeaders });
      if (!fileRes.ok) continue;

      const fileData = await fileRes.json();
      const content = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));

      // Parse frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;

      const fm = match[1];
      const title = fm.match(/title:\s*"(.+?)"/)?.[1] || file.name.replace('.md', '');
      const category = fm.match(/category:\s*"(.+?)"/)?.[1] || '';
      const date = fm.match(/date:\s*(.+)/)?.[1]?.trim() || '';

      posts.push({ title, category, date, slug: file.name.replace('.md', '') });
    }

    // Sort by date descending
    posts.sort((a, b) => b.date.localeCompare(a.date));

    return Response.json({ posts }, { headers });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers });
  }
}
