const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Trust proxy settings (required for accurate client IP detection behind Netlify/Render proxies)
app.set('trust proxy', 1);

// Security & parsing middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow all origins dynamically
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

const jwt = require('jsonwebtoken');

// Admin static pages: Authentication is handled client-side by script.js
// which calls /api/admin/me on load and redirects to login if unauthorized.
// All API endpoints are protected by the adminAuth middleware.

// Serve admin login HTML on /admin/login
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Admin login rate limiting (max 5 requests per 15 minutes per IP)
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, 
    message: { error: 'Too many login attempts from this IP. Please try again in 15 minutes.' },
    standardHeaders: true, 
    legacyHeaders: false, 
});

// Apply rate limiter to admin login endpoint
app.use('/api/admin/login', adminLoginLimiter);

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

const aiRoutes = require('./aiRoutes');
app.use('/api/ai', aiRoutes);
app.get('/test-ai', aiRoutes.testAi);
app.post('/api/scan-product', aiRoutes.scanProduct);

const chatbotRoutes = require('./chatbot');
app.use('/api/chat', chatbotRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'SharpTrack API is running', timestamp: new Date().toISOString() });
});

// Lightweight production-safe health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
    });
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