export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { password } = await context.request.json();
    const adminPassword = context.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return Response.json({ error: 'Admin not configured' }, { status: 500, headers });
    }

    if (password !== adminPassword) {
      return Response.json({ error: 'Incorrect password' }, { status: 401, headers });
    }

    // Create a simple token: base64(password + timestamp)
    // This is validated on each request by checking the password portion
    const token = btoa(JSON.stringify({
      pw: adminPassword,
      ts: Date.now(),
    }));

    return Response.json({ token }, { headers });
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  }
}
