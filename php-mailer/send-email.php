<?php

declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/SmtpMailer.php';

$config = require __DIR__ . '/config.php';

function respond(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$ownOrigin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '');

$origins = $config['allowed_origins'] ?? [];
$allowed = null;
if ($requestOrigin !== '') {
    foreach ((array) $origins as $origin) {
        if (str_starts_with($requestOrigin, $origin)) {
            $allowed = $origin;
            break;
        }
    }
} else {

    $allowed = $ownOrigin;
}

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
if ($allowed !== null) {
    header('Access-Control-Allow-Origin: ' . $allowed);
    header('Vary: Origin');
} elseif ($requestOrigin !== '') {
    header('Access-Control-Allow-Origin: ' . $ownOrigin);
}
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if ($config['csrf_required'] ?? false) {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        $token = bin2hex(random_bytes(16));
        $_SESSION['csrf_token'] = $token;
        respond(200, ['csrf_token' => $token]);
    }
    respond(405, ['error' => 'Method not allowed. Use POST.']);
}

if ($requestOrigin !== '' && $allowed === null) {
    error_log('BITS send-email: blocked cross-site request from origin ' . $requestOrigin);
    respond(403, ['error' => 'This site is not allowed to use the email service.']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['error' => 'Method not allowed. Use POST.']);
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) {
    respond(400, ['error' => 'Request body must be a JSON object.']);
}

if ($config['csrf_required'] ?? false) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $expected = $_SESSION['csrf_token'] ?? '';
    $provided = (string) ($body['csrf_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, $provided)) {
        respond(403, ['error' => 'Invalid or missing CSRF token. Reload the page and try again.']);
    }
}

$recipient = trim((string) ($body['email'] ?? ''));
if ($recipient === '') {
    respond(400, ['error' => 'Missing email address.']);
}
if (filter_var($recipient, FILTER_VALIDATE_EMAIL) === false || strlen($recipient) > 254) {
    respond(400, ['error' => 'Invalid email address.']);
}

$maxBytes      = (int) ($config['max_attachment_bytes'] ?? 8 * 1024 * 1024);
$capturesDir   = (string) ($config['captures_dir'] ?? __DIR__ . '/captures');
$imageBase64   = (string) ($body['imageBase64'] ?? '');
$imageName     = (string) ($body['image_name'] ?? '');
$rawImagesBase64 = $body['rawImagesBase64'] ?? [];

$attachments = [];

if ($imageBase64 !== '' && $imageName !== '') {
    respond(400, ['error' => 'Provide either imageBase64 or image_name, not both.']);
}

function parseInlineImageDataUrl(string $dataUrl, string $errorMessage): array
{

    if (preg_match('/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+\/]*)={0,2}$/', $dataUrl, $m) !== 1) {
        respond(400, ['error' => $errorMessage]);
    }
    $decoded = base64_decode($m[2], true);
    if ($decoded === false) {
        respond(400, ['error' => 'The image data is not valid base64.']);
    }

    if (base64_encode($decoded) !== $m[2] . str_repeat('=', (4 - strlen($m[2]) % 4) % 4)) {
        respond(400, ['error' => 'The image data is malformed.']);
    }
    $mime = $m[1] === 'png' ? SmtpMailer::MIME_PNG : SmtpMailer::MIME_JPEG;
    return ['data' => $decoded, 'mime' => $mime];
}

