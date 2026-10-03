# Admin email inbox (`/admin/emails`)

Mail to `info@mayells.com` lands in the admin dashboard; the operator reads
and answers it there; the AI summarises, classifies and drafts (and, when
switched on, answers some of it); a copy of every customer email is also
forwarded to the owner's external mailbox. Everything goes through Resend.

## How it works

```
sender ──► info@mayells.com  (MX → Resend receiving)
             │
   Resend fires `email.received` ──► POST https://mayells.com/api/email/inbound
             │  svix signature → recipient filter → webhook_logs claim (dedup)
             │  → GET /emails/receiving/{id} for body + headers + attachments
             ▼
       emails (direction=inbound) ──► /admin/emails
             │  after(): forward a copy to BUSINESS.forwardInboundTo;
             │  AI classifies + drafts; auto-sends only if
             │  automation_settings.ai_email_auto_reply = true
             ▼
   admin replies ──► Resend send, From "Mayells <info@mayells.com>",
                     Reply-To info+<threadId>@mayells.com
                     (the plus tag threads the answer when it comes back)
```

Code:

| Piece | Where |
| --- | --- |
| Addressing (own domains, plus-address threading, RFC 2047 names) | `src/lib/email/addresses.ts` (unit tested) |
| The only Resend client; refuses any From off our domains | `src/lib/email/resend.ts` (unit tested) |
| Send path shared by compose / reply / AI draft / test; folder maths | `src/lib/email/admin-inbox.ts` |
| Readiness check against Resend | `src/lib/email/inbox-status.ts` (unit tested) |
| Auto-reply loop guards | `src/lib/email/auto-reply-guards.ts` (unit tested) |
| AI classify / draft / auto-reply | `src/lib/ai/email-reply.ts` |
| Webhook | `src/app/api/email/inbound/route.ts` (unit tested) |
| Admin API | `src/app/api/admin/emails/*` |
| UI | `src/app/(admin)/admin/emails/page.tsx`, `src/hooks/useAdminInbox.ts`, `src/components/admin-inbox/*` |
| Table | `emails` (`src/db/schema/emails.ts`) |

## Environment (Vercel → Production)

| Var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Sending, fetching received mail, and the readiness check (domains + webhooks, read-only). Full-access key. |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret of the Resend webhook. Every call is rejected without it. |
| `ADMIN_EMAIL_ADDRESS` | Optional. The receiving mailbox. Default `info@mayells.com`. Its **domain** is what must receive in Resend. Ignored unless it is on `mayells.com` / `mayellauctions.com` (or a subdomain). |
| `ADMIN_EMAIL_FROM` | Optional. From on inbox replies; default `Mayells <info@mayells.com>`. Must be on one of our verified sending domains. |
| `XAI_API_KEY` (or the key for `AI_PROVIDER`) | Optional. AI summary, category and suggested reply. Mail still arrives without it. |

## Is it working? (check this first, not the UI)

`/admin/emails` shows a yellow **"This inbox can't receive mail yet"** card
until everything below is true, with the exact DNS records (copy buttons)
and the Resend settings that are missing. The same data is at
`GET /api/admin/emails/status` and from a terminal:

```
npx tsx scripts/check-admin-inbox.ts
```

"No incoming emails yet" under a green bar means there is genuinely no mail.

Ready means all of:

1. The Resend domain for `ADMIN_EMAIL_ADDRESS`'s domain (`mayells.com`) is
   **verified** with **receiving enabled** (MX `@` → `inbound-smtp.us-east-1.amazonaws.com`, priority 10).
2. A Resend webhook endpoint is exactly `https://mayells.com/api/email/inbound`
   (`www.mayells.com` 308s to the apex, and Svix treats every 3xx as a failed
   delivery), enabled, subscribed to `email.received`. `email.delivered`,
   `email.bounced`, `email.failed` and `email.suppressed` keep the Sent folder's
   statuses honest and are flagged as a warning when missing.
3. `RESEND_WEBHOOK_SECRET` set in prod.

