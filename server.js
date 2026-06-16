const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Security & parsing middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

const jwt = require('jsonwebtoken');

// Protect admin static pages
app.use('/admin', (req, res, next) => {
    // Allow login, style assets and logo image requests to bypass
    if (req.path === '/login' || req.path === '/login.html' || req.path.includes('style.css') || req.path.includes('logo') || req.path.includes('logo2.png') || req.path.includes('logo3.png')) {
        return next();
    }

    const cookies = {};
    if (req.headers.cookie) {
        req.headers.cookie.split(';').forEach(c => {
            const parts = c.split('=');
            cookies[parts[0].trim()] = decodeURIComponent((parts[1] || '').trim());
        });
    }
    const token = cookies.admin_token;

    if (!token) {
        return res.redirect('/admin/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'SUPER_ADMIN') {
            res.clearCookie('admin_token');
            return res.redirect('/admin/login');
        }
        next();
    } catch (err) {
        res.clearCookie('admin_token');
        return res.redirect('/admin/login');
    }
});

// Serve admin login HTML on /admin/login
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// API Routes
const adminRoutes = require('./adminRoutes');
app.use('/api/admin', adminRoutes);

const authRoutes = require('./auth');
app.use('/api/auth', authRoutes);

const productRoutes = require('./products');
app.use('/api/products', productRoutes);

const salesRoutes = require('./sales');
app.use('/api/sales', salesRoutes);

const otpRoutes = require('./otp');
app.use('/api/otp', otpRoutes);

const notificationRoutes = require('./notifications');
app.use('/api/notifications', notificationRoutes);

const activityRoutes = require('./activity');
app.use('/api/activity', activityRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'SharpTrack API is running', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SharpTrack server running on port ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api/health`);
    console.log(`App: http://localhost:${PORT}`);
});