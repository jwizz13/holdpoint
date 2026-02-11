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
                                                                    ↓
                                                        Invite logged to app_invites table
```

**Why Supabase Edge Function + Resend:**
- API key stays server-side (not exposed in client JS)
- Fits existing Supabase backend architecture
- Resend free tier: 100 emails/day
- No new infrastructure needed

## Files Changed

| File | What changed |
|------|-------------|
| `index.html` | Added "Invite a Friend" profile menu item + invite modal overlay. Version bumped to v0.3.0. |
| `css/styles.css` | Added `.modal-overlay`, `.modal-card`, `.modal-header`, `.modal-close`, `.modal-desc`, `.modal-actions`, `.invite-status` (with `.success` and `.error` variants) |
| `js/app.js` | Added `openInviteModal()`, `closeInviteModal()`, `sendInvite()` functions + event listeners for modal open/close/send/backdrop-click/enter-key. |
| `supabase-schema.sql` | Added `app_invites` table, RLS policies (users can view/insert own), and indexes |
| `supabase/functions/send-invite/index.ts` | **NEW** — Deno Edge Function that validates email, calls Resend API, returns success/error |

## Setup / Deployment

### 1. Create Resend Account
Go to [resend.com](https://resend.com) and sign up (GitHub login works). Copy your API key (starts with `re_`).

### 2. Set the Resend API Key as a Supabase Secret
```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```
Select the HoldPoint project when prompted.

### 3. Deploy the Edge Function
```bash
cd ~/Claude\'s\ Projects/holdpoint
supabase functions deploy send-invite
```

**Note:** The original Deno import (`import { serve } from "https://deno.land/std@0.168.0/http/server.ts"`) failed on deploy with a 500 error. Fix was to remove the import and use `Deno.serve()` instead — it's built into the Deno runtime that Supabase Edge Functions use (v2.1.4+).

**JWT Verification:** If the Edge Function returns non-2xx errors with no logs beyond boot/shutdown, check the **Details** tab in the Supabase Edge Functions dashboard. If "Verify JWT" is enabled, try disabling it — the function handles its own validation.

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
cd ~/Claude\'s\ Projects/holdpoint
git add -A && git commit -m "Add invite a friend feature" && git push
```

## Email Details

**Subject:** `"{Inviter Name} invited you to HoldPoint"`

**From address:** `HoldPoint <onboarding@resend.dev>` (free tier default). To send from a custom address like `holdpointapp@gmail.com`, add and verify a domain in Resend.

**Email contents:**
- Green branded header with "HoldPoint — Train and Track"
- Personalized message: "{Name} invited you to try HoldPoint — a timed hold workout app for yoga and hangboard training."
- Description of the app
- Green "Open HoldPoint" CTA button → `https://jwizz13.github.io/holdpoint`
- Step-by-step getting started instructions (open link, sign up, add to home screen, start session)
- Footer with link back to app

## How It Works (Technical)

**Frontend (app.js):**
1. `openInviteModal()` — shows modal, clears input, focuses email field
2. User enters email and clicks Send (or presses Enter)
3. `sendInvite()` — validates email client-side, disables button ("Sending..."), calls `supabase.functions.invoke('send-invite', { body: { email, inviter_name } })`
4. On success: shows green "Invite sent!" message, resets button to "Send Another"
5. On error: shows red error message, resets button to "Try Again"
6. Separately logs invite to `app_invites` table (non-blocking — email still sends even if DB write fails)

**Backend (Edge Function):**
1. Receives POST with `{ email, inviter_name }`
2. Validates email format
3. Checks `RESEND_API_KEY` environment variable exists
4. Calls Resend API with branded HTML email
5. Returns `{ success: true, id }` or `{ error: "message" }`

**Logging:** All invite actions logged with `[HP][INVITE]` category prefix in browser console.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Could not send invite. Edge function returned a non-2xx status code" | Edge Function not deployed or JWT verification blocking it | Run `supabase functions deploy send-invite`, check Details tab for JWT toggle |
| Deploy fails with "Import failed: 500 Internal Server Error" | Old Deno std library import URL broken | Use `Deno.serve()` instead of importing `serve` from deno.land |
| SQL errors "policy already exists" | Running full schema file instead of just the app_invites SQL | Run only the app_invites table/policy SQL, not the full schema |
| Function boots but no invocation logs | Function crashes before reaching code, or JWT verification rejecting requests | Disable "Verify JWT" in function Details tab |

## Dependencies

- **Supabase CLI** (`brew install supabase/tap/supabase`) — for deploying Edge Functions and setting secrets
- **Resend** (resend.com) — email delivery service, free tier = 100 emails/day
- No new npm packages or client-side dependencies

## Future Improvements

- Custom sending domain (send from `holdpointapp@gmail.com` or `hello@holdpoint.app`)
- Track invite status (sent → opened → signed_up) with Resend webhooks
- Rate limiting (prevent spam invites)
- Invite history screen so users can see who they've invited
- Referral tracking (attribute signups to the inviter)
