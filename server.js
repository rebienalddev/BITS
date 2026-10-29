const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
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
const maxImageBytes = 7 * 1024 * 1024;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname)));

app.post("/api/send-email", async (req, res) => {
    const { email, imageBase64 } = req.body || {};

    if (typeof email !== "string" || typeof imageBase64 !== "string") {
        return res.status(400).json({ error: "Missing email or image." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipient = email.trim();
    if (!emailRegex.test(recipient)) {
        return res.status(400).json({ error: "Invalid email address." });
    }

    const imageMatch = imageBase64.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!imageMatch || imageMatch[1].length % 4 !== 0) {
        return res.status(400).json({ error: "The image must be a valid PNG data URL." });
    }

    const imageBuffer = Buffer.from(imageMatch[1], "base64");
    if (
        imageBuffer.length === 0 ||
        imageBuffer.length > maxImageBytes ||
        imageBuffer.toString("base64") !== imageMatch[1]
    ) {
        return res.status(400).json({ error: "The PNG image is invalid or too large." });
    }

    if (!mailer) {
        return res.status(503).json({
            error: "Email is not configured. Add GMAIL_USER and a Google App Password as GMAIL_APP_PASSWORD to your .env file, then restart the app.",
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
                    filename: "bits-photostrip.png",
                    content: imageBuffer,
                    contentType: "image/png",
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
});

app.use("/api", (req, res) => {
    res.status(404).json({ error: "Email API endpoint not found. Restart the app with npm start." });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err.type === "entity.too.large") {
        return res.status(413).json({
            error: "The photostrip is too large to email. Please try again with a smaller image.",
        });
    }

    console.error("Request parsing error:", err);
    return res.status(err.status || 400).json({ error: "The server could not read the email request." });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`BITS Photobooth server running → http://localhost:${PORT}`);
});
