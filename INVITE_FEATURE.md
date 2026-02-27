# HoldPoint — Invite a Friend Feature

## Overview

Users can invite friends to HoldPoint via email. From the Profile screen, tapping "Invite a Friend" opens a modal where they enter an email address. The system sends a branded HTML email through a Supabase Edge Function + Resend API, with the inviter's name, a description of the app, a link to sign up, and step-by-step instructions.

## Architecture

```
User taps "Invite a Friend" → Modal opens → Enters email → JS calls Edge Function
                                                                    ↓
                                                        Supabase Edge Function
                                                          validates email,
                                                          calls Resend API
                                                                    ↓
                                                        Branded HTML email sent
                                                        from holdpoint@wizzwell.life
                                                                    ↓
                                                        Invite logged to app_invites table
```

**Why Supabase Edge Function + Resend:**
- API key stays server-side (not exposed in client JS)
- Fits existing Supabase backend architecture
- Resend free tier: 100 emails/day
- No new infrastructure needed

**Why Resend (not self-hosted email):**
- Supabase Edge Functions can only make HTTP requests, not SMTP connections
- The app code needs an API to call — Bluehost's mail servers don't have one
- Resend provides warmed-up IPs with good deliverability reputation
- All email services (SendGrid, Mailgun, SES) work the same way; Resend is the simplest (one HTTP call, no SDK)
- Domain verification is one-time setup; after that, emails send from your own domain

## Files Changed

| File | What changed |
|------|-------------|
| `index.html` | Added "Invite a Friend" profile menu item + invite modal overlay. Version bumped through v0.3.0 → v0.3.3. |
| `css/styles.css` | Added `.modal-overlay`, `.modal-card`, `.modal-header`, `.modal-close`, `.modal-desc`, `.modal-actions`, `.invite-status` (with `.success` and `.error` variants) |
| `js/app.js` | Added `openInviteModal()`, `closeInviteModal()`, `sendInvite()` functions + event listeners. v0.3.3: switched from `supabase.functions.invoke()` to direct `fetch()` with `apikey` header. |
| `supabase-schema.sql` | Added `app_invites` table, RLS policies (users can view/insert own), and indexes |
| `supabase/functions/send-invite/index.ts` | **NEW** — Deno Edge Function that validates email, calls Resend API, returns success/error. Sends from `holdpoint@wizzwell.life`. |

## Setup / Deployment

