const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { verifyEmailConfig } = require('./utils/email');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');

// Fail fast with a clear message instead of a mystery 500 later
['MONGO_URI', 'JWT_SECRET'].forEach((key) => {
    if (!process.env[key]) {
        console.error(`Missing ${key} in .env`);
        process.exit(1);
    }
});

const app = express();

// CLIENT_URL=http://localhost:5173 (comma separated for several). Unset = allow any origin (dev).
const allowedOrigins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((s) => s.trim()) : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));

// Last-resort error handler (bad JSON body etc.)
app.use((err, req, res, next) => {
    console.error('[server] unhandled error:', err.message);
    res.status(err.status || 500).json({ message: err.status === 400 ? 'Bad request' : 'Server Error' });
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB Connected');
        await mongoose.model('OTP').syncIndexes().catch((e) => console.warn('[otp] index sync:', e.message));
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
        verifyEmailConfig();
    })
    .catch((err) => {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });
