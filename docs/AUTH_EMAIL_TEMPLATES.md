# Auth email templates (Supabase)

The sign-up confirmation and password-reset emails are sent by Supabase Auth,
from templates kept in the Supabase dashboard, not in this repo. This page is
the exact setup the site expects.

## Why the templates need changing

Supabase's default links (`{{ .ConfirmationURL }}`) go through Supabase and
come back to `/api/auth/callback?code=…`. That code can only be redeemed in
the browser that asked for the email, because it needs a cookie that browser
holds. Open the email on a phone, or in the Gmail app (which opens links in
its own browser), and the reset fails with "This link has expired".

The templates below link to `/auth/confirm?token_hash=…&type=…` instead. That
page shows one button (**Continue** / **Confirm and sign in**); pressing it
checks the token with Supabase (`verifyOtp`), so the link works in any browser
on any device. Opening the link alone changes nothing: a link someone forwards
can't sign the reader into the sender's account, and a mail scanner that
opens links can't use it up. The old `?code=` links keep working too, so
emails already sent are not affected.

## 1. URL configuration

Supabase dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://mayells.com`, exactly: no trailing slash, no path.
  The templates build their links from it (`{{ .SiteURL }}`), so a wrong
  value sends every link to the wrong place.
- **Redirect URLs**: make sure `https://mayells.com/api/auth/callback**` is
  in the list (it still serves old-style links). The password-reset request passes
  `https://mayells.com/api/auth/callback?next=/reset-password` as its
  redirect, and Supabase ignores redirects that aren't allow-listed. For
  local testing also add `http://localhost:3000/api/auth/callback**`.

## 2. Email templates

Supabase dashboard → **Authentication** → **Emails** → **Templates** tab
(called **Email Templates** in older dashboards). Edit only the link; the
wording around it can stay as it is. Click **Save** after each one.

### Confirm signup

Replace the link (the `href` holding `{{ .ConfirmationURL }}`) with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/">Confirm your email address</a>
```

The link opens a "Confirm your email" page; after **Confirm and sign in** the
person is signed in and lands on the homepage.

### Reset password

Replace the link with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Choose a new password</a>
```

The link opens a "Reset your password" page; after **Continue** the person
is signed in and lands on **Choose a new password**. A used or expired link
says so on the confirm page and offers a new one.

Keep the exact parameter names (`token_hash`, `type`, `next`) and values
(`email`, `recovery`). `next` must be a path on this site starting with `/`;
anything else is ignored and the person lands on the homepage.

## 3. Check it

1. On a computer, go to `/forgot-password` and request a reset for your own
   account.
2. Open the email on your phone, in the Gmail app. The link should open
   **Reset your password**; press **Continue** and you land on **Choose a
   new password**, not "This link has expired".
3. Set a password and sign in with it on the computer.
4. Create a test account at `/signup`, open the confirmation email on a
   different device, press **Confirm and sign in**, and check it lands on
   the homepage signed in.

## Notes

- Each link works once, and only when the button is pressed.
- Accepted `type` values: `email` (or the older `signup`) and `recovery`. The
  site sends no magic-link, invite or email-change mail, so those are refused.
- A `?token_hash=` link sent to `/api/auth/callback` is passed on to the
  confirm page rather than verified there.
- Code: `src/app/(browse)/auth/confirm/page.tsx` and
  `src/components/auth/ConfirmEmailLink.tsx` (the confirm step),
  `src/app/api/auth/confirm/route.ts` (verifies the token on the button's
  same-site POST), `src/app/api/auth/callback/route.ts` (old `?code=` links),
  `src/lib/auth/email-link.ts` (accepted types),
  `src/app/api/auth/forgot-password/route.ts` (reset request and its
  redirect).