if ($imageBase64 !== '') {
    $attachment = parseInlineImageDataUrl($imageBase64, 'The image must be a PNG or JPEG data URL.');
    $attachments[] = $attachment + ['name' => 'bits-photostrip-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2))];
} elseif ($imageName !== '') {

    $name = basename($imageName);
    if ($name !== $imageName) {
        respond(400, ['error' => 'Only bare filenames inside the captures directory are allowed.']);
    }
    if (preg_match('/^[A-Za-z0-9._-]{1,128}$/', $name) !== 1) {
        respond(400, ['error' => 'Image filename contains forbidden characters.']);
    }
    if (str_starts_with($name, '.') || str_contains($name, '..')) {
        respond(400, ['error' => 'Image filename is not allowed.']);
    }
    $realPath = realpath($capturesDir . '/' . $name);
    $baseDir  = realpath($capturesDir);
    if ($realPath === false || $baseDir === false || !str_starts_with($realPath, $baseDir . DIRECTORY_SEPARATOR)) {
        respond(404, ['error' => 'Photostrip not found.']);
    }
    if (!is_readable($realPath) || filesize($realPath) === 0) {
        respond(404, ['error' => 'Photostrip not found.']);
    }
    if (filesize($realPath) > $maxBytes) {
        respond(413, ['error' => 'The photostrip is too large to email.']);
    }
    $guessed = getimagesize($realPath);
    if ($guessed === false || !in_array($guessed['mime'], [SmtpMailer::MIME_JPEG, SmtpMailer::MIME_PNG], true)) {
        respond(415, ['error' => 'Unsupported image type. Only PNG and JPEG photostrips can be emailed.']);
    }
    $attachments[] = [
        'data' => (string) file_get_contents($realPath),
        'mime' => $guessed['mime'],
        'name' => 'bits-photostrip-' . date('Ymd-His'),
    ];
} else {
    respond(400, ['error' => 'Missing image.']);
}

if ($rawImagesBase64 !== []) {
    if (!is_array($rawImagesBase64) || count($rawImagesBase64) > 12) {
        respond(400, ['error' => 'rawImagesBase64 must be an array of at most 12 image data URLs.']);
    }
    foreach ($rawImagesBase64 as $index => $raw) {
        if (!is_string($raw)) {
            respond(400, ['error' => 'Each raw photo must be an image data URL string.']);
        }
        $attachment = parseInlineImageDataUrl($raw, 'Each raw photo must be a PNG or JPEG data URL.');
        if (strlen($attachment['data']) > $maxBytes) {
            respond(413, ['error' => 'A raw photo is too large to email.']);
        }
        $ordinal = str_pad((string) (((int) $index) + 1), 2, '0', STR_PAD_LEFT);
        $attachments[] = $attachment + ['name' => 'bits-photo-' . $ordinal . '-' . date('Ymd-His')];
    }
}

if (strlen($attachments[0]['data']) < 1024) {
    respond(400, ['error' => 'The image is too small to be a photostrip.']);
}
foreach ($attachments as $attachment) {
    if (strlen($attachment['data']) > $maxBytes) {
        respond(413, ['error' => 'An image is too large to email.']);
    }
}

$filename   = 'bits-photostrip-' . date('Ymd-His') . '.' .
    ($attachments[0]['mime'] === SmtpMailer::MIME_PNG ? 'png' : 'jpg');

$escapedEmail = htmlspecialchars($recipient, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$year = date('Y');

$htmlBody = <<<HTML
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:#0d0d0d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%; background:#141414; border-radius:12px; font-family:'Helvetica Neue', Arial, sans-serif; color:#ffffff;">
        <tr><td align="center" style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 6px; font-size:22px; font-weight:800; color:#38bd9e;">Your Photostrip is Here!</h1>
          <p style="margin:0; color:#999; font-size:14px;">BITS Photobooth &mdash; Cavite State University</p>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <p style="margin:0 0 14px; color:#cccccc; font-size:14px; line-height:1.7;">Thank you for using BITS Photobooth!</p>
          <p style="margin:0 0 20px; color:#cccccc; font-size:14px; line-height:1.7;">Your full-quality photostrip is <strong style="color:#ffffff;">attached</strong> to this email &mdash; open the attachment to view, print or keep it as a memory. The individual photos that make up your strip are attached too.</p>
          <hr style="border:none; border-top:1px solid #2a2a2a; margin:0 0 20px;">
          <p style="margin:0; color:#777; font-size:12px; text-align:center;">Sent to {$escapedEmail} &middot; {$year}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;

$textBody = "Your Photostrip is Here!\n" .
    "BITS Photobooth - Cavite State University\n\n" .
    "Thank you for using BITS Photobooth!\n" .
    "Your full-quality photostrip is attached to this email — open the attachment to view, print or keep it.\n" .
    "The individual photos that make up your strip are attached too.\n\n" .
    "Sent to {$recipient} - {$year}\n";

try {
    $mailer = new SmtpMailer($config);

    $sent = $mailer->send(
        $recipient,
        'Your BITS Photostrip is Ready!',
        $htmlBody,
        $textBody,
        $attachments,
    );
} catch (SmtpMailerException $e) {

    error_log('BITS SMTP failure: ' . $e->getMessage());
    respond(502, ['error' => 'The email service is temporarily unavailable. Please try again in a moment.']);
} catch (Throwable $e) {
    error_log('BITS send-email unexpected error: ' . $e::class . ': ' . $e->getMessage());
    respond(500, ['error' => 'An unexpected error occurred while sending your photostrip.']);
}

if (!$sent) {
    error_log('BITS SMTP failure: send() returned false without an exception.');
    respond(502, ['error' => 'The email service is temporarily unavailable. Please try again in a moment.']);
}

respond(200, [
    'success'  => true,
    'id'       => bin2hex(random_bytes(8)),
    'filename' => $filename,
]);
