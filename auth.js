const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('./middleware/auth');

const prisma = new PrismaClient();

const { otpStore } = require('./store');

// Helper: log activity
async function logActivity(userId, action, details) {
    try {
        await prisma.activityLog.create({
            data: { userId, action, details }
        });
    } catch (err) {
        console.error('Failed to log activity:', err.message);
    }
}

// Helper: create notification
async function createNotification(userId, type, title, message) {
    try {
        await prisma.notification.create({
            data: { userId, type, title, message }
        });
    } catch (err) {
        console.error('Failed to create notification:', err.message);
    }
}

// REGISTER
router.post('/register', async (req, res) => {
    const { name, phone, pin } = req.body;

    if (!name || !phone || !pin) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    if (typeof phone !== 'string' || !/^\d{10,15}$/.test(phone.replace(/[^0-9]/g, ''))) {
        return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    if (typeof pin !== 'string' || pin.length !== 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    }

    try {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const existingUser = await prisma.user.findUnique({ where: { phone: cleanPhone } });
        if (existingUser) {
            return res.status(400).json({ error: 'This phone number is already registered. Please sign in instead.' });
        }

        const hashedPin = await bcrypt.hash(pin, 12);

        const user = await prisma.user.create({
            data: { 
                name: name.trim(), 
                phone: cleanPhone, 
                password: hashedPin 
            }
        });

        // Create welcome notification
        await createNotification(
            user.id, 
            'success', 
            'Welcome to SharpTrack! 🎉', 
            'Your account has been created successfully. Start by adding your first product to inventory.'
        );

        // Log activity
        await logActivity(user.id, 'account_created', 'Account registered successfully');

        // Generate token so user can auto-login after registration
        const token = jwt.sign(
            { userId: user.id, phone: user.phone },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ 
            message: 'Account created successfully',
            token,
            user: { 
                id: user.id, 
                name: user.name, 
                phone: user.phone,
                onboardingCompleted: user.onboardingCompleted
            }
        });

    } catch (err) {
        console.error('Registration error:', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { phone, pin } = req.body;

    if (!phone || !pin) {
        return res.status(400).json({ error: 'Phone number and PIN are required' });
    }

    try {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid phone number or PIN' });
        }

        if (user.status === 'Suspended') {
            return res.status(403).json({ error: 'This merchant account has been suspended. Please contact support.' });
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

        // Log activity
        await logActivity(user.id, 'login', 'Logged in successfully');

        res.status(200).json({ 
            message: 'Login successful',
            token,
            user: { 
                id: user.id, 
                name: user.name, 
                phone: user.phone,
                email: user.email,
                storeName: user.storeName,
                profilePhoto: user.profilePhoto,
                onboardingCompleted: user.onboardingCompleted,
                darkMode: user.darkMode,
                createdAt: user.createdAt
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// GET CURRENT USER
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                storeName: true,
                profilePhoto: true,
                onboardingCompleted: true,
                darkMode: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (err) {
        console.error('Get user error:', err.message);
        res.status(500).json({ error: 'Failed to load user data' });
    }
});

// UPDATE PROFILE
router.put('/profile', authMiddleware, async (req, res) => {
    const { name, email, storeName, profilePhoto, onboardingCompleted, darkMode } = req.body;

    try {
        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (email !== undefined) updateData.email = email.trim();
        if (storeName !== undefined) updateData.storeName = storeName.trim();
        if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;
        if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
        if (darkMode !== undefined) updateData.darkMode = darkMode;

        const user = await prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                storeName: true,
                profilePhoto: true,
                onboardingCompleted: true,
                darkMode: true,
                createdAt: true,
                updatedAt: true
            }
        });

        await logActivity(req.userId, 'profile_updated', 'Profile information updated');

        res.json({ message: 'Profile updated successfully', user });
    } catch (err) {
        console.error('Update profile error:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// CHANGE PIN
router.put('/pin', authMiddleware, async (req, res) => {
    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
        return res.status(400).json({ error: 'Current PIN and new PIN are required' });
    }

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ error: 'New PIN must be exactly 6 digits' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        
        const pinMatch = await bcrypt.compare(currentPin, user.password);
        if (!pinMatch) {
            return res.status(400).json({ error: 'Current PIN is incorrect' });
        }

        const hashedPin = await bcrypt.hash(newPin, 12);
        await prisma.user.update({
            where: { id: req.userId },
            data: { password: hashedPin }
        });

        await logActivity(req.userId, 'pin_changed', 'Login PIN was changed');
        await createNotification(req.userId, 'info', 'PIN Changed', 'Your login PIN has been updated successfully.');

        res.json({ message: 'PIN changed successfully' });
    } catch (err) {
        console.error('Change PIN error:', err.message);
        res.status(500).json({ error: 'Failed to change PIN' });
    }
});

// GET USER ACHIEVEMENTS
router.get('/achievements', authMiddleware, async (req, res) => {
    try {
        const productCount = await prisma.product.count({ where: { userId: req.userId } });
        const saleCount = await prisma.sale.count({ where: { userId: req.userId } });
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        
        // Dynamic achievements based on user activity
        const achievementsList = [
            {
                id: 'first_product',
                title: 'First Product',
                description: 'Add your first product to inventory',
                unlocked: productCount > 0,
                icon: '📦'
            },
            {
                id: 'first_sale',
                title: 'First Sale',
                description: 'Record your first sales transaction',
                unlocked: saleCount > 0,
                icon: '💰'
            },
            {
                id: 'sales_10',
                title: 'Sales Star',
                description: 'Record 10 sales transactions',
                unlocked: saleCount >= 10,
                icon: '⭐'
            },
            {
                id: 'sales_50',
                title: 'Super Merchant',
                description: 'Record 50 sales transactions',
                unlocked: saleCount >= 50,
                icon: '🏆'
            },
            {
                id: 'store_set',
                title: 'Shop Owner',
                description: 'Configure your customized store name',
                unlocked: !!user.storeName && user.storeName !== 'My Shop',
                icon: '🏪'
            },
            {
                id: 'email_set',
                title: 'Verified Merchant',
                description: 'Add your email to profile card',
                unlocked: !!user.email,
                icon: '🛡️'
            },
            {
                id: 'dark_mode',
                title: 'Night Owl',
                description: 'Enable dark mode style preferences',
                unlocked: user.darkMode,
                icon: '🌙'
            }
        ];

        res.json({ achievements: achievementsList });
    } catch (err) {
        console.error('Get achievements error:', err.message);
        res.status(500).json({ error: 'Failed to load achievements' });
    }
});

module.exports = router;
module.exports.logActivity = logActivity;
module.exports.createNotification = createNotification;