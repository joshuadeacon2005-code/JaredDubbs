// Shared auth check for admin endpoints
export function verifyAuth(context) {
  const authHeader = context.request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  try {
    const token = authHeader.slice(7);
    const { pw } = JSON.parse(atob(token));
    return pw === context.env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export function githubHeaders(context) {
  return {
    Authorization: `token ${context.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'JaredDubbsCMS',
  };
}

export function getRepo(context) {
  return context.env.GITHUB_REPO || 'joshuadeacon2005-code/JaredDubbs';
}
