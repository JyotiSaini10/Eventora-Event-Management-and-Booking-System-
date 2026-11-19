const nodemailer = require('nodemailer');
require('dotenv').config();

// .env values may carry stray spaces / CRLF. Gmail shows App Passwords as
// "abcd efgh ijkl mnop" - the spaces must not be sent.
const EMAIL_USER = (process.env.EMAIL_USER || '').trim();
const EMAIL_PASS = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

// Provider selection:
//  - BREVO_API_KEY set  -> Brevo HTTP API (works on Render/Vercel/etc. where SMTP ports are blocked)
//  - otherwise          -> Gmail SMTP (fine for local development)
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const MAIL_FROM = (process.env.MAIL_FROM || EMAIL_USER).trim(); // must be a verified sender in Brevo
const useBrevo = Boolean(BREVO_API_KEY);

let transporter = null;
const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: EMAIL_USER, pass: EMAIL_PASS },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
        });
    }
    return transporter;
};

// One function used by every email in the app
const deliver = async ({ to, subject, html, text }) => {
    if (useBrevo) {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: { name: 'Eventora', email: MAIL_FROM },
                to: [{ email: to }],
                subject,
                htmlContent: html,
                ...(text ? { textContent: text } : {})
            }),
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err = new Error(`Brevo API ${res.status}: ${body.slice(0, 200)}`);
            err.code = `BREVO_${res.status}`;
            throw err;
        }
        return;
    }
    await getTransporter().sendMail({ from: `"Eventora" <${EMAIL_USER}>`, to, subject, html, text });
};

const escapeHtml = (s = '') =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Call once at startup so a bad Gmail login is obvious in the console
// instead of silently failing when the first user asks for an OTP.
const verifyEmailConfig = async () => {
    if (useBrevo) {
        try {
            const res = await fetch('https://api.brevo.com/v3/account', {
                headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' },
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} - check BREVO_API_KEY`);
            if (!MAIL_FROM) console.warn('[email] MAIL_FROM is not set - set it to a sender verified in Brevo.');
            console.log(`[email] Brevo API key OK (sending as ${MAIL_FROM})`);
            return true;
        } catch (err) {
            console.error(`[email] Brevo check FAILED: ${err.message}`);
            return false;
        }
    }
    if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('[email] EMAIL_USER / EMAIL_PASS missing in .env - OTP emails will fail.');
        return false;
    }
    if (EMAIL_PASS.length !== 16) {
        console.warn(`[email] EMAIL_PASS is ${EMAIL_PASS.length} characters. A Gmail App Password is exactly 16 letters.`);
    }
    try {
        await getTransporter().verify();
        console.log('[email] Gmail SMTP login OK');
        return true;
    } catch (err) {
        console.error(`[email] Gmail SMTP login FAILED: ${err.message}`);
        if (err.responseCode === 535) console.error('[email] Fix: use a 16-letter Gmail App Password in EMAIL_PASS.');
        return false;
    }
};

const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        await deliver({
            to: userEmail,
            subject: `Booking Confirmed: ${eventTitle}`,
            html: `
        <h2>Hi ${escapeHtml(userName)}!</h2>
        <p>Your booking for the event <strong>${escapeHtml(eventTitle)}</strong> is successfully confirmed.</p>
        <p>Thank you for choosing Eventora.</p>
      `
        });
        console.log('[email] Booking confirmation sent to', userEmail);
    } catch (error) {
        // Never break the admin's confirm action because of an email problem.
        console.error('[email] Error sending booking email:', error.message);
    }
};

// Throws on failure so the caller can tell the user the OTP was NOT sent.
const sendOTPEmail = async (userEmail, otp, type) => {
    const isVerify = type === 'account_verification';
    const title = isVerify ? 'Verify your Eventora Account' : 'Eventora Booking Verification';
    const msg = isVerify
        ? 'Please use the following OTP to verify your new Eventora account.'
        : 'Please use the following OTP to verify and confirm your event booking.';

    try {
        await deliver({
            to: userEmail,
            subject: title,
            text: `${msg}\n\nYour OTP: ${otp}\n\nThis code expires in 5 minutes.`,
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #111;">${title}</h2>
                    <p style="color: #555; font-size: 16px;">${msg}</p>
                    <div style="margin: 20px auto; padding: 15px; font-size: 24px; font-weight: bold; background: #f4f4f4; width: max-content; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p style="color: #999; font-size: 12px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
                </div>
            `
        });
        console.log(`[email] OTP sent to ${userEmail} for ${type}`);
    } catch (error) {
        console.error(`[email] Error sending OTP to ${userEmail}: ${error.code || ''} ${error.message}`);
        const err = new Error('Could not send the OTP email. Please try again in a moment.');
        err.code = 'EMAIL_FAILED';
        throw err;
    }
};

module.exports = { sendBookingEmail, sendOTPEmail, verifyEmailConfig };
