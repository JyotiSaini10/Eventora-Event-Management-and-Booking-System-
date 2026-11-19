const mongoose = require('mongoose');
const Event = require('../models/Event');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getEvents = async (req, res) => {
    try {
        const filters = {};
        if (req.query.category) filters.category = String(req.query.category);
        if (req.query.search) filters.title = { $regex: escapeRegex(req.query.search), $options: 'i' };

        const events = await Event.find(filters).populate('createdBy', 'name email').sort({ date: 1 });
        res.json(events);
    } catch (error) {
        console.error('[event] getEvents error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getEventById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Event not found' });
        const event = await Event.findById(req.params.id).populate('createdBy', 'name email');
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (error) {
        console.error('[event] getEventById error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { title, description, date, location, category, totalSeats, ticketPrice, image } = req.body;
        const seats = Number(totalSeats);
        if (!title || !description || !date || !location || !category || !Number.isInteger(seats) || seats < 1) {
            return res.status(400).json({ message: 'Title, description, date, location, category and a valid seat count are required' });
        }
        const event = await Event.create({
            title,
            description,
            date,
            location,
            category,
            totalSeats: seats,
            availableSeats: seats,
            ticketPrice: Math.max(0, Number(ticketPrice) || 0),
            image: image || '',
            createdBy: req.user.id
        });
        res.status(201).json(event);
    } catch (error) {
        console.error('[event] createEvent error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        // Whitelist: never let the client overwrite availableSeats / createdBy directly
        ['title', 'description', 'date', 'location', 'category', 'image', 'ticketPrice'].forEach((f) => {
            if (req.body[f] !== undefined) event[f] = req.body[f];
        });

        if (req.body.totalSeats !== undefined) {
            const newTotal = Number(req.body.totalSeats);
            if (!Number.isInteger(newTotal) || newTotal < 1) return res.status(400).json({ message: 'Invalid seat count' });
            const taken = event.totalSeats - event.availableSeats;
            if (newTotal < taken) return res.status(400).json({ message: `Cannot go below ${taken} seats already confirmed` });
            event.totalSeats = newTotal;
            event.availableSeats = newTotal - taken;
        }

        await event.save();
        res.json(event);
    } catch (error) {
        console.error('[event] updateEvent error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json({ message: 'Event deleted successfully' });
    } catch (error) {
        console.error('[event] deleteEvent error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
