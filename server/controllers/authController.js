const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { issueOTP, consumeOTP, normalizeEmail } = require('../utils/otp');

const generateToken = (id, role) =>
    jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });

const userPayload = (user) => ({
    _id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user.id, user.role)
});

/**
 * Send an account-verification OTP.
 * Returns { emailSent, message }. A cooldown counts as "already sent".
 * Only a real email failure gives emailSent:false.
 */
const sendVerificationOTP = async (email) => {
    try {
        await issueOTP(email, 'account_verification');
        return { emailSent: true, message: 'OTP sent to your email. Please verify.' };
    } catch (err) {
        if (err.code === 'COOLDOWN') return { emailSent: true, message: 'An OTP was already sent. Please check your inbox (and spam folder).' };
        if (err.code === 'EMAIL_FAILED') return { emailSent: false, message: err.message };
        throw err;
    }
};

exports.register = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
        if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

        let user = await User.findOne({ email });
        if (user && user.isVerified) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        if (user) {
            // Earlier sign-up never got verified (e.g. the OTP email failed): let them retry.
            user.name = name;
            user.password = hashedPassword;
            await user.save();
        } else {
            user = await User.create({
                name,
                email,
                password: hashedPassword,
                role: 'user', // never trust a role from the client
                isVerified: false
            });
        }

        const { emailSent, message } = await sendVerificationOTP(user.email);
        if (!emailSent) {
            return res.status(502).json({ message, email: user.email, emailSent: false });
        }
        res.status(201).json({ message, email: user.email, emailSent: true });
    } catch (error) {
        console.error('[auth] register error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.login = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (!user.isVerified && user.role !== 'admin') {
            const { emailSent, message } = await sendVerificationOTP(user.email);
            return res.status(403).json({
                message: emailSent ? 'Account not verified' : message,
                needsVerification: true,
                emailSent,
                email: user.email
            });
        }

        res.json(userPayload(user));
    } catch (error) {
        console.error('[auth] login error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const ok = await consumeOTP(email, req.body.otp, 'account_verification');
        if (!ok) return res.status(400).json({ message: 'Invalid or expired OTP' });

        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json(userPayload(user));
    } catch (error) {
        console.error('[auth] verifyOTP error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// POST /api/auth/resend-otp  { email }
exports.resendOTP = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const user = await User.findOne({ email });

        // Same answer whether or not the account exists (no account enumeration)
        const generic = { message: 'If this account needs verification, a new OTP has been sent.' };
        if (!user || user.isVerified) return res.json(generic);

        try {
            await issueOTP(email, 'account_verification');
        } catch (err) {
            if (err.code === 'COOLDOWN') return res.status(429).json({ message: err.message });
            if (err.code === 'EMAIL_FAILED') return res.status(502).json({ message: err.message });
            throw err;
        }
        res.json(generic);
    } catch (error) {
        console.error('[auth] resendOTP error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