### 1. Resend Account & Domain Verification
Go to [resend.com](https://resend.com) and sign up. Copy your API key (starts with `re_`).

Then verify your sending domain:
1. Go to [resend.com/domains](https://resend.com/domains) → Add Domain → enter `wizzwell.life`
2. Resend shows three DNS records to add (1 DKIM TXT, 1 SPF MX, 1 SPF TXT)
3. In Bluehost → Domains → wizzwell.life → DNS → Add Advanced DNS Record:
   - **Record 1:** Type: TXT, Host: `resend._domainkey` (select "Other Host"), Value: paste DKIM content
   - **Record 2:** Type: MX, Host: `send` (select "Other Host"), Value: paste MX content, Priority: 10
   - **Record 3:** Type: TXT, Host: `send` (select "Other Host"), Value: paste SPF content
4. Back in Resend, click "I've added the records" — verification may be instant or take a few minutes

### 2. Set the Resend API Key as a Supabase Secret
```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```
Select the HoldPoint project when prompted.

### 3. Deploy the Edge Function
```bash
supabase functions deploy send-invite
```

**Note:** The original Deno import (`import { serve } from "https://deno.land/std@0.168.0/http/server.ts"`) failed on deploy with a 500 error. Fix was to remove the import and use `Deno.serve()` instead — it's built into the Deno runtime that Supabase Edge Functions use (v2.1.4+).

**JWT Verification:** Disable "Verify JWT" in the Supabase Edge Functions dashboard → send-invite → Details tab. The function handles its own validation; gateway-level JWT checking blocks requests before they reach the function code.

### 4. Create the app_invites Table
Run this SQL in your Supabase Dashboard → SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS app_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invites"
  ON app_invites FOR SELECT USING (auth.uid() = inviter_id);

CREATE POLICY "Users can insert own invites"
  ON app_invites FOR INSERT WITH CHECK (auth.uid() = inviter_id);

CREATE INDEX IF NOT EXISTS idx_app_invites_inviter ON app_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_app_invites_date ON app_invites(created_at DESC);
```

**Important:** Run ONLY this SQL — not the full `supabase-schema.sql` file. Running the full file will fail with "policy already exists" errors because the other tables and policies were created during initial setup.

### 5. Push to GitHub
```bash
git add -A && git commit -m "Add invite a friend feature" && git push
```

## Email Details

**Subject:** `"{Inviter Name} invited you to HoldPoint"`

**From address:** `HoldPoint <holdpoint@wizzwell.life>` (verified domain via Resend + Bluehost DNS)

**Email contents:**
- Green branded header with "HoldPoint — Train and Track"
- Personalized message: "{Name} invited you to try HoldPoint — a timed hold workout app for yoga and hangboard training."
- Description of the app
- Green "Open HoldPoint" CTA button → `https://jwizz13.github.io/holdpoint`
- Step-by-step getting started instructions (open link, sign up, add to home screen, start session)
- Footer with link back to app

## How It Works (Technical)

**Frontend (app.js) — v0.3.3:**
1. `openInviteModal()` — shows modal, clears input, focuses email field
2. User enters email and clicks Send (or presses Enter)
3. `sendInvite()` — validates email client-side, disables button ("Sending..."), calls Edge Function via direct `fetch()`:
   ```javascript
   fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
       'apikey': SUPABASE_ANON_KEY
     },
     body: JSON.stringify({ email, inviter_name: inviterName })
   });
   ```
4. On success: shows green "Invite sent!" message, resets button to "Send Another"
5. On error: shows red error message, resets button to "Try Again"
6. Separately logs invite to `app_invites` table (non-blocking — email still sends even if DB write fails)

**Backend (Edge Function):**
1. Receives POST with `{ email, inviter_name }`
2. Validates email format
3. Checks `RESEND_API_KEY` environment variable exists
4. Calls Resend API with branded HTML email from `holdpoint@wizzwell.life`
5. Returns `{ success: true, id }` or `{ error: "message" }`

**Logging:** All invite actions logged with `[HP][INVITE]` category prefix in browser console.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Could not send invite. Edge function returned a non-2xx status code" | Multiple possible causes — see below | Check each fix in order |
| Deploy fails with "Import failed: 500 Internal Server Error" | Old Deno std library import URL broken | Use `Deno.serve()` instead of importing `serve` from deno.land |
| SQL errors "policy already exists" | Running full schema file instead of just the app_invites SQL | Run only the app_invites table/policy SQL, not the full schema |
| Function boots but no invocation logs | JWT verification rejecting requests at gateway level | Disable "Verify JWT" in function Details tab |
| "You can only send testing emails to your own email address" | Resend free tier with `onboarding@resend.dev` can only send to your own Resend account email | Verify a custom domain in Resend (wizzwell.life) and change the `from` address |
| `supabase.functions.invoke()` returns error but curl works | Supabase JS client sends different headers than curl; gateway may reject the request | Replace `supabase.functions.invoke()` with direct `fetch()` including both `Authorization` and `apikey` headers |
| "command not found: supabase" | Supabase CLI not installed | `brew install supabase/tap/supabase` then `supabase login` |
| Tried to run SQL in terminal, got parse error | SQL must run in Supabase web dashboard, not terminal | Go to Supabase Dashboard → SQL Editor → paste and run there |

### The "non-2xx status code" debugging path (in order):

1. **Is the function deployed?** Run `supabase functions deploy send-invite`
2. **Is JWT verification off?** Dashboard → Edge Functions → send-invite → Details → disable "Verify JWT"
3. **Is the domain verified in Resend?** Go to resend.com/domains — must show verified
4. **Test with curl first** to isolate app vs function issues:
   ```bash
   curl -X POST "https://yvrbjpdtlirnrhrdizyy.supabase.co/functions/v1/send-invite" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -d '{"email":"test@example.com","inviter_name":"Test"}'
   ```
5. **If curl works but app doesn't:** Use direct `fetch()` with `apikey` header instead of `supabase.functions.invoke()`

## Dependencies

- **Supabase CLI** (`brew install supabase/tap/supabase`) — for deploying Edge Functions and setting secrets
- **Resend** (resend.com) — email delivery service, free tier = 100 emails/day
- **Bluehost DNS** — domain verification records for wizzwell.life (DKIM + SPF)
- No new npm packages or client-side dependencies

## Version History

| Version | Changes |
|---------|---------|
| v0.3.0 | Initial invite feature: modal UI, Edge Function, Resend integration, app_invites table |
| v0.3.3 | Fixed invite delivery: verified wizzwell.life domain, changed sender to `holdpoint@wizzwell.life`, replaced `supabase.functions.invoke()` with direct `fetch()` + `apikey` header |

## Future Improvements

- Track invite status (sent → opened → signed_up) with Resend webhooks
- Rate limiting (prevent spam invites)
- Invite history screen so users can see who they've invited
- Referral tracking (attribute signups to the inviter)
