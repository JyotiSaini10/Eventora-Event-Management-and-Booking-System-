const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true },
    otp: { type: String, required: true }, // sha256 hash of the code, never the plain code
    action: { type: String, enum: ['account_verification', 'event_booking'], required: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 300 } // OTP expires in 5 minutes
});

// One live OTP per email + purpose
otpSchema.index({ email: 1, action: 1 }, { unique: true });

module.exports = mongoose.model('OTP', otpSchema);
