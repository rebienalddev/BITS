<?php

return [

    'SMTP_HOST'       => 'smtp-relay.brevo.com',
    'SMTP_PORT'       => 587,
    'SMTP_USERNAME'   => 'xxxxx@smtp-brevo.com',
    'SMTP_PASSWORD'   => 'CHANGE_ME_SMTP_KEY',
    'SMTP_FROM_EMAIL' => 'no-reply@example.com',

    'SMTP_FROM_NAME'  => 'BITS Photobooth',

    'SMTP_ENCRYPTION' => 'tls',

    'SMTP_EHLO_NAME'  => 'localhost',

    'SMTP_TIMEOUT'    => 15,

    'allowed_origins' => [

        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000',
    ],

    'csrf_required'   => false,

    'max_attachment_bytes' => 8 * 1024 * 1024,

    'captures_dir'    => __DIR__ . '/captures',
];
