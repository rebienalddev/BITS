# BITS Photobooth — Pure PHP SMTP Email Delivery

A reusable, dependency-free SMTP mailer (no PHPMailer, no Composer, no
third-party libraries) plus a secure JSON endpoint that attaches the final
rendered photostrip — full original quality — to a branded HTML email.

## Files

| File | Purpose |
|---|---|
| `SmtpMailer.php` | Pure PHP SMTP client class: `fsockopen()`/`stream_socket_client()`, EHLO, STARTTLS (RFC 3207), implicit TLS, AUTH LOGIN, envelope commands, DATA, MIME multipart assembly, base64 attachment, QUIT. CRLF line endings throughout.|
| `send-email.php` | Secure JSON endpoint (validation, origin allowlist, path guard, size limits).|
| `config.example.php` | Example configuration without real credentials.|
| `config.php` | Your real credentials — **git-ignored, never commit it**.|
| `captures/` | Optional directory for server-stored strips (`image_name` requests).|

## Requirements

- PHP 7.1+ (tested on PHP 8.2) with the `openssl` extension (for STARTTLS/implicit TLS).
- A web server that runs PHP (Apache, nginx+php-fpm, or the built-in server for dev).

> Architecture note: the static site on GitHub Pages and the Vercel Node serverless
> function cannot execute PHP. Deploy this alongside the rest of the app on a
> PHP-capable host (or a separate one, listed in `allowed_origins`).

## Setup

### Option A — Brevo (recommended for volume)

Brevo's free SMTP relay gives 300 emails/day; **Starter plan and above has NO daily send cap**, which covers the ~500/day use case.

1. Create a Brevo account → https://app.brevo.com
2. **Verify your sender address**: Senders, Domains & Dedicated IPs → verify (Brevo emails a 6-digit code). The `SMTP_FROM_EMAIL` must be this same address.
3. Generate an **SMTP key** (NOT an API key): Settings → SMTP & API → SMTP tab → "Generate a new SMTP key". Copy it — it is shown only once.
4. Copy the **SMTP Login** shown on the same page — usually a dedicated address like `xxxxx@smtp-brevo.com`, *not* your account email.

Brevo connection reference:

| Setting | Value |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` / encryption | `587` + `'tls'` (STARTTLS), or `465` + `'ssl'` (fallback: 2525; port 25 not offered) |
| `SMTP_USERNAME` | the SMTP Login (`...@smtp-brevo.com`) |
| `SMTP_PASSWORD` | the SMTP key |

Brevo limits to know:
- Free plan: **300 emails/day** (resets daily, no rollover). Paid Starter and above: no daily cap.
- Whole-message max is generous (~10–20 MB), so the full-res photostrip attachment (typically 1–4 MB) fits comfortably.

### Option B — Gmail
`smtp.gmail.com`, port 587, STARTTLS, and an **App Password** for `SMTP_PASSWORD`. Fine for <500/day; free Gmail caps around 500 recipients/day.

```bash
# from the repo root
cp php-mailer/config.example.php php-mailer/config.php
$EDITOR php-mailer/config.php     # select Option A or B values above and fill in
                                  # SMTP_HOST, SMTP_PORT, SMTP_USERNAME,
                                  # SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME
```

Serve the whole app from the PHP host so the frontend can reach the endpoint:

```bash
php -S 0.0.0.0:8080 -t .   # from the repo root; Apache/nginx work too
```

Enable the PHP pathway in the frontend (index.html):

```html
<meta name="php-email-endpoint" content="/php-mailer/send-email.php">
```

Leave the value **empty** (or omit the tag) to keep using the existing built-in
email service (Node `api/send-email.js`) — the photo booth and its UI are
unchanged either way.

If the frontend is served from another origin (e.g. GitHub Pages), add that
origin to `allowed_origins` in `config.php`.

## Frontend behaviour

- User flow, layout and UI are untouched: the existing `Send` button and email
  input drive everything.
- With the PHP endpoint configured, the **final rendered canvas with the chosen
  frame** is attached as a full-resolution PNG data URL — no resize, no
  recompression, no quality step-down (`script.js`, `sendEmailBtn.onclick`).
- Without it, the previous Vercel flow runs exactly as before.

## Endpoint API

```
POST /php-mailer/send-email.php
Content-Type: application/json

{ "email": "recipient@example.com",
  "imageBase64": "data:image/png;base64,..." }      // inline mode
{ "email": "...", "image_name": "strip-xxxx.png" }  // stored mode (captures/)
```

Response: `200 {"success":true,"id":"...","filename":"bits-photostrip-....png"}`
or `4xx/5xx {"error":"user-readable reason"}` (technical detail only in server logs).

### Security implemented

- Recipient validated with `FILTER_VALIDATE_EMAIL` (+ length cap).
- Inline images: strict data-URL grammar (PNG/JPEG only), strict-mode base64,
  canonical re-encode check, min 1 KB / max `max_attachment_bytes` (default 8 MB).
- `image_name` mode: basename + `^[A-Za-z0-9._-]{1,128}$` + `realpath()` confined
  to `captures_dir`; dotfiles, traversal and `..` rejected; MIME verified with
  `getimagesize()`. Browser-supplied paths are never trusted.
- CSRF: request-level Origin/Referer allowlist (`allowed_origins`) rejects
  unknown sites with 403; optional session CSRF token via `csrf_required`.
- Credentials live only in git-ignored `config.php`; they are never exposed to
  JavaScript, never echoed and never written to logs. Error responses carry no
  server internals.

## Testing results (PHP 8.2, fake SMTP servers + PHP built-in server)

| # | Case | Result |
|---|---|---|
| 1 | Valid email + PNG attachment | ✅ 200 success |
| 2 | Valid email + JPEG attachment | ✅ 200 success |
| 3 | Invalid email address | ✅ 400 "Invalid email address." |
| 4 | Missing image | ✅ 400 "Missing image." |
| 5 | Oversized attachment (>8 MB) | ✅ 413 "too large to email" |
| 6 | Both imageBase64 and image_name | ✅ 400 rejected |
| 7 | Unauthorized path (`../../.env`) | ✅ 400 "Only bare filenames …" |
| 8 | Missing stored image | ✅ 404 "Photostrip not found." |
| 9 | Allowed stored image | ✅ 200 success |
| 10 | Cross-site POST (unknown Origin) | ✅ 403 |
| 11 | GET request | ✅ 405 |
| 12 | OPTIONS preflight | ✅ 204 |
| 13 | Attachment integrity | ✅ SHA-256 of received PNG == original PNG; JPEG idem; stored-file mode idem (no resize/recompress anywhere) |
| 14 | Wrong SMTP credentials | ✅ clean auth-failure exception → 502 |
| 15 | SMTP connection failure / non-TLS STARTTLS upgrade | ✅ graceful exception → 502 |

Received email attachments verified byte-identical to the originals
(`sha256sum` comparison of decoded base64 bodies).
