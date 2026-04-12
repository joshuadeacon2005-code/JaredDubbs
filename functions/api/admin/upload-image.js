import { verifyAuth, githubHeaders, getRepo } from './_auth.js';

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  if (!verifyAuth(context)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  try {
    const { filename, content } = await context.request.json();

    if (!filename || !content) {
      return Response.json({ error: 'Filename and content are required' }, { status: 400, headers });
    }

    const repo = getRepo(context);
    const path = `public/images/${filename}`;
    const ghHeaders = githubHeaders(context);

    // Check if file exists
    const existsRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: ghHeaders,
    });

    const body = {
      message: `Upload image: ${filename}`,
      content: content,  // Already base64 from the frontend
      branch: 'main',
    };

    if (existsRes.ok) {
      const existing = await existsRes.json();
      body.sha = existing.sha;
      body.message = `Update image: ${filename}`;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      return Response.json({ error: err.message || 'Failed to upload image' }, { status: 500, headers });
    }

    return Response.json({ success: true, path: `/images/${filename}` }, { headers });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers });
  }
}
