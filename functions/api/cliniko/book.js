/**
 * POST /api/cliniko/book
 *
 * Books a 15-min discovery call appointment in Cliniko.
 *
 * Request body:
 *   { name, email, phone?, appointmentStart, appointmentTypeId, practitionerId }
 *
 * Required env vars:
 *   CLINIKO_API_KEY
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

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://jareddubbs.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Booking system not configured' },
        { status: 503, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { name, email, phone, appointmentStart, appointmentTypeId, practitionerId } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders });
    }
    if (!appointmentStart || !appointmentTypeId || !practitionerId) {
      return Response.json(
        { error: 'Appointment details are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const headers = clinikoHeaders(apiKey);

    // Step 1: Check if patient already exists by email
    const searchRes = await fetch(
      `${CLINIKO_BASE}/patients?q=email:=${encodeURIComponent(email)}`,
      { headers }
    );
    let patient;

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const existing = (searchData.patients || []).find(
        (p) => p.email && p.email.toLowerCase() === email.toLowerCase()
      );
      if (existing) {
        patient = existing;
      }
    }

    // Step 2: Create patient if not found
    if (!patient) {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || '-';

      const patientRes = await fetch(`${CLINIKO_BASE}/patients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          patient_phone_numbers: phone
            ? [{ number: phone, phone_type: 'Mobile' }]
            : undefined,
        }),
      });

      if (!patientRes.ok) {
        const errText = await patientRes.text();
        console.error('Cliniko patient creation failed:', patientRes.status, errText);
        return Response.json(
          { error: 'Could not create your profile. Please try again or call us directly.' },
          { status: 500, headers: corsHeaders }
        );
      }
      patient = await patientRes.json();
    }

    // Step 3: Create the appointment
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
      console.error('Cliniko appointment creation failed:', appointmentRes.status, errText);

      // If the slot is no longer available
      if (appointmentRes.status === 422 || appointmentRes.status === 409) {
        return Response.json(
          { error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409, headers: corsHeaders }
        );
      }

      return Response.json(
        { error: 'Could not book the appointment. Please try again or call us directly.' },
        { status: 500, headers: corsHeaders }
      );
    }

    const appointment = await appointmentRes.json();

    // Format confirmation time for display
    const startDate = new Date(appointmentStart);
    const displayDate = startDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const displayTime = startDate.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Hong_Kong',
    });

    return Response.json(
      {
        success: true,
        message: `Your discovery call is booked for ${displayDate} at ${displayTime} (HKT).`,
        appointment: {
          id: appointment.id,
          start: appointmentStart,
          displayDate,
          displayTime,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('Booking error:', err);
    return Response.json(
      { error: 'Something went wrong. Please try calling us at +852 5775 3743.' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://jareddubbs.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
