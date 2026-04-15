// Worker entry point — routes /api/* requests, serves static assets otherwise

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CLINIKO_BASE = 'https://api.au2.cliniko.com/v1';

function clinikoHeaders(apiKey) {
  return {
    Authorization: 'Basic ' + btoa(apiKey + ':'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'JDCoreDev (hello@jareddubbs.com)',
  };
}

async function clinikoGet(path, apiKey) {
  const res = await fetch(`${CLINIKO_BASE}${path}`, { headers: clinikoHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cliniko ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const token = authHeader.slice(7);
    const { pw } = JSON.parse(atob(token));
    return pw === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

function githubHeaders(env) {
  return {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'JaredDubbsCMS',
  };
}

function getRepo(env) {
  return env.GITHUB_REPO || 'joshuadeacon2005-code/JaredDubbs';
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleClinikoAvailableTimes(env) {
  try {
    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Booking system not configured', slots: [] });
    }

    let appointmentTypeId = env.CLINIKO_APPOINTMENT_TYPE_ID;
    let practitionerId = env.CLINIKO_PRACTITIONER_ID;

    if (!appointmentTypeId) {
      const data = await clinikoGet('/appointment_types', apiKey);
      const types = data.appointment_types || [];
      const discovery = types.find(
        (t) =>
          t.name &&
          (t.name.toLowerCase().includes('discovery') ||
            t.name.toLowerCase().includes('initial') ||
            t.name.toLowerCase().includes('free') ||
            (t.name.toLowerCase().includes('phone') && t.duration_in_minutes <= 20))
      );
      appointmentTypeId = discovery?.id;
    }

    if (!practitionerId) {
      const data = await clinikoGet('/practitioners', apiKey);
      const practitioners = data.practitioners || [];
      const jared = practitioners.find(
        (p) =>
          (p.first_name && p.first_name.toLowerCase().includes('jared')) ||
          practitioners.length === 1
      );
      practitionerId = jared?.id;
    }

    if (!appointmentTypeId || !practitionerId) {
      return Response.json({
        error: 'Discovery call appointment type not found in Cliniko',
        slots: [],
        debug: { appointmentTypeId, practitionerId },
      });
    }

    const from = new Date();
    from.setDate(from.getDate() + 1);
    const to = new Date();
    to.setDate(to.getDate() + 15);
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const businessId = env.CLINIKO_BUSINESS_ID || '';
    const businessParam = businessId ? `&business_id=${businessId}` : '';

    const data = await clinikoGet(
      `/available_times?appointment_type_id=${appointmentTypeId}&practitioner_id=${practitionerId}&from=${fromStr}&to=${toStr}${businessParam}`,
      apiKey
    );

    const slotsByDate = {};
    for (const slot of data.available_times || []) {
      const date = slot.appointment_start.split('T')[0];
      if (!slotsByDate[date]) slotsByDate[date] = [];
      slotsByDate[date].push({
        start: slot.appointment_start,
        practitionerId,
        appointmentTypeId,
      });
    }

    return Response.json({
      slots: slotsByDate,
      appointmentTypeId,
      practitionerId,
      range: { from: fromStr, to: toStr },
    }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (err) {
    console.error('Available times error:', err);
    return Response.json({ error: 'Could not load available times', slots: [], message: err.message });
  }
}

async function handleClinikoBook(request, env) {
  try {
    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Booking system not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { name, email, phone, appointmentStart, appointmentTypeId, practitionerId } = body;

    if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!appointmentStart || !appointmentTypeId || !practitionerId) {
      return Response.json({ error: 'Appointment details are required' }, { status: 400 });
    }

    const headers = clinikoHeaders(apiKey);

    // Find or create patient
    let patient;
    const searchRes = await fetch(
      `${CLINIKO_BASE}/patients?q=email:=${encodeURIComponent(email)}`,
      { headers }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      patient = (searchData.patients || []).find(
        (p) => p.email?.toLowerCase() === email.toLowerCase()
      );
    }

    if (!patient) {
      const nameParts = name.trim().split(' ');
      const patientRes = await fetch(`${CLINIKO_BASE}/patients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || '-',
          email,
          patient_phone_numbers: phone ? [{ number: phone, phone_type: 'Mobile' }] : undefined,
        }),
      });
      if (!patientRes.ok) {
        const errText = await patientRes.text();
        console.error('Patient creation failed:', patientRes.status, errText);
        return Response.json(
          { error: 'Could not create your profile. Please try again or call us directly.' },
          { status: 500 }
        );
      }
      patient = await patientRes.json();
    }

    // Book appointment
    const appointmentRes = await fetch(`${CLINIKO_BASE}/individual_appointments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        appointment_start: appointmentStart,
        appointment_type_id: appointmentTypeId,
        practitioner_id: practitionerId,
        patient_id: patient.id,
        notes: 'Booked via website — 15-min free discovery call',
      }),
    });

    if (!appointmentRes.ok) {
      const errText = await appointmentRes.text();
      console.error('Appointment creation failed:', appointmentRes.status, errText);
      if (appointmentRes.status === 422 || appointmentRes.status === 409) {
        return Response.json(
          { error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409 }
        );
      }
      return Response.json(
        { error: 'Could not book the appointment. Please try again or call us directly.' },
        { status: 500 }
      );
    }

    const startDate = new Date(appointmentStart);
    const displayDate = startDate.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const displayTime = startDate.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Hong_Kong',
    });

    return Response.json({
      success: true,
      message: `Your discovery call is booked for ${displayDate} at ${displayTime} (HKT).`,
    });
  } catch (err) {
    console.error('Booking error:', err);
    return Response.json(
      { error: 'Something went wrong. Please try calling us at +852 5775 3743.' },
      { status: 500 }
    );
  }
}

async function handleContact(request) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!message || message.trim().length < 10) {
      return Response.json({ error: 'Please provide a message' }, { status: 400 });
    }

    console.log('Contact form submission:', { name, email, message: message.substring(0, 100) });

    return Response.json({
      success: true,
      message: "Thank you for your message. We'll be in touch within 24 hours.",
    });
  } catch (err) {
    console.error('Contact error:', err);
    return Response.json(
      { error: 'Something went wrong. Please email hello@jareddubbs.com directly.' },
      { status: 500 }
    );
  }
}

async function handleIntake(request, env) {
  try {
    const body = await request.json();
    const { name, email, phone, reason, session_type, preferred_times } = body;

    if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!reason || reason.trim().length < 20) {
      return Response.json(
        { error: 'Please provide more detail about what brings you here' },
        { status: 400 }
      );
    }

    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json(
        { success: true, message: 'Form received. We will be in touch within 24 hours.' }
      );
    }

    const nameParts = name.trim().split(' ');
    const patientRes = await fetch(`${CLINIKO_BASE}/patients`, {
      method: 'POST',
      headers: clinikoHeaders(apiKey),
      body: JSON.stringify({
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' ') || '-',
        email,
        patient_phone_numbers: phone ? [{ number: phone, phone_type: 'Mobile' }] : undefined,
      }),
    });

    if (!patientRes.ok) {
      return Response.json(
        { success: true, message: 'Thank you. We will be in touch within 24 hours.' }
      );
    }

    const patient = await patientRes.json();

    return Response.json({
      success: true,
      message: 'Thank you for reaching out. We will be in touch within 24 hours to arrange your free discovery call.',
      patientId: patient.id,
    });
  } catch (err) {
    console.error('Intake error:', err);
    return Response.json(
      { error: 'Something went wrong. Please try calling us at +852 5775 3743 or emailing hello@jareddubbs.com' },
      { status: 500 }
    );
  }
}

