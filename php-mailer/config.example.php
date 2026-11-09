<?php
/**
 * BITS Photobooth — pure PHP SMTP configuration.
 *
 * Copy this file to config.php and fill in real credentials.
 * config.php is git-ignored; NEVER commit real credentials.
 */

return [
    // Core SMTP settings (required)
    //
    // Brevo (Sendinblue) example values:
    //   SMTP_HOST  = smtp-relay.brevo.com
    //   SMTP_PORT  = 587 (STARTTLS; or 465 with 'ssl'; 2525 if 587 is blocked; NO port 25)
    //   SMTP_USERNAME = your SMTP LOGIN from Brevo → SMTP & API → SMTP tab.
    //                   NOTE: it is usually a dedicated address like `xxxxx@smtp-brevo.com`,
    //                   NOT your Brevo account email, and NOT an API key.
    //   SMTP_PASSWORD = an SMTP KEY generated on that same page (not your account password).
    //
    // Gmail example values: host smtp.gmail.com, port 587, an App Password for SMTP_PASSWORD.
    'SMTP_HOST'       => 'smtp-relay.brevo.com',
    'SMTP_PORT'       => 587,          // 587 = STARTTLS submission, 465 = implicit TLS, 25 = relay
    'SMTP_USERNAME'   => 'xxxxx@smtp-brevo.com', // SMTP AUTH LOGIN username
    'SMTP_PASSWORD'   => 'CHANGE_ME_SMTP_KEY',   // SMTP AUTH LOGIN password (leave empty value only for the example)
    'SMTP_FROM_EMAIL' => 'no-reply@example.com', // envelope + From: header address — MUST be a SENDER
                                                 // verified in Brevo: https://app.brevo.com/senders/list
    'SMTP_FROM_NAME'  => 'BITS Photobooth',      // display name on the From: header

    // Encryption mode: 'tls' = STARTTLS upgrade (recommended for 587),
    // 'ssl' = implicit TLS from the first byte (465), 'none' = plaintext (local testing only)
    'SMTP_ENCRYPTION' => 'tls',

    // Name used in the EHLO handshake. Set to the public hostname of the machine
    // running this script when deploying to a real server.
    'SMTP_EHLO_NAME'  => 'localhost',

    // Seconds to wait for any SMTP read/write before giving up
    'SMTP_TIMEOUT'    => 15,

    // ---- Request security -------------------------------------------------

    // Browsers whose pages may POST from this endpoint. The static frontend
    // (GitHub Pages / PHP host) is served from a different origin in production,
    // so list it here, e.g. 'https://rebienalddev.github.io'.
    // Unrecognized Origin/Referer headers get a 403.
    'allowed_origins' => [
        // 'https://rebienalddev.github.io',
        // 'https://bits-photobooth.vercel.app',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000',
    ],

    // Optional extra CSRF layer: when true, POSTs must carry a 'csrf_token'
    // field matching the value fetched from this endpoint via GET beforehand.
    // Keep false when clients are on a separate origin (session cookies are not
    // sent cross-site); the Origin allowlist above is the CSRF defense.
    'csrf_required'   => false,

    // ---- Attachment handling ----------------------------------------------

    // Maximum accepted attachment size in bytes (raw, before base64 encoding).
    'max_attachment_bytes' => 8 * 1024 * 1024,

    // Directory under the project that may hold server-side stored photostrips.
    // Only used when the request provides an 'image_name' instead of inline
    // base64; filenames with path separators or '..' are rejected, and the
    // resolved path must stay inside this directory.
    'captures_dir'    => __DIR__ . '/captures',
];
