const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('./lib/prisma');
const authMiddleware = require('./middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { otpStore } = require('./store');
const { logActivity, createNotification } = require('./lib/monitoring');
const { sendCongratulationMail } = require('./services/email');

// Lockout state for merchant login attempts
const merchantLoginAttempts = {};
const MERCH_LIMIT_MAX = 5;
const MERCH_LOCKOUT_MINUTES = 15;

function checkMerchantLockout(phone) {
    const record = merchantLoginAttempts[phone];
    if (record) {
        const now = Date.now();
        if (record.lockUntil && record.lockUntil > now) {
            const remaining = Math.ceil((record.lockUntil - now) / 60000);
            return { locked: true, remaining };
        }
        if (record.lockUntil && record.lockUntil <= now) {
            delete merchantLoginAttempts[phone];
        }
    }
    return { locked: false };
}

function recordMerchantFailedAttempt(phone) {
    if (!merchantLoginAttempts[phone]) {
        merchantLoginAttempts[phone] = { count: 1, lockUntil: null };
    } else {
        merchantLoginAttempts[phone].count += 1;
        if (merchantLoginAttempts[phone].count >= MERCH_LIMIT_MAX) {
            merchantLoginAttempts[phone].lockUntil = Date.now() + MERCH_LOCKOUT_MINUTES * 60 * 1000;
        }
    }
}

function resetMerchantFailedAttempts(phone) {
    delete merchantLoginAttempts[phone];
}

// GOOGLE AUTH
router.post('/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Google ID token is required' });
    }

    try {
        let payload;
        // Support testing with mock token
        if (token.startsWith('mock-google-token-')) {
            const suffix = token.replace('mock-google-token-', '');
            payload = {
                sub: `mock-google-id-${suffix}`,
                email: `${suffix}@example.com`,
                name: `Mock User ${suffix}`,
                email_verified: true
            };
        } else {
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        }

        if (!payload || !payload.email) {
            return res.status(400).json({ error: 'Invalid Google token' });
        }

        const googleId = payload.sub;
        const email = payload.email.toLowerCase();
        const name = payload.name || email.split('@')[0];

        // 1. Find user by googleId
        let user = await prisma.user.findUnique({ where: { googleId } });

        if (!user) {
            // 2. Or find user by email
            user = await prisma.user.findUnique({ where: { email } });
            if (user) {
                // Link Google to existing email account
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId,
                        authProvider: 'google'
                    }
                });
                await logActivity(user.id, 'google_account_linked', 'Linked Google login to existing email account');
            } else {
                // 3. Create a new user
                user = await prisma.user.create({
                    data: {
                        name,
                        email,
                        googleId,
                        authProvider: 'google',
                        onboardingCompleted: false
                    }
                });
                await createNotification(
                    user.id,
                    'INFO',
                    'Welcome to SharpTrack! 🎉',
                    'Your account has been created successfully. Set up your workspace to get started.'
                );
                await logActivity(user.id, 'account_created', 'Account registered successfully via Google OAuth');
            }
        }

        if (user.status === 'Suspended') {
            return res.status(403).json({ error: 'This merchant account has been suspended. Please contact support.' });
        }

        const jwtToken = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Google authentication successful',
            token: jwtToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                storeName: user.storeName,
                businessSector: user.businessSector,
                profilePhoto: user.profilePhoto,
                onboardingCompleted: user.onboardingCompleted,
                darkMode: user.darkMode,
                createdAt: user.createdAt
            }
        });

    } catch (err) {
        console.error('Google Auth error:', err.message);
        res.status(500).json({ error: 'Google authentication failed. Please try again.' });
    }
});