async function handleAdminLogin(request, env) {
  try {
    const { password } = await request.json();
    if (!env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Admin not configured' }, { status: 500 });
    }
    if (password !== env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Incorrect password' }, { status: 401 });
    }
    const token = btoa(JSON.stringify({ pw: env.ADMIN_PASSWORD, ts: Date.now() }));
    return Response.json({ token });
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}

async function handleAdminListPosts(request, env) {
  if (!verifyAuth(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const repo = getRepo(env);
    const ghHeaders = githubHeaders(env);
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/src/content/blog`, {
      headers: ghHeaders,
    });
    if (!res.ok) return Response.json({ posts: [] });

    const files = await res.json();
    const posts = [];
    for (const file of files) {
      if (!file.name.endsWith('.md')) continue;
      const fileRes = await fetch(file.url, { headers: ghHeaders });
      if (!fileRes.ok) continue;
      const fileData = await fileRes.json();
      const content = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;
      const fm = match[1];
      posts.push({
        title: fm.match(/title:\s*"(.+?)"/)?.[1] || file.name.replace('.md', ''),
        category: fm.match(/category:\s*"(.+?)"/)?.[1] || '',
        date: fm.match(/date:\s*(.+)/)?.[1]?.trim() || '',
        slug: file.name.replace('.md', ''),
      });
    }
    posts.sort((a, b) => b.date.localeCompare(a.date));
    return Response.json({ posts });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function handleAdminPublish(request, env) {
  if (!verifyAuth(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { title, description, category, date, readTime, featured, body, image } =
      await request.json();
    if (!title || !description || !body) {
      return Response.json({ error: 'Title, description, and body are required' }, { status: 400 });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const imageLine = image ? `\nimage: "${image}"` : '';
    const markdown = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndescription: "${description.replace(/"/g, '\\"')}"\ndate: ${date}\ncategory: "${category}"\nreadTime: "${readTime}"\nfeatured: ${featured || false}${imageLine}\n---\n\n${body}\n`;

    const repo = getRepo(env);
    const path = `src/content/blog/${slug}.md`;
    const ghHeaders = githubHeaders(env);

    const existsRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: ghHeaders,
    });
    const commitBody = {
      message: `Add blog post: ${title}`,
      content: btoa(unescape(encodeURIComponent(markdown))),
      branch: 'main',
    };
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
      return Response.json({ error: err.message || 'Failed to publish' }, { status: 500 });
    }
    return Response.json({ success: true, slug });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function handleAdminUploadImage(request, env) {
  if (!verifyAuth(request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { filename, content } = await request.json();
    if (!filename || !content) {
      return Response.json({ error: 'Filename and content are required' }, { status: 400 });
    }
    const repo = getRepo(env);
    const path = `public/images/${filename}`;
    const ghHeaders = githubHeaders(env);

    const existsRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: ghHeaders,
    });
    const body = { message: `Upload image: ${filename}`, content, branch: 'main' };
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
      return Response.json({ error: err.message || 'Failed to upload image' }, { status: 500 });
    }
    return Response.json({ success: true, path: `/images/${filename}` });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // API routing
    if (pathname === '/api/cliniko/available-times' && method === 'GET') {
      return handleClinikoAvailableTimes(env);
    }
    if (pathname === '/api/cliniko/book' && method === 'POST') {
      return handleClinikoBook(request, env);
    }
    if (pathname === '/api/contact' && method === 'POST') {
      return handleContact(request);
    }
    if (pathname === '/api/intake' && method === 'POST') {
      return handleIntake(request, env);
    }
    if (pathname === '/api/admin/login' && method === 'POST') {
      return handleAdminLogin(request, env);
    }
    if (pathname === '/api/admin/list-posts' && method === 'POST') {
      return handleAdminListPosts(request, env);
    }
    if (pathname === '/api/admin/publish' && method === 'POST') {
      return handleAdminPublish(request, env);
    }
    if (pathname === '/api/admin/upload-image' && method === 'POST') {
      return handleAdminUploadImage(request, env);
    }

    // Unknown /api/ route
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Static assets — handled by the [assets] binding in wrangler.toml
    return env.ASSETS.fetch(request);
  },
};
