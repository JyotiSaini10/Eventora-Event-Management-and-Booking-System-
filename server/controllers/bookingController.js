const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const { sendBookingEmail } = require('../utils/email');
const { issueOTP, consumeOTP } = require('../utils/otp');

// POST /api/bookings/send-otp
exports.sendBookingOTP = async (req, res) => {
    try {
        await issueOTP(req.user.email, 'event_booking');
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        if (error.code === 'COOLDOWN') return res.status(429).json({ message: error.message });
        if (error.code === 'EMAIL_FAILED') return res.status(502).json({ message: error.message });
        console.error('[booking] sendBookingOTP error:', error);
        res.status(500).json({ message: 'Error sending OTP' });
    }
};

// POST /api/bookings  { eventId, otp }
exports.bookEvent = async (req, res) => {
    try {
        const { eventId, otp } = req.body;
        if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ message: 'Invalid event' });
        if (!otp) return res.status(400).json({ message: 'OTP is required' });

        // Run the cheap business checks first so a "sold out" error does not burn the user's OTP
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        if (event.availableSeats <= 0) return res.status(400).json({ message: 'No seats available' });

        const existingBooking = await Booking.findOne({
            userId: req.user.id,
            eventId,
            status: { $in: ['pending', 'confirmed'] }
        });
        if (existingBooking) return res.status(400).json({ message: 'Already booked or pending' });

        // Verifies the hash, counts wrong attempts, deletes the OTP when used
        const valid = await consumeOTP(req.user.email, otp, 'event_booking');
        if (!valid) return res.status(400).json({ message: 'Invalid or expired OTP for booking' });

        const booking = await Booking.create({
            userId: req.user.id,
            eventId,
            status: 'pending',
            paymentStatus: 'not_paid',
            amount: event.ticketPrice
        });

        res.status(201).json({ message: 'Booking request submitted', booking });
    } catch (error) {
        console.error('[booking] bookEvent error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// PUT /api/bookings/:id/confirm   (admin)
exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body; // 'paid' or 'not_paid'
        const booking = await Booking.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('eventId', 'title');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!booking.eventId || !booking.userId) return res.status(404).json({ message: 'Event or user no longer exists' });
        if (booking.status === 'confirmed') return res.status(400).json({ message: 'Booking is already confirmed' });
        if (booking.status === 'cancelled') return res.status(400).json({ message: 'Cannot confirm a cancelled booking' });

        // Atomic seat decrement: two admins clicking at once can never oversell
        const event = await Event.findOneAndUpdate(
            { _id: booking.eventId._id, availableSeats: { $gt: 0 } },
            { $inc: { availableSeats: -1 } },
            { new: true }
        );
        if (!event) return res.status(400).json({ message: 'No seats available to confirm this booking' });

        try {
            booking.status = 'confirmed';
            if (['paid', 'not_paid'].includes(paymentStatus)) booking.paymentStatus = paymentStatus;
            await booking.save();
        } catch (saveErr) {
            await Event.updateOne({ _id: event._id }, { $inc: { availableSeats: 1 } }); // roll back the seat
            throw saveErr;
        }

        // Fire-and-forget: the admin should not wait on SMTP
        sendBookingEmail(booking.userId.email, booking.userId.name, booking.eventId.title);

        res.json({ message: 'Booking confirmed successfully', booking });
    } catch (error) {
        console.error('[booking] confirmBooking error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// GET /api/bookings/my
exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 })
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        console.error('[booking] getMyBookings error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// DELETE /api/bookings/:id
exports.cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized' });
        }
        if (booking.status === 'cancelled') return res.status(400).json({ message: 'Already cancelled' });

        const wasConfirmed = booking.status === 'confirmed';
        booking.status = 'cancelled';
        await booking.save();

        // Give the seat back only if it had actually been taken, never above totalSeats
        if (wasConfirmed) {
            await Event.updateOne(
                { _id: booking.eventId, $expr: { $lt: ['$availableSeats', '$totalSeats'] } },
                { $inc: { availableSeats: 1 } }
            );
        }

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error('[booking] cancelBooking error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