// EMAIL REGISTER
router.post('/register-email', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Enforce OTP verification check for email
    const otpRecord = otpStore[cleanEmail];
    if (!otpRecord || !otpRecord.verified || Date.now() > otpRecord.verificationExpires) {
        return res.status(400).json({ error: 'Email has not been verified via OTP or verification has expired.' });
    }

    try {
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: cleanEmail }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'An account with this email is already registered.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: cleanEmail,
                password: hashedPassword,
                authProvider: 'email',
                onboardingCompleted: false
            }
        });

        await createNotification(
            user.id,
            'INFO',
            'Welcome to SharpTrack! 🎉',
            'Your account has been created successfully. Set up your workspace to get started.'
        );

        await logActivity(user.id, 'account_created', 'Account registered successfully via email/password');

        // Consume the OTP verification session
        delete otpStore[cleanEmail];

        const jwtToken = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Account created successfully',
            token: jwtToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                storeName: user.storeName,
                businessSector: user.businessSector,
                profilePhoto: user.profilePhoto,
                onboardingCompleted: user.onboardingCompleted,
                darkMode: user.darkMode,
                createdAt: user.createdAt
            }
        });

    } catch (err) {
        console.error('Email registration error:', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// EMAIL LOGIN
router.post('/login-email', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    try {
        const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        if (user.status === 'Suspended') {
            return res.status(403).json({ error: 'This merchant account has been suspended. Please contact support.' });
        }

        if (user.authProvider === 'google' && !user.password) {
            return res.status(400).json({ error: 'This account was created with Google. Please use Google Sign In.' });
        }

        if (!user.password) {
            return res.status(400).json({ error: 'Password authentication not set up for this account.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const jwtToken = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        await logActivity(user.id, 'login', 'Logged in successfully via email/password');

        res.status(200).json({
            message: 'Login successful',
            token: jwtToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                storeName: user.storeName,
                businessSector: user.businessSector,
                profilePhoto: user.profilePhoto,
                onboardingCompleted: user.onboardingCompleted,
                darkMode: user.darkMode,
                createdAt: user.createdAt
            }
        });

    } catch (err) {
        console.error('Email login error:', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

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

        // Enforce OTP verification check
        const otpRecord = otpStore[cleanPhone];
        if (!otpRecord || !otpRecord.verified || Date.now() > otpRecord.verificationExpires) {
            return res.status(400).json({ error: 'Phone number has not been verified via OTP or verification has expired.' });
        }

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

        // Consume the OTP verification session
        delete otpStore[cleanPhone];

        // Create welcome notification
        await createNotification(
            user.id, 
            'info', 
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

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // Check account lockout
    const lockout = checkMerchantLockout(cleanPhone);
    if (lockout.locked) {
        return res.status(429).json({ 
            error: `Too many failed login attempts. This account is temporarily locked. Please try again in ${lockout.remaining} minute(s).` 
        });
    }

    try {
        const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
        if (!user) {
            recordMerchantFailedAttempt(cleanPhone);
            return res.status(400).json({ error: 'Invalid phone number or PIN' });
        }

        if (user.status === 'Suspended') {
            return res.status(403).json({ error: 'This merchant account has been suspended. Please contact support.' });
        }

        const pinMatch = await bcrypt.compare(pin, user.password);
        if (!pinMatch) {
            recordMerchantFailedAttempt(cleanPhone);
            return res.status(400).json({ error: 'Invalid phone number or PIN' });
        }

        // Reset lockout attempts on success
        resetMerchantFailedAttempts(cleanPhone);

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

// GET GOOGLE CLIENT ID
router.get('/google-client-id', (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
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
    const { name, email, storeName, businessSector, profilePhoto, onboardingCompleted, darkMode } = req.body;

    try {
        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (email !== undefined) updateData.email = email.trim();
        if (storeName !== undefined) updateData.storeName = storeName.trim();
        if (businessSector !== undefined) updateData.businessSector = businessSector.trim();
        if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;
        if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
        if (darkMode !== undefined) updateData.darkMode = darkMode;

        // Fetch existing user to check if onboarding is being completed for the first time
        const existingUser = await prisma.user.findUnique({ where: { id: req.userId } });

        const user = await prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                storeName: true,
                businessSector: true,
                profilePhoto: true,
                onboardingCompleted: true,
                darkMode: true,
                createdAt: true,
                updatedAt: true
            }
        });

        await logActivity(req.userId, 'profile_updated', 'Profile information updated');
        await createNotification(req.userId, 'info', 'Store Profile Updated', 'Your store profile settings have been updated successfully.');

        // Send congratulation email if onboarding was just completed now
        if (onboardingCompleted === true && existingUser && !existingUser.onboardingCompleted && user.email) {
            try {
                await sendCongratulationMail(user.email, user.name, user.storeName || 'your store');
            } catch (emailErr) {
                console.error('Failed to send congratulation email:', emailErr.message);
            }
        }

        res.json({ message: 'Profile updated successfully', user });
    } catch (err) {
        console.error('Update profile error:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// CHANGE PIN / PASSWORD
router.put('/pin', authMiddleware, async (req, res) => {
    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
        return res.status(400).json({ error: 'Current credential and new credential are required' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        
        // Validate new credential based on account type
        if (user.email) {
            if (newPin.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters' });
            }
        } else {
            if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
                return res.status(400).json({ error: 'New PIN must be exactly 6 digits' });
            }
        }

        const pinMatch = await bcrypt.compare(currentPin, user.password);
        if (!pinMatch) {
            return res.status(400).json({ error: `Current ${user.email ? 'password' : 'PIN'} is incorrect` });
        }

        const hashedPin = await bcrypt.hash(newPin, 12);
        await prisma.user.update({
            where: { id: req.userId },
            data: { password: hashedPin }
        });

        await logActivity(req.userId, 'credential_changed', `Login ${user.email ? 'password' : 'PIN'} was changed`);
        await createNotification(req.userId, 'info', `${user.email ? 'Password' : 'PIN'} Changed`, `Your login ${user.email ? 'password' : 'PIN'} has been updated successfully.`);

        res.json({ message: `${user.email ? 'Password' : 'PIN'} changed successfully` });
    } catch (err) {
        console.error('Change credential error:', err.message);
        res.status(500).json({ error: 'Failed to change credential' });
    }
});

// GET USER ACHIEVEMENTS
router.get('/achievements', authMiddleware, async (req, res) => {
    try {
        const tidb = require('./services/tidb');
        const productCount = await tidb.countProductsByUser(req.userId);
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

// REQUEST PASSWORD (PIN) RESET (via OTP)
router.post('/reset-pin/request', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    try {
        const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
        if (!user) {
            // To prevent username enumeration, we can return a generic success message or standard error.
            // But since this is a merchant helper, return user-not-found so they know their input is wrong.
            return res.status(404).json({ error: 'This phone number is not registered.' });
        }
        
        // Generate reset OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashed = crypto.createHash('sha256').update(otp).digest('hex');
        
        const now = Date.now();
        otpStore[cleanPhone] = {
            hashedOtp: hashed,
            expires: now + 5 * 60 * 1000,
            attempts: 0,
            verified: false,
            purpose: 'reset_pin'
        };
        
        console.log(`[OTP Reset Pin] OTP for ${cleanPhone}: ${otp}`);
        
        const { sendSMS } = require('./services/termii');
        await sendSMS(cleanPhone, `Your SharpTrack security code to reset your PIN is: ${otp}. It expires in 5 minutes.`);
        
        res.json({ message: 'Reset code sent successfully' });
    } catch (err) {
        console.error('Reset PIN request error:', err.message);
        res.status(500).json({ error: 'Failed to send reset code' });
    }
});

// VERIFY PASSWORD (PIN) RESET
router.post('/reset-pin/verify', async (req, res) => {
    const { phone, otp, newPin } = req.body;
    if (!phone || !otp || !newPin) {
        return res.status(400).json({ error: 'Phone, OTP, and new PIN are required' });
    }
    
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const record = otpStore[cleanPhone];
    const now = Date.now();
    
    if (!record || record.purpose !== 'reset_pin' || !record.hashedOtp) {
        return res.status(400).json({ error: 'OTP request not found. Please request a new one.' });
    }
    
    if (now > record.expires) {
        delete otpStore[cleanPhone];
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    
    if (record.attempts >= 3) {
        delete otpStore[cleanPhone];
        return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }
    
    const inputHash = crypto.createHash('sha256').update(otp).digest('hex');
    
    if (record.hashedOtp !== inputHash) {
        record.attempts += 1;
        if (record.attempts >= 3) {
            delete otpStore[cleanPhone];
            return res.status(400).json({ error: 'Too many failed attempts. Please request a new OTP.' });
        }
        return res.status(400).json({ error: `Invalid OTP. Attempts remaining: ${3 - record.attempts}` });
    }
    
    try {
        const hashedPin = await bcrypt.hash(newPin, 12);
        await prisma.user.update({
            where: { phone: cleanPhone },
            data: { password: hashedPin }
        });
        
        // Clear OTP session
        delete otpStore[cleanPhone];
        
        // Fetch user to log activity and create welcome notifications
        const user = await prisma.user.findUnique({ where: { phone: cleanPhone } });
        if (user) {
            await logActivity(user.id, 'pin_reset', 'PIN was reset successfully via OTP');
            await createNotification(user.id, 'info', 'PIN Reset Successful', 'Your account login PIN was reset successfully.');
        }
        
        res.json({ message: 'PIN reset successful. You can now log in.' });
    } catch (err) {
        console.error('Reset PIN verify error:', err.message);
        res.status(500).json({ error: 'Failed to reset PIN' });
    }
});

module.exports = router;
module.exports.logActivity = logActivity;
module.exports.createNotification = createNotification;