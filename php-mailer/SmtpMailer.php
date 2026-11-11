<?php

declare(strict_types=1);

class SmtpMailerException extends RuntimeException
{
}

final class SmtpMailer
{
    public const MIME_JPEG = 'image/jpeg';
    public const MIME_PNG  = 'image/png';

    private const DEFAULT_TIMEOUT = 15;

    private string $host;
    private int $port;
    private string $username;
    private string $password;
    private string $fromEmail;
    private string $fromName;
    private string $encryption;
    private string $ehloName;
    private int $timeout;

    private $socket = null;

    public function __construct(array $config)
    {
        $required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME'];
        foreach ($required as $key) {
            if (!isset($config[$key]) || trim((string) $config[$key]) === '') {
                throw new SmtpMailerException("Missing required SMTP setting: {$key}");
            }
        }

        $this->host      = trim((string) $config['SMTP_HOST']);
        $this->port      = (int) $config['SMTP_PORT'];
        $this->username  = (string) $config['SMTP_USERNAME'];
        $this->password  = (string) $config['SMTP_PASSWORD'];
        $this->fromEmail = trim((string) $config['SMTP_FROM_EMAIL']);
        $this->fromName  = trim((string) $config['SMTP_FROM_NAME']);
        $this->encryption = $config['SMTP_ENCRYPTION'] ?? 'tls';
        if (!in_array($this->encryption, ['tls', 'ssl', 'none'], true)) {
            throw new SmtpMailerException('SMTP_ENCRYPTION must be one of: tls, ssl, none');
        }
        if ($this->encryption === 'ssl') {
            return;
        }
        $this->ehloName = trim((string) ($config['SMTP_EHLO_NAME'] ?? 'localhost'));
        $this->timeout  = (int) ($config['SMTP_TIMEOUT'] ?? self::DEFAULT_TIMEOUT);

        if (!filter_var($this->fromEmail, FILTER_VALIDATE_EMAIL)) {
            throw new SmtpMailerException('SMTP_FROM_EMAIL is not a valid email address');
        }
    }

    public function send(
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody,
        array $attachments
    ): bool {
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new SmtpMailerException('Recipient email address is not valid');
        }
        if ($attachments === []) {
            throw new SmtpMailerException('At least one attachment is required');
        }
        foreach ($attachments as $attachment) {
            if (
                !isset($attachment['data'], $attachment['mime'], $attachment['name'])
                || !in_array($attachment['mime'], [self::MIME_JPEG, self::MIME_PNG], true)
                || $attachment['data'] === ''
            ) {
                throw new SmtpMailerException('Invalid attachment (each needs data, mime and name)');
            }
        }

        $message = $this->buildMessage($toEmail, $subject, $htmlBody, $textBody, $attachments);

        try {
            $this->connect();
            $this->greetAndStartTls();
            $this->authenticate();

            $this->command('MAIL FROM:<' . $this->fromEmail . '>', [250]);
            $this->command('RCPT TO:<' . $toEmail . '>', [250, 251]);
            $this->command('DATA', [354]);

            $this->writeAll($this->dotStuff($message) . "\r\n.\r\n");
            $response = $this->readResponse('after DATA payload');
            if (($code = $this->firstCode($response)) !== 250) {
                throw new SmtpMailerException("Message rejected by SMTP server after DATA (code {$code}).");
            }

            $this->command('QUIT', [221]);
            return true;
        } finally {
            $this->disconnect();
        }
    }

    private function connect(): void
    {
        $transport = $this->encryption === 'ssl' ? 'ssl://' : 'tcp://';
        $socket    = @stream_socket_client(
            "{$transport}{$this->host}:{$this->port}",
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            stream_context_create([
                'ssl' => [
                    'verify_peer'      => true,
                    'verify_peer_name' => true,
                    'SNI_enabled'      => true,
                    'peer_name'        => $this->host,
                ],
            ]),
        );

        if ($socket === false) {
            $this->socket = null;

            throw new SmtpMailerException("Unable to connect to SMTP server {$this->host}:{$this->port} (error {$errno}).");
        }

        $this->socket = $socket;
        stream_set_timeout($this->socket, $this->timeout);

        $response = $this->readResponse('on connect');
        if ($this->firstCode($response) !== 220) {
            throw new SmtpMailerException('SMTP server did not present a service-ready greeting.');
        }
    }

    private function greetAndStartTls(): void
    {
        $ehlo = $this->command('EHLO ' . $this->ehloName, [250]);
        $capabilities = strtoupper(implode("\n", $ehlo));

        if ($this->encryption === 'ssl') {
            return;
        }

        if ($this->encryption === 'tls') {
            if (!str_contains($capabilities, 'STARTTLS')) {
                throw new SmtpMailerException('SMTP server does not advertise STARTTLS support.');
            }
            $this->command('STARTTLS', [220]);

            $ok = @stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($ok !== true) {
                throw new SmtpMailerException('TLS negotiation with the SMTP server failed.');
            }

            $this->command('EHLO ' . $this->ehloName, [250]);
        }

    }

    private function authenticate(): void
    {
        $this->writeAll("AUTH LOGIN\r\n");
        $response = $this->readResponse('AUTH LOGIN');
        if ($this->firstCode($response) !== 334) {
            throw new SmtpMailerException('SMTP server does not accept AUTH LOGIN authentication.');
        }

        $this->writeAll(base64_encode($this->username) . "\r\n");
        $response = $this->readResponse('AUTH username');
        if ($this->firstCode($response) !== 334) {
            throw new SmtpMailerException('SMTP authentication failed.');
        }

        $this->writeAll(base64_encode($this->password) . "\r\n");
        $response = $this->readResponse('AUTH password');
        if ($this->firstCode($response) !== 235) {
            throw new SmtpMailerException('SMTP authentication failed. Check the configured mail account credentials.');
        }
    }

    private function command(string $command, array $expectedCodes): array
    {
        $this->writeAll($command . "\r\n");
        $response = $this->readResponse($command);
        $code     = $this->firstCode($response);
        if (!in_array($code, $expectedCodes, true)) {
            throw new SmtpMailerException("SMTP server rejected \"{$command}\" (code {$code}).");
        }
        return $response;
    }

    private function readResponse(string $context): array
    {
        if ($this->socket === null) {
            throw new SmtpMailerException('Not connected to the SMTP server.');
        }

        $lines = [];
        while (($line = fgets($this->socket, 1024)) !== false) {
            $line    = rtrim($line, "\r\n");
            $lines[] = $line;

            if (preg_match('/^(\d{3}) (.*)$/', $line, $m) === 1) {
                return $lines;
            }
        }

        $meta = is_resource($this->socket) ? stream_get_meta_data($this->socket) : ['timed_out' => false];
        if ($meta['timed_out'] ?? false) {
            throw new SmtpMailerException("SMTP response timed out while waiting {$context}.");
        }
        throw new SmtpMailerException("SMTP server closed the connection unexpectedly {$context}.");
    }

    private function firstCode(array $lines): int
    {
        if ($lines === [] || preg_match('/^(\d{3})/', $lines[0], $m) !== 1) {
            throw new SmtpMailerException('Malformed SMTP response received.');
        }
        return (int) $m[1];
    }

    private function writeAll(string $bytes): void
    {
        if ($this->socket === null) {
            throw new SmtpMailerException('Not connected to the SMTP server.');
        }
        $remaining = strlen($bytes);
        while ($remaining > 0) {
            $written = @fwrite($this->socket, substr($bytes, -$remaining, $remaining));
            if ($written === false || $written === 0) {
                throw new SmtpMailerException('Failed writing to SMTP server socket.');
            }
            $remaining -= $written;
        }
    }

    private function disconnect(): void
    {
        if (is_resource($this->socket)) {
            @fclose($this->socket);
        }
        $this->socket = null;
    }

    private function buildMessage(
        string $toEmail,
        string $subject,
        string $htmlBody,
        string $textBody,
        array $attachments
    ): string {
        $mixedBoundary   = 'bitsMixed' . bin2hex(random_bytes(12));
        $altBoundary     = 'bitsAlt' . bin2hex(random_bytes(12));

        $headers = [
                'From: '       . $this->encodeHeaderName($this->fromName) . ' <' . $this->fromEmail . '>',
                'To: '         . $toEmail,
                'Subject: '    . mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n"),
                'Date: '       . date(DATE_RFC2822),
                'Message-ID: ' . '<' . bin2hex(random_bytes(16)) . '@' . $this->ehloName . '>',
                'MIME-Version: 1.0',
                'Content-Type: multipart/mixed; boundary="' . $mixedBoundary . '"',
            ];

        $message = implode("\r\n", $headers) . "\r\n\r\n";
        $message .= "This is a multi-part message in MIME format.\r\n\r\n";

        $message .= "--{$mixedBoundary}\r\n";
        $message .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"\r\n\r\n";

        $message .= "--{$altBoundary}\r\n";
        $message .= "Content-Type: text/plain; charset=UTF-8; format=flowed\r\n";
        $message .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $message .= quoted_printable_encode($this->normalizeNewlines($textBody)) . "\r\n";

        $message .= "--{$altBoundary}\r\n";
        $message .= "Content-Type: text/html; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $message .= quoted_printable_encode($this->normalizeNewlines($htmlBody)) . "\r\n";

        $message .= "--{$altBoundary}--\r\n";

        foreach ($attachments as $attachment) {
            $name           = $this->sanitizeFilename((string) $attachment['name']);
            $attachmentData = chunk_split(base64_encode((string) $attachment['data']), 76, "\r\n");
            $attachmentCtype = $attachment['mime'] === self::MIME_PNG ? 'png' : 'jpeg';
            $message .= "--{$mixedBoundary}\r\n";
            $message .= "Content-Type: image/{$attachmentCtype}; name=\"{$name}\"\r\n";
            $message .= "Content-Transfer-Encoding: base64\r\n";
            $message .= "Content-Disposition: attachment; filename=\"{$name}\"\r\n\r\n";
            $message .= $attachmentData . "\r\n";
        }

        $message .= "--{$mixedBoundary}--\r\n";

        return $message;
    }

    private function dotStuff(string $payload): string
    {
        return preg_replace('/^\./m', '..', $payload) ?? $payload;
    }

    private function normalizeNewlines(string $text): string
    {
        $lf = str_replace("\r\n", "\n", $text);
        $lf = str_replace("\r", "\n", $lf);
        return str_replace("\n", "\r\n", $lf);
    }

    private function encodeHeaderName(string $name): string
    {
        if ($name === '') {
            return '';
        }
        return mb_encode_mimeheader($name, 'UTF-8', 'B', "\r\n");
    }

    private function sanitizeFilename(string $name): string
    {
        $clean = preg_replace('/[^A-Za-z0-9._-]/', '_', basename($name)) ?? 'attachment';
        return $clean === '' ? 'attachment' : $clean;
    }
}
