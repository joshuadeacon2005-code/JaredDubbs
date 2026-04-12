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
    const { name, email, message } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Valid email is required' }, { status: 400, headers: corsHeaders });
    }
    if (!message || message.trim().length < 10) {
      return Response.json({ error: 'Please provide a message' }, { status: 400, headers: corsHeaders });
    }

    // Send email via configured service
    // Option 1: Cloudflare Email Workers (if configured)
    // Option 2: External service (Resend, SendGrid, etc.)
    // For now, log the contact and return success

    console.log('Contact form submission:', { name, email, message: message.substring(0, 100) });

    // If email service is configured
    if (env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'website@jareddubbs.com',
          to: 'jared@jareddubbs.com',
          subject: `New contact from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        }),
      });
    }

    return Response.json(
      { success: true, message: "Thank you for your message. We'll be in touch within 24 hours." },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('Contact error:', err);
    return Response.json(
      { error: 'Something went wrong. Please email jared@jareddubbs.com directly.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
