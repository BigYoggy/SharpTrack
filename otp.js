const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

// Store OTPs temporarily in memory
const { otpStore } = require('./store');
const { sendSMS } = require('./services/termii');
const { sendEmailOTP } = require('./services/email');
const adminAuth = require('./middleware/adminAuth');

// Hash OTP with SHA-256
function hashOtp(otp) {
    return crypto.createHash('sha256').update(otp.toString()).digest('hex');
}

// DEBUG ROUTE: List all active Sender IDs on Termii (SUPER_ADMIN or ADMIN only)
router.get('/debug-sender-ids', adminAuth, async (req, res) => {
    const apiKey = process.env.TERMII_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'TERMII_API_KEY is not configured on this server' });
    }

    try {
        const response = await axios.get(`https://api.ng.termii.com/api/sender-id`, {
            params: { api_key: apiKey }
        });
        res.json({
            success: true,
            data: response.data
        });
    } catch (err) {
        const errMsg = err.response && err.response.data 
            ? JSON.stringify(err.response.data) 
            : err.message;
        res.status(500).json({
            success: false,
            error: errMsg
        });
    }
});

// SEND OTP (with rate limits per phone number)
router.post('/send', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!/^\d{10,15}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    const now = Date.now();
    let record = otpStore[cleanPhone];

    if (record) {
        // Reset limit window if 10 minutes have passed
        if (record.requestWindowStart && now - record.requestWindowStart > 10 * 60 * 1000) {
            record.requestCount = 0;
            record.requestWindowStart = now;
        }

        // Limit requests to 3 per 10 minutes
        if (record.requestCount >= 3) {
            const waitMinutes = Math.ceil((10 * 60 * 1000 - (now - record.requestWindowStart)) / 60000);
            return res.status(429).json({ 
                error: `Too many OTP requests. Please wait ${waitMinutes} minute(s) before requesting again.` 
            });
        }
    } else {
        record = {
            requestCount: 0,
            requestWindowStart: now,
            attempts: 0,
            verified: false
        };
        otpStore[cleanPhone] = record;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = hashOtp(otp);

    // Update record
    record.hashedOtp = hashed;
    record.expires = now + 5 * 60 * 1000; // 5 minutes expiration
    record.attempts = 0; // Reset attempts for new OTP
    record.requestCount += 1;
    record.verified = false;

    console.log(`[OTP Generate] OTP for ${cleanPhone}: ${otp} (Hashed: ${hashed})`);

    try {
        // Send OTP using Termii SMS Service
        const message = `Your SharpTrack verification code is: ${otp}. It expires in 5 minutes.`;
        await sendSMS(cleanPhone, message);
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error(`[OTP Send Error] Failed to send OTP to ${cleanPhone}:`, error.message);
        res.status(500).json({ error: `Failed to send OTP: ${error.message}` });
    }
});

// VERIFY OTP (with attempts limit and one-time consumption protection)
router.post('/verify', async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone number and OTP code are required' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const record = otpStore[cleanPhone];
    const now = Date.now();

    if (!record || !record.hashedOtp) {
        return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
    }

    if (now > record.expires) {
        delete otpStore[cleanPhone].hashedOtp;
        delete otpStore[cleanPhone].expires;
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    // Limit to 3 verification attempts
    if (record.attempts >= 3) {
        delete otpStore[cleanPhone].hashedOtp;
        delete otpStore[cleanPhone].expires;
        delete otpStore[cleanPhone].attempts;
        return res.status(400).json({ error: 'Too many failed verification attempts. Request a new OTP.' });
    }

    const inputHash = hashOtp(otp);

    if (record.hashedOtp !== inputHash) {
        record.attempts += 1;
        if (record.attempts >= 3) {
            delete otpStore[cleanPhone].hashedOtp;
            delete otpStore[cleanPhone].expires;
            delete otpStore[cleanPhone].attempts;
            return res.status(400).json({ error: 'Too many failed verification attempts. Request a new OTP.' });
        }
        return res.status(400).json({ error: `Invalid OTP. Attempts remaining: ${3 - record.attempts}` });
    }

    // OTP Verified! Clear code fields to prevent reuse, but mark verified
    record.verified = true;
    record.verificationExpires = now + 10 * 60 * 1000; // Verified status valid for 10 minutes
    delete record.hashedOtp;
    delete record.expires;
    delete record.attempts;

    res.json({ message: 'Phone verified successfully', verified: true });
});

// CHECK IF PHONE IS VERIFIED
router.get('/status/:phone', (req, res) => {
    const { phone } = req.params;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const record = otpStore[cleanPhone];
    
    if (!record || !record.verified || Date.now() > record.verificationExpires) {
        return res.json({ verified: false });
    }
    
    res.json({ verified: true });
});

// SEND EMAIL OTP
router.post('/send-email', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const now = Date.now();
    let record = otpStore[cleanEmail];

    if (record) {
        if (record.requestWindowStart && now - record.requestWindowStart > 10 * 60 * 1000) {
            record.requestCount = 0;
            record.requestWindowStart = now;
        }

        if (record.requestCount >= 3) {
            const waitMinutes = Math.ceil((10 * 60 * 1000 - (now - record.requestWindowStart)) / 60000);
            return res.status(429).json({ 
                error: `Too many OTP requests. Please wait ${waitMinutes} minute(s) before requesting again.` 
            });
        }
    } else {
        record = {
            requestCount: 0,
            requestWindowStart: now,
            attempts: 0,
            verified: false
        };
        otpStore[cleanEmail] = record;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = hashOtp(otp);

    record.hashedOtp = hashed;
    record.expires = now + 10 * 60 * 1000; // 10 minutes expiration for email
    record.attempts = 0;
    record.requestCount += 1;
    record.verified = false;

    console.log(`[OTP Generate] Email OTP for ${cleanEmail}: ${otp}`);

    try {
        await sendEmailOTP(cleanEmail, otp);
        res.json({ message: 'OTP sent to email successfully' });
    } catch (error) {
        console.error(`[OTP Send Error] Failed to send OTP to ${cleanEmail}:`, error.message);
        res.status(500).json({ error: `Failed to send OTP to email.` });
    }
});

// VERIFY EMAIL OTP
router.post('/verify-email', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const record = otpStore[cleanEmail];
    const now = Date.now();

    if (!record || !record.hashedOtp) {
        return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
    }

    if (now > record.expires) {
        delete otpStore[cleanEmail].hashedOtp;
        delete otpStore[cleanEmail].expires;
        return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    if (record.attempts >= 3) {
        delete otpStore[cleanEmail].hashedOtp;
        delete otpStore[cleanEmail].expires;
        delete otpStore[cleanEmail].attempts;
        return res.status(400).json({ error: 'Too many failed verification attempts. Request a new OTP.' });
    }

    const inputHash = hashOtp(otp);

    if (record.hashedOtp !== inputHash) {
        record.attempts += 1;
        if (record.attempts >= 3) {
            delete otpStore[cleanEmail].hashedOtp;
            delete otpStore[cleanEmail].expires;
            delete otpStore[cleanEmail].attempts;
            return res.status(400).json({ error: 'Too many failed verification attempts. Request a new OTP.' });
        }
        return res.status(400).json({ error: `Invalid OTP. Attempts remaining: ${3 - record.attempts}` });
    }

    record.verified = true;
    record.verificationExpires = now + 30 * 60 * 1000; // Verified status valid for 30 mins
    delete record.hashedOtp;
    delete record.expires;
    delete record.attempts;

    res.json({ message: 'Email verified successfully', verified: true });
});

module.exports = router;