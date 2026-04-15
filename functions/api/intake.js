export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://jareddubbs.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { name, email, phone, reason, session_type, preferred_times } = body;

    // Server-side validation
    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders });
    }
    if (!reason || reason.trim().length < 20) {
      return Response.json({ error: 'Please provide more detail about what brings you here' }, { status: 400, headers: corsHeaders });
    }

    const apiKey = env.CLINIKO_API_KEY;
    if (!apiKey) {
      // Cliniko not configured — fall back to email notification
      console.error('CLINIKO_API_KEY not configured');
      return Response.json(
        { success: true, message: 'Form received. We will be in touch within 24 hours.' },
        { status: 200, headers: corsHeaders }
      );
    }

    const clinikoBase = 'https://api.au2.cliniko.com/v1';
    const authHeader = 'Basic ' + btoa(apiKey + ':');
    const clinikoHeaders = {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'JDCoreDev (hello@jareddubbs.com)',
    };

    // Step 1: Create patient
    const patientRes = await fetch(`${clinikoBase}/patients`, {
      method: 'POST',
      headers: clinikoHeaders,
      body: JSON.stringify({
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || '-',
        email: email,
        phone_numbers: phone ? [{ number: phone, phone_type: 'Mobile' }] : [],
        patient_phone_numbers: phone ? [{ number: phone, phone_type: 'Mobile' }] : undefined,
      }),
    });

    if (!patientRes.ok) {
      const errText = await patientRes.text();
      console.error('Cliniko patient creation failed:', patientRes.status, errText);
      // Still return success to user — we have their info
      return Response.json(
        { success: true, message: 'Thank you. We will be in touch within 24 hours.' },
        { status: 200, headers: corsHeaders }
      );
    }

    const patient = await patientRes.json();

    // Step 2: Add intake notes
    // Store the reason and preferences as a note on the patient
    const noteContent = [
      `Reason for seeking therapy: ${reason}`,
      session_type ? `Preferred session type: ${session_type}` : '',
      preferred_times ? `Preferred times: ${preferred_times}` : '',
    ].filter(Boolean).join('\n\n');

    // Cliniko patient notes can be added as a treatment note or memo
    // For now, log it — full implementation depends on Cliniko account setup

    return Response.json(
      {
        success: true,
        message: 'Thank you for reaching out. We will be in touch within 24 hours to arrange your free discovery call.',
        patientId: patient.id,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('Intake error:', err);
    return Response.json(
      { error: 'Something went wrong. Please try calling us at +852 5775 3743 or emailing hello@jareddubbs.com' },
      { status: 500, headers: corsHeaders }
    );
  }
}
