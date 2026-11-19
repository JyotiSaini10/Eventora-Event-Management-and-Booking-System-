const crypto = require('crypto');
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('./email');

const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between OTP emails
const MAX_ATTEMPTS = 5;               // wrong guesses before the OTP is burned

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const hashOTP = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

// Cryptographically secure 6-digit code (Math.random is predictable).
const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

/**
 * Create (or replace) the OTP for email+action and email it.
 * - one atomic upsert instead of delete+create (no duplicate/race issues)
 * - stores only a hash of the code
 * - if the email cannot be sent, the OTP is removed and EMAIL_FAILED is thrown
 * - throws COOLDOWN if an OTP was sent less than 30s ago
 */
const issueOTP = async (email, action) => {
    const existing = await OTP.findOne({ email, action });
    if (existing) {
        const age = Date.now() - existing.createdAt.getTime();
        if (age < RESEND_COOLDOWN_MS) {
            const err = new Error(`Please wait ${Math.ceil((RESEND_COOLDOWN_MS - age) / 1000)}s before requesting another OTP.`);
            err.code = 'COOLDOWN';
            throw err;
        }
    }

    const otp = generateOTP();
    await OTP.findOneAndUpdate(
        { email, action },
        { $set: { otp: hashOTP(otp), attempts: 0, createdAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
        await sendOTPEmail(email, otp, action);
    } catch (err) {
        await OTP.deleteOne({ email, action });
        throw err;
    }
};

/** Returns true (and consumes the OTP) only if the code is correct and unexpired. */
const consumeOTP = async (email, code, action) => {
    const record = await OTP.findOne({ email, action });
    if (!record) return false;

    if (record.attempts >= MAX_ATTEMPTS) {
        await OTP.deleteOne({ _id: record._id });
        return false;
    }

    if (record.otp !== hashOTP(String(code || '').trim())) {
        await OTP.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
        return false;
    }

    await OTP.deleteOne({ _id: record._id });
    return true;
};

module.exports = { issueOTP, consumeOTP, normalizeEmail };
