// send-invite — Supabase Edge Function
// Sends an app invite email via Resend API
//
// Deploy: supabase functions deploy send-invite
// Secret: supabase secrets set RESEND_API_KEY=re_xxxxx

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://jwizz13.github.io/holdpoint";

function buildEmailHTML(inviterName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f1f5f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2F5630,#3d7340); padding:32px 24px; text-align:center;">
      <div style="font-size:28px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">HoldPoint</div>
      <div style="font-size:14px; color:rgba(255,255,255,0.8); margin-top:4px;">Train and Track</div>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="font-size:16px; color:#1e293b; line-height:1.6; margin:0 0 16px;">
        <strong>${inviterName}</strong> invited you to try HoldPoint — a timed hold workout app for yoga and hangboard training.
      </p>

      <p style="font-size:15px; color:#475569; line-height:1.6; margin:0 0 24px;">
        Track your sessions, build custom routines, and see your progress over time. It's free to use.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center; margin:28px 0;">
        <a href="${APP_URL}" style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg,#2F5630,#3d7340); color:#ffffff; text-decoration:none; border-radius:12px; font-size:16px; font-weight:600; box-shadow:0 4px 12px rgba(45,106,79,0.3);">
          Open HoldPoint
        </a>
      </div>

      <!-- Instructions -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-top:24px;">
        <p style="font-size:14px; font-weight:600; color:#1e293b; margin:0 0 12px;">Getting started:</p>
        <ol style="font-size:14px; color:#475569; line-height:1.8; margin:0; padding-left:20px;">
          <li>Open the link above on your phone or computer</li>
          <li>Tap <strong>Sign up</strong> to create a free account</li>
          <li>Add HoldPoint to your home screen for quick access</li>
          <li>Choose a routine and start your first session</li>
        </ol>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 24px; text-align:center; border-top:1px solid #e2e8f0;">
      <p style="font-size:12px; color:#94a3b8; margin:0;">
        Sent via <a href="${APP_URL}" style="color:#3d7340; text-decoration:none;">HoldPoint</a>
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, inviter_name } = await req.json();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inviter = inviter_name || "A HoldPoint user";
    const subject = `${inviter} invited you to HoldPoint`;

    // Send via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HoldPoint <holdpoint@wizzwell.life>",
        to: [email],
        subject: subject,
        html: buildEmailHTML(inviter),
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return new Response(
        JSON.stringify({ error: resendData?.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Invite sent to ${email} by ${inviter} — Resend ID: ${resendData.id}`);

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
