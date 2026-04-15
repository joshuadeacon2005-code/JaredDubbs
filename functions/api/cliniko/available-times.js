/**
 * GET /api/cliniko/available-times
 *
 * Fetches available discovery call slots from Cliniko for the next 14 days.
 *
 * Required env vars:
 *   CLINIKO_API_KEY — Cliniko API key
 *
 * Optional env vars (faster if set, auto-discovered if not):
 *   CLINIKO_APPOINTMENT_TYPE_ID — ID of the 15-min discovery call type
 *   CLINIKO_PRACTITIONER_ID — Jared's practitioner ID
 *   CLINIKO_BUSINESS_ID — Business ID
 */

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
  const res = await fetch(`${CLINIKO_BASE}${path}`, {
    headers: clinikoHeaders(apiKey),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cliniko ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function findAppointmentTypeId(apiKey) {
  const data = await clinikoGet('/appointment_types', apiKey);
  const types = data.appointment_types || [];
  // Match the 15-min discovery call — look for common naming patterns
  const discovery = types.find(
    (t) =>
      t.name &&
      (t.name.toLowerCase().includes('discovery') ||
        t.name.toLowerCase().includes('initial') ||
        t.name.toLowerCase().includes('free') ||
        (t.name.toLowerCase().includes('phone') && t.duration_in_minutes <= 20))
  );
  return discovery?.id;
}

async function findPractitionerId(apiKey) {
  const data = await clinikoGet('/practitioners', apiKey);
  const practitioners = data.practitioners || [];
  // Find Jared — there should only be one practitioner
  const jared = practitioners.find(
    (p) =>
      (p.first_name && p.first_name.toLowerCase().includes('jared')) ||
      practitioners.length === 1
  );
  return jared?.id;
}

export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://jareddubbs.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300', // Cache 5 min
  };

  try {
    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Booking system not configured', slots: [] },
        { status: 200, headers: corsHeaders }
      );
    }

    // Resolve appointment type and practitioner IDs
    let appointmentTypeId = env.CLINIKO_APPOINTMENT_TYPE_ID;
    let practitionerId = env.CLINIKO_PRACTITIONER_ID;

    if (!appointmentTypeId) {
      appointmentTypeId = await findAppointmentTypeId(apiKey);
    }
    if (!practitionerId) {
      practitionerId = await findPractitionerId(apiKey);
    }

    if (!appointmentTypeId || !practitionerId) {
      return Response.json(
        {
          error: 'Discovery call appointment type not found in Cliniko',
          slots: [],
          debug: { appointmentTypeId, practitionerId },
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Fetch available times for the next 14 days
    const from = new Date();
    from.setDate(from.getDate() + 1); // Start from tomorrow
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

    // Group slots by date for the calendar UI
    const slotsByDate = {};
    const times = data.available_times || [];
    for (const slot of times) {
      const date = slot.appointment_start.split('T')[0];
      if (!slotsByDate[date]) slotsByDate[date] = [];
      slotsByDate[date].push({
        start: slot.appointment_start,
        practitionerId: practitionerId,
        appointmentTypeId: appointmentTypeId,
      });
    }

    return Response.json(
      {
        slots: slotsByDate,
        appointmentTypeId,
        practitionerId,
        range: { from: fromStr, to: toStr },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('Available times error:', err);
    return Response.json(
      { error: 'Could not load available times', slots: [], message: err.message },
      { status: 200, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://jareddubbs.com',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
