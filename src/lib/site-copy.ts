import { getEntry } from 'astro:content';

// Always-fallback wrapper around the siteCopy collection. Returns the
// admin-edited body if the block exists and has content, otherwise the
// hardcoded fallback. The page must never render an empty string.
export async function siteCopy(slug: string, fallback: string): Promise<string> {
  try {
    const entry = await getEntry('siteCopy', slug);
    const body = entry?.data?.body?.trim();
    return body && body.length > 0 ? body : fallback;
  } catch {
    return fallback;
  }
}
