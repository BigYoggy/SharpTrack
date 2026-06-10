const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const { otpStore } = require('./store');

// REGISTER
router.post('/register', async (req, res) => {
    const { name, phone, pin } = req.body;

    if (!name || !phone || !pin) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { phone } });
        if (existingUser) {
            return res.status(400).json({ error: 'Phone number already registered' });
        }

        const hashedPin = await bcrypt.hash(pin, 10);

        const user = await prisma.user.create({
            data: { name, phone, password: hashedPin }
        });

        res.status(201).json({ message: 'Account created successfully' });

    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
        return res.status(400).json({ error: 'Phone and PIN are required' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { phone } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid phone number or PIN' });
        }

        const pinMatch = await bcrypt.compare(pin, user.password);
        if (!pinMatch) {
            return res.status(400).json({ error: 'Invalid phone number or PIN' });
        }

        const token = jwt.sign(
            { userId: user.id, phone: user.phone },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({ 
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, phone: user.phone }
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;