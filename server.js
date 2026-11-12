const express = require("express");
require("dotenv").config();
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");

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

    const imageBuffer = Buffer.from(imageMatch[2], "base64");
    if (
        imageBuffer.length === 0 ||
        imageBuffer.length > maxImageBytes ||
        imageBuffer.toString("base64") !== imageMatch[2]
    ) {
        return res.status(400).json({ error: "The image is invalid or too large." });
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
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #ffffff; color: #0d0d0d; padding: 40px; border-radius: 12px; max-width: 520px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 28px;">
                        <h1 style="font-size: 22px; font-weight: 800; color: #38bd9e; margin: 0 0 6px;">Your Photostrip is Here! </h1>
                        <p style="color: #888; font-size: 14px; margin: 0;">From BITS Photobooth - Cavite State University</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: `bits-photostrip.${imageMatch[1] === "png" ? "png" : "jpg"}`,
                    content: imageBuffer,
                    contentType: `image/${imageMatch[1]}`,
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
});

let printQueue = [];
let nextQueueSequence = 1;

const AUTO_SAVE_DIR = path.join(__dirname, "QueueImages");
try {
    fs.mkdirSync(AUTO_SAVE_DIR, { recursive: true });
    console.log(`Auto-saving photostrips to: ${AUTO_SAVE_DIR}`);
} catch (err) {
    console.warn("Could not create auto-save folder:", err.message);
}

const autoSaveFingerprints = new Set();
let autoSaveCounter = 0;

function nextAutoSaveNumber() {
    try {
        const existing = fs.readdirSync(AUTO_SAVE_DIR)
            .map((f) => parseInt(String(f).match(/^(\d+)\./)?.[1] || "0", 10))
            .filter((n) => Number.isFinite(n) && n > 0);
        return Math.max(autoSaveCounter, ...existing, 0) + 1;
    } catch {
        return autoSaveCounter + 1;
    }
}

function autoSaveQueueImage(imageBase64, label) {
    try {
        const match = imageBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) return;
        const buffer = Buffer.from(match[2], "base64");
        const fingerprint = crypto.createHash("md5").update(match[2]).digest("hex");
        if (autoSaveFingerprints.has(fingerprint)) return;
        autoSaveFingerprints.add(fingerprint);
        const number = nextAutoSaveNumber();
        autoSaveCounter = number;
        const filename = `${number}.${match[1] === "jpeg" || match[1] === "jpg" ? "jpg" : match[1]}`;
        fs.writeFile(path.join(AUTO_SAVE_DIR, filename), buffer, (err) => {
            if (err) console.warn("Auto-save failed:", err.message);
            else console.log(`Saved photostrip: ${filename}`);
        });
    } catch (err) {
        console.warn("Auto-save error:", err.message);
    }
}

app.get("/api/queue-images", (req, res) => {
    try {
        const files = fs.readdirSync(AUTO_SAVE_DIR)
            .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
            .sort((a, b) => (parseInt(a.match(/^(\d+)\./)?.[1] || 0, 10) - parseInt(b.match(/^(\d+)\./)?.[1] || 0, 10)))
            .map((f) => "QueueImages/" + f);
        res.json({ images: files });
    } catch (err) {
        res.json({ images: [] });
    }
});

app.get("/api/queue", (req, res) => {
    res.json({ queue: printQueue });
});

app.post("/api/queue", (req, res) => {
    const { imageBase64, timestamp, clientTicket } = req.body || {};
    if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64." });
    }

    const item = {
        id: nextQueueSequence++,
        ticketNumber: clientTicket || `T-${String(nextQueueSequence - 1).padStart(3, '0')}`,
        imageBase64,
        status: "pending",
        createdAt: timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    printQueue.push(item);
    autoSaveQueueImage(imageBase64, item.ticketNumber);
    res.json({ success: true, item });
});

app.patch("/api/queue/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    const validStatuses = ["pending", "printed", "discarded"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status value." });
    }

    const item = printQueue.find((q) => q.id === id);
    if (!item) {
        return res.status(404).json({ error: "Item not found in queue." });
    }

    item.status = status;
    item.updatedAt = new Date().toISOString();
    res.json({ success: true, item });
});

app.delete("/api/queue/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const index = printQueue.findIndex((q) => q.id === id);
    if (index === -1) {
        return res.status(404).json({ error: "Item not found in queue." });
    }
    const removed = printQueue.splice(index, 1);
    res.json({ success: true, removed: removed[0] });
});

app.delete("/api/queue", (req, res) => {
    printQueue = [];
    res.json({ success: true, message: "Queue cleared." });
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
http.createServer(app).listen(PORT, () => {
    console.log(`BITS Photobooth server running → http://localhost:${PORT}`);
});

try {
    const tlsKey = fs.readFileSync(path.join(__dirname, "certs", "key.pem"));
    const tlsCert = fs.readFileSync(path.join(__dirname, "certs", "cert.pem"));
    const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
    https.createServer({ key: tlsKey, cert: tlsCert }, app).listen(HTTPS_PORT, () => {
        console.log(`BITS Photobooth HTTPS server running → https://<your-LAN-IP>:${HTTPS_PORT}`);
    });
} catch {
    console.warn("HTTPS disabled: missing certs/key.pem or certs/cert.pem");
}
