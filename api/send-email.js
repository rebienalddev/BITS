const nodemailer = require("nodemailer");

const gmailUser = process.env.GMAIL_USER?.trim();
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
const mailer =
    gmailUser && gmailAppPassword
        ? nodemailer.createTransport({
              service: "gmail",
              auth: {
                  user: gmailUser,
                  pass: gmailAppPassword,
              },
          })
        : null;

const maxImageBytes = 3 * 1024 * 1024;

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    const { email, imageBase64 } = req.body || {};

    if (typeof email !== "string" || typeof imageBase64 !== "string") {
        return res.status(400).json({ error: "Missing email or image." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipient = email.trim();
    if (!emailRegex.test(recipient)) {
        return res.status(400).json({ error: "Invalid email address." });
    }

    const imageMatch = imageBase64.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!imageMatch || imageMatch[2].length % 4 !== 0) {
        return res.status(400).json({ error: "The image must be a valid PNG or JPEG data URL." });
    }

    const imageFormat = imageMatch[1];
    const imageBuffer = Buffer.from(imageMatch[2], "base64");
    if (
        imageBuffer.length === 0 ||
        imageBuffer.length > maxImageBytes ||
        imageBuffer.toString("base64") !== imageMatch[2]
    ) {
        return res.status(413).json({ error: "The image is invalid or too large." });
    }

    if (!mailer) {
        return res.status(503).json({
            error: "Email is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD environment variables in your Vercel project settings.",
        });
    }

    try {
        const info = await mailer.sendMail({
            from: {
                name: "BITS Photobooth",
                address: gmailUser,
            },
            to: recipient,
            subject: "📸 Your BITS Photobooth Strip is Ready!",
            html: `
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #0d0d0d; color: #fff; padding: 40px; border-radius: 12px; max-width: 520px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 28px;">
                        <h1 style="font-size: 22px; font-weight: 800; color: #38bd9e; margin: 0 0 6px;">Your Photostrip is Here! </h1>
                        <p style="color: #888; font-size: 14px; margin: 0;">From BITS Photobooth - Cavite State University</p>
                    </div>
                    <p style="color: #ccc; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
                        Thank you for using BITS Photobooth!
                    </p>
                    <p style="color: #888; font-size: 12px; margin: 0; text-align: center;">
                        Download and print your strip or keep it as a digital memory.
                    </p>
                </div>
            `,
            attachments: [
                {
                    filename: `bits-photostrip.${imageFormat === "png" ? "png" : "jpg"}`,
                    content: imageBuffer,
                    contentType: `image/${imageFormat}`,
                },
            ],
        });

        console.log(`Photostrip email sent — ID: ${info.messageId}`);
        return res.json({ success: true, id: info.messageId });
    } catch (err) {
        console.error("Gmail delivery error:", err);
        if (err.code === "EAUTH" || err.responseCode === 535) {
            return res.status(502).json({
                error: "Gmail authentication failed. Check GMAIL_USER and use a Google App Password (not your regular account password).",
            });
        }
        return res
            .status(502)
            .json({ error: "Gmail could not send the photostrip. Check your internet connection and try again." });
    }
};
