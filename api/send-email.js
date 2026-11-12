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

    const { email, imageBase64, rawImagesBase64 } = req.body || {};

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

    const rawAttachments = [];
    if (rawImagesBase64 !== undefined) {
        if (!Array.isArray(rawImagesBase64) || rawImagesBase64.length > 12) {
            return res.status(400).json({ error: "rawImagesBase64 must be an array of at most 12 image data URLs." });
        }
        for (let i = 0; i < rawImagesBase64.length; i++) {
            const raw = rawImagesBase64[i];
            if (typeof raw !== "string") {
                return res.status(400).json({ error: "Each raw photo must be an image data URL string." });
            }
            const rawMatch = raw.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
            if (!rawMatch || rawMatch[2].length % 4 !== 0) {
                return res.status(400).json({ error: "Each raw photo must be a valid PNG or JPEG data URL." });
            }
            const rawBuffer = Buffer.from(rawMatch[2], "base64");
            if (
                rawBuffer.length === 0 ||
                rawBuffer.length > maxImageBytes ||
                rawBuffer.toString("base64") !== rawMatch[2]
            ) {
                return res.status(413).json({ error: "A raw photo is invalid or too large." });
            }
            rawAttachments.push({
                filename: `bits-photo-${String(i + 1).padStart(2, "0")}.${rawMatch[1] === "png" ? "png" : "jpg"}`,
                content: rawBuffer,
                contentType: `image/${rawMatch[1]}`,
            });
        }
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
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #ffffff; color: #0d0d0d; padding: 40px; border-radius: 12px; max-width: 520px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 28px;">
                        <h1 style="font-size: 22px; font-weight: 800; color: #38bd9e; margin: 0 0 6px;">Your Photostrip is Here! </h1>
                        <p style="color: #888; font-size: 14px; margin: 0;">From BITS Photobooth - Cavite State University</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `bits-photostrip.${imageFormat === "png" ? "png" : "jpg"}`,
                    content: imageBuffer,
                    contentType: `image/${imageFormat}`,
                },
                ...rawAttachments,
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