**The Resend account is shared** with ~12 other domains (EXA, Digis, Staycio,
Cannes Swim Week, …) and Resend webhooks are **account-wide**: every receiving
domain fires `email.received` at every endpoint, and every send fires its
delivery events everywhere. The webhook keeps only mail with a recipient on
`mayells.com` / `mayellauctions.com` (or any subdomain) and delivery events
for mail sent from them; everything else is acknowledged and dropped before
the body fetch, without a webhook_logs row. No setting can widen that: an
`ADMIN_EMAIL_ADDRESS` off our domains is ignored.

The same key can send as any domain on the account, so sending is guarded
too. `getResend()` is the only Resend client in the app (a test fails if
another appears) and it checks every request on its way out: any message —
single, batch, forward or broadcast — whose From is not on our domains, or
that has no From, is refused with `invalid_from_address` and never reaches
Resend. Transactional mail, outreach, the inbox and the AI all go through it.

The other apps on the account (EXA, Digis, BocaBanker, Cannes Swim Week,
AxleYard, Staycio) were checked on 2026-10-03: each drops mail not addressed
to its own domains, so Mayells mail is not stored there — but it is still
posted to their endpoints. The readiness card says how many. Moving Mayells
to a Resend account of its own is the only way to stop that.

## Threading

Every email sent from the inbox carries `Reply-To: info+<threadId>@mayells.com`
(`threadId` = the conversation root's id). Resend delivers any local part on a
receiving domain, so the customer's answer comes back already tagged and is
filed under that thread, stored with `to_email = info@mayells.com`. Fallbacks,
in order: the `In-Reply-To` header (matched against stored Message-IDs and
Resend send ids), then subject + counterpart address.

## Testing the loop

1. `/admin/emails` → **Send me a test** (or `POST /api/admin/emails/test`). It
   emails the signed-in admin through the normal reply path and shows in
   **Sent** with a "System" badge.
2. Reply to it from that mailbox. Within a minute the reply must appear in
   **Inbox**, inside the same conversation. If it doesn't, receiving is the
   broken half — see the setup card.
3. Reply from the inbox; check the sender's client groups it in the thread.

Webhook deliveries and their responses are visible in Resend → Webhooks → the
mayells.com endpoint, and in `/admin/webhooks` (System log). A 401 in Resend
means `RESEND_WEBHOOK_SECRET` doesn't match the webhook's signing secret
(editing the endpoint URL keeps the secret; creating a new webhook rotates it).

## AI auto-reply

Off by default (`automation_settings.ai_email_auto_reply`, toggled on the
inbox page with a confirmation, or under Settings → AI). With it off the AI
still summarises and drafts; nothing is sent without an admin. On, it
auto-sends only for appraisal_request / consignment_inquiry /
purchase_inquiry / auction_question / estate_evaluation / scheduling /
general_inquiry at ≥ 85 % confidence, never twice in 24 h on one thread, at
most three times per thread, and never to automated senders (no-reply,
mailer-daemon, list mail, `Auto-Submitted`, out-of-office subjects) or our
own domains. Auto-sent replies carry an AI badge and the original lands under
**Needs review** until opened.

## Folders and actions

Inbox · Unread · Needs review · Starred · Sent · Spam · Archived, plus AI
category chips on the inbox. Per email: reply, forward (with the original
attachments relayed as Resend-hosted URLs), star, mark unread, spam / not
spam, archive, delete (confirmed). Bulk: read / unread / star / spam / archive
/ delete. Keyboard: `j`/`k` next & previous, `r` reply, `f` forward, `e`
archive, `s` star, `Esc` close. The list refreshes silently every 45 s while
the tab is visible. Deep link: `/admin/emails?thread=<thread or email id>`.

## Related

- Transactional mail (`src/lib/email/notifications.ts`) still goes out as
  `notifications@mayells.com`, outreach as `outreach@mayells.com`; only inbox
  replies use `ADMIN_EMAIL_FROM`. All of them pass the send guard.
- The owner-mailbox copy (`BUSINESS.forwardInboundTo`) has `Reply-To` set to
  the customer, so answering from that mailbox goes straight to them and
  bypasses the inbox.
