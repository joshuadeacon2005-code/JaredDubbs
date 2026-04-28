// Worker entry point — routes /api/* requests, serves static assets otherwise

// ─── Shared helpers ───────────────────────────────────────────────────────────

// Cliniko API keys end with a shard suffix (e.g. -au4, -uk1). The matching
// shard MUST be used in the API URL or every request 404s.
function clinikoBase(apiKey) {
  const shard = apiKey.split('-').pop();
  return `https://api.${shard}.cliniko.com/v1`;
}

function clinikoHeaders(apiKey) {
  return {
    Authorization: 'Basic ' + btoa(apiKey + ':'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'JDCoreDev (hello@jareddubbs.com)',
  };
}

async function clinikoGet(path, apiKey) {
  const res = await fetch(`${clinikoBase(apiKey)}${path}`, { headers: clinikoHeaders(apiKey) });
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

// Sends Jared an email when a discovery call is booked. Uses Resend; if
// RESEND_API_KEY is unset, logs and returns silently — the booking still
// succeeds, the email just doesn't go out.
async function notifyBooking(env, { name, email, phone, displayDate, displayTime }) {
  const resendKey = env.RESEND_API_KEY;
  const to = env.NOTIFY_EMAIL || 'hello@jareddubbs.com';
  const from = env.RESEND_FROM || 'Jared Dubbs <discovery@jareddubbs.com>';

  if (!resendKey) {
    console.log('Booking notification (RESEND_API_KEY not set):', {
      name, email, phone, displayDate, displayTime,
    });
    return;
  }

  const escape = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);

  const html = `
    <h2>New discovery call booked</h2>
    <p><strong>${escape(name)}</strong> just booked a 15-minute discovery call.</p>
    <p><strong>When:</strong> ${escape(displayDate)} at ${escape(displayTime)} (HKT)</p>
    <p><strong>Email:</strong> <a href="mailto:${escape(email)}">${escape(email)}</a></p>
    ${phone ? `<p><strong>Phone:</strong> ${escape(phone)}</p>` : ''}
    <p>The appointment has been added to your Cliniko calendar.</p>
  `;
  const text =
    `New discovery call booked\n\n` +
    `${name} just booked a 15-minute discovery call.\n\n` +
    `When: ${displayDate} at ${displayTime} (HKT)\n` +
    `Email: ${email}\n` +
    (phone ? `Phone: ${phone}\n` : '') +
    `\nThe appointment has been added to your Cliniko calendar.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `New discovery call — ${displayDate} at ${displayTime} HKT`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error('Resend send failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Resend error:', err);
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// Computes free 15-min discovery-call slots by subtracting Jared's existing
// Cliniko appointments and unavailable blocks from a daily booking window.
// Privacy: only `starts_at` and `ends_at` are read from Cliniko. Patient
// names, IDs, notes, and appointment types are never accessed or returned.
async function handleClinikoAvailableTimes(env) {
  try {
    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'Booking system not configured', slots: {} });
    }

    let practitionerId = env.CLINIKO_PRACTITIONER_ID;
    let appointmentTypeId = env.CLINIKO_APPOINTMENT_TYPE_ID;

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

    if (!appointmentTypeId) {
      const data = await clinikoGet('/appointment_types', apiKey);
      const types = data.appointment_types || [];
      const discovery = types.find(
        (t) =>
          t.name &&
          (t.name.toLowerCase().includes('discovery') ||
            t.name.toLowerCase().includes('introductory') ||
            t.name.toLowerCase().includes('initial') ||
            t.name.toLowerCase().includes('free') ||
            (t.name.toLowerCase().includes('phone') && t.duration_in_minutes <= 20))
      );
      appointmentTypeId = discovery?.id;
    }

    if (!practitionerId || !appointmentTypeId) {
      return Response.json({
        error: 'Could not find practitioner or discovery-call appointment type in Cliniko',
        slots: {},
        debug: { practitionerId, appointmentTypeId },
      });
    }

    const SLOT_MIN = 15;
    const SLOT_MS = SLOT_MIN * 60 * 1000;
    const MIN_NOTICE_MS = 48 * 60 * 60 * 1000;
    const MAX_ADVANCE_MS = 28 * 24 * 60 * 60 * 1000;
    const HKT_OFFSET_MS = 8 * 60 * 60 * 1000; // Hong Kong has no DST.
    const HOUR_START = Number(env.BOOKING_HOUR_START) || 9;
    const HOUR_END = Number(env.BOOKING_HOUR_END) || 21; // exclusive

    const now = Date.now();
    const windowStart = now + MIN_NOTICE_MS;
    const windowEnd = now + MAX_ADVANCE_MS;

    const base = clinikoBase(apiKey);
    const headers = clinikoHeaders(apiKey);
    const fromIso = new Date(windowStart - 24 * 60 * 60 * 1000).toISOString();
    const toIso = new Date(windowEnd + 24 * 60 * 60 * 1000).toISOString();

    const apptUrl = `${base}/individual_appointments?q[]=practitioner_id:=${practitionerId}&q[]=starts_at:<=${toIso}&q[]=ends_at:>=${fromIso}&per_page=100`;
    const blockUrl = `${base}/unavailable_blocks?q[]=practitioner_id:=${practitionerId}&q[]=starts_at:<=${toIso}&q[]=ends_at:>=${fromIso}&per_page=100`;

    const [apptData, blockData] = await Promise.all([
      fetch(apptUrl, { headers }).then((r) => (r.ok ? r.json() : { individual_appointments: [] })),
      fetch(blockUrl, { headers }).then((r) => (r.ok ? r.json() : { unavailable_blocks: [] })),
    ]);

    const busy = [];
    // Days (HKT) on which Jared already has a patient appointment — no
    // discovery calls offered on those days.
    const blockedDates = new Set();
    for (const a of apptData.individual_appointments || []) {
      const start = new Date(a.starts_at).getTime();
      const end = new Date(a.ends_at).getTime();
      busy.push([start, end]);
      blockedDates.add(new Date(start + HKT_OFFSET_MS).toISOString().split('T')[0]);
      blockedDates.add(new Date(end + HKT_OFFSET_MS).toISOString().split('T')[0]);
    }
    for (const b of blockData.unavailable_blocks || []) {
      busy.push([new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
    }
    busy.sort((a, b) => a[0] - b[0]);

    function overlaps(slotStart, slotEnd) {
      for (const [bs, be] of busy) {
        if (bs >= slotEnd) return false;
        if (be > slotStart) return true;
      }
      return false;
    }

    const slotsByDate = {};
    // Walk one HKT day at a time. Convert to UTC for slot iteration since
    // Cliniko returns ISO/UTC timestamps.
    const firstHktMidnight = new Date(windowStart + HKT_OFFSET_MS);
    firstHktMidnight.setUTCHours(0, 0, 0, 0);
    let dayStartUtc = firstHktMidnight.getTime() - HKT_OFFSET_MS;

    while (dayStartUtc < windowEnd) {
      const dateStr = new Date(dayStartUtc + HKT_OFFSET_MS).toISOString().split('T')[0];

      // Skip the entire day if Jared already has a patient appointment on it.
      if (blockedDates.has(dateStr)) {
        dayStartUtc += 24 * 60 * 60 * 1000;
        continue;
      }

      const winOpen = dayStartUtc + HOUR_START * 60 * 60 * 1000;
      const winClose = dayStartUtc + HOUR_END * 60 * 60 * 1000;

      for (let t = winOpen; t + SLOT_MS <= winClose; t += SLOT_MS) {
        if (t < windowStart) continue;
        if (t + SLOT_MS > windowEnd) break;
        if (overlaps(t, t + SLOT_MS)) continue;

        if (!slotsByDate[dateStr]) slotsByDate[dateStr] = [];
        slotsByDate[dateStr].push({
          start: new Date(t).toISOString(),
          practitionerId,
          appointmentTypeId,
        });
      }

      dayStartUtc += 24 * 60 * 60 * 1000;
    }

    return Response.json(
      {
        slots: slotsByDate,
        appointmentTypeId,
        practitionerId,
        range: {
          from: new Date(windowStart).toISOString(),
          to: new Date(windowEnd).toISOString(),
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (err) {
    console.error('Available times error:', err);
    return Response.json({
      error: 'Could not load available times',
      slots: {},
      message: err.message,
    });
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
    const base = clinikoBase(apiKey);

    // Reject if Jared already has a patient appointment on this HKT day.
    // The available-times endpoint already hides those days, but we re-check
    // here to defend against stale client caches and direct-API attempts.
    const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
    const slotMs = new Date(appointmentStart).getTime();
    const dayStartHkt = new Date(slotMs + HKT_OFFSET_MS);
    dayStartHkt.setUTCHours(0, 0, 0, 0);
    const dayStartUtc = new Date(dayStartHkt.getTime() - HKT_OFFSET_MS).toISOString();
    const dayEndUtc = new Date(dayStartHkt.getTime() - HKT_OFFSET_MS + 24 * 60 * 60 * 1000).toISOString();
    const dayCheckUrl =
      `${base}/individual_appointments?q[]=practitioner_id:=${practitionerId}` +
      `&q[]=starts_at:<=${dayEndUtc}&q[]=ends_at:>=${dayStartUtc}&per_page=1`;
    const dayCheckRes = await fetch(dayCheckUrl, { headers });
    if (dayCheckRes.ok) {
      const dayCheck = await dayCheckRes.json();
      if ((dayCheck.individual_appointments || []).length > 0) {
        return Response.json(
          { error: 'This day is no longer available. Please choose another time.' },
          { status: 409 }
        );
      }
    }

    // Find or create patient
    let patient;
    const searchRes = await fetch(
      `${base}/patients?q=email:=${encodeURIComponent(email)}`,
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
      const patientRes = await fetch(`${base}/patients`, {
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
    const appointmentRes = await fetch(`${base}/individual_appointments`, {
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

    await notifyBooking(env, { name, email, phone, displayDate, displayTime });

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
    const patientRes = await fetch(`${clinikoBase(apiKey)}/patients`, {
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
