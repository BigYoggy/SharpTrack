const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./lib/prisma');
const adminAuth = require('./middleware/adminAuth');
const { isValidId } = require('./lib/validation');

// Centralized ID parameter validator middleware
router.param('id', (req, res, next, id) => {
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
});

// In-memory rate limiting & temporary lockout store
const loginAttempts = {};

const RATE_LIMIT_MAX = 5;
const LOCKOUT_MINUTES = 15;

function checkRateLimit(email) {
    const record = loginAttempts[email];
    if (record) {
        if (record.lockUntil && record.lockUntil > new Date()) {
            const remaining = Math.ceil((record.lockUntil - new Date()) / 1000 / 60);
            return { locked: true, remaining };
        }
        // If lockout expired, reset
        if (record.lockUntil && record.lockUntil <= new Date()) {
            delete loginAttempts[email];
        }
    }
    return { locked: false };
}

function recordFailedAttempt(email) {
    if (!loginAttempts[email]) {
        loginAttempts[email] = { count: 1, lockUntil: null };
    } else {
        loginAttempts[email].count += 1;
        if (loginAttempts[email].count >= RATE_LIMIT_MAX) {
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES);
            loginAttempts[email].lockUntil = lockUntil;
        }
    }
}

function resetFailedAttempts(email) {
    delete loginAttempts[email];
}

// 1. ADMIN LOGIN
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check rate limiting / lockout
    const rateLimit = checkRateLimit(cleanEmail);
    if (rateLimit.locked) {
        return res.status(429).json({ 
            error: `Too many failed login attempts. This account is temporarily locked. Please try again in ${rateLimit.remaining} minute(s).` 
        });
    }

    try {
        const admin = await prisma.admin.findUnique({ where: { email: cleanEmail } });
        if (!admin) {
            recordFailedAttempt(cleanEmail);
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        if (admin.status === 'Disabled') {
            return res.status(403).json({ error: 'This administrator account has been disabled. Please contact support.' });
        }

        const isMatch = await bcrypt.compare(password, admin.passwordHash);
        if (!isMatch) {
            recordFailedAttempt(cleanEmail);
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Reset rate limiter on success
        resetFailedAttempts(cleanEmail);

        // Generate JWT
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Store JWT in HttpOnly secure cookie
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            path: '/'
        });

        res.json({
            message: 'Login successful',
            token: token,
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. ADMIN LOGOUT
router.post('/logout', (req, res) => {
    res.clearCookie('admin_token', { path: '/' });
    res.json({ message: 'Logout successful' });
});

// 3. GET CURRENT ADMIN
router.get('/me', adminAuth, async (req, res) => {
    try {
        const admin = await prisma.admin.findUnique({ where: { id: req.adminId } });
        res.json({
            admin: {
                id: admin.id,
                name: admin.name || '',
                email: admin.email,
                role: admin.role,
                status: admin.status,
                profilePhoto: admin.profilePhoto || ''
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch admin profile' });
    }
});

// 4. GET DASHBOARD STATS
router.get('/stats', adminAuth, async (req, res) => {
    try {
        // Enforce Support access (read-only analytics is supported)
        if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(req.adminRole)) {
            return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
        }

        const totalUsers = await prisma.user.count();
        const activeUsers = await prisma.user.count({ where: { status: 'Active' } });
        const suspendedUsers = await prisma.user.count({ where: { status: 'Suspended' } });
        
        const totalProducts = await prisma.product.count();
        const totalSales = await prisma.sale.count();

        // Revenue calculations
        let timezoneOffset = -60; // Default to Nigeria (UTC+1)
        if (req.query.timezoneOffset !== undefined) {
            timezoneOffset = parseInt(req.query.timezoneOffset);
        }

        const now = new Date();
        const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
        
        // Today Start
        const localTodayStart = new Date(localNow);
        localTodayStart.setUTCHours(0, 0, 0, 0);
        const todayStart = new Date(localTodayStart.getTime() + (timezoneOffset * 60 * 1000));

        // Month Start
        const localMonthStart = new Date(localNow);
        localMonthStart.setUTCDate(1);
        localMonthStart.setUTCHours(0, 0, 0, 0);
        const monthStart = new Date(localMonthStart.getTime() + (timezoneOffset * 60 * 1000));

        const todaySales = await prisma.sale.findMany({
            where: { soldAt: { gte: todayStart } },
            select: { totalAmount: true }
        });
        const revenueToday = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);

        const monthSales = await prisma.sale.findMany({
            where: { soldAt: { gte: monthStart } },
            select: { totalAmount: true }
        });
        const revenueMonth = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);

        // AI Ingestion metrics
        const totalIngestion = await prisma.ingestionItem.count();
        const pendingIngestion = await prisma.ingestionItem.count({ where: { status: 'review' } });
        const failedIngestion = await prisma.ingestionItem.count({ where: { status: 'failed' } });

        res.json({
            totalUsers,
            activeUsers,
            suspendedUsers,
            totalProducts,
            totalSales,
            revenueToday,
            revenueMonth,
            totalIngestion,
            pendingIngestion,
            failedIngestion
        });
    } catch (err) {
        console.error('Failed to aggregate admin stats:', err);
        res.status(500).json({ error: 'Failed to load statistics dashboard' });
    }
});

// 5. GET SALES TREND CHART DATA
router.get('/charts/sales-trend', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const range = parseInt(req.query.range) || 30;
    let timezoneOffset = -60; // Default to Nigeria (UTC+1)
    if (req.query.timezoneOffset !== undefined) {
        timezoneOffset = parseInt(req.query.timezoneOffset);
    }
    
    const now = new Date();
    const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    localNow.setUTCHours(0, 0, 0, 0);
    
    // Shift range start back to UTC
    const startDate = new Date(localNow.getTime() - ((range - 1) * 24 * 60 * 60 * 1000) + (timezoneOffset * 60 * 1000));

    try {
        const sales = await prisma.sale.findMany({
            where: { soldAt: { gte: startDate } },
            orderBy: { soldAt: 'asc' }
        });

        // Initialize empty timeline
        const daysMap = [];
        for (let i = range - 1; i >= 0; i--) {
            const d = new Date(localNow.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateStr = d.toISOString().split('T')[0];
            const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            daysMap.push({
                dateString: dateStr,
                formattedDate: formatted,
                amount: 0,
                count: 0
            });
        }

        // Helper to convert date to local date string
        const getLocalDateString = (date, offset) => {
            const localTime = new Date(date.getTime() - (offset * 60 * 1000));
            return localTime.toISOString().split('T')[0];
        };

        sales.forEach(sale => {
            const saleDate = getLocalDateString(sale.soldAt, timezoneOffset);
            const target = daysMap.find(day => day.dateString === saleDate);
            if (target) {
                target.amount += sale.totalAmount;
                target.count += 1;
            }
        });

        res.json({ trend: daysMap });
    } catch (err) {
        console.error('Sales trend fetch failure:', err);
        res.status(500).json({ error: 'Failed to load trend analytics chart' });
    }
});

// 6. USERS MANAGEMENT
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                storeName: true,
                status: true,
                createdAt: true
            }
        });
        res.json({ users });
    } catch (err) {
        console.error('Users load failure:', err);
        res.status(500).json({ error: 'Failed to load user accounts' });
    }
});

router.post('/users/:id/suspend', adminAuth, async (req, res) => {
    // Only SUPER_ADMIN, ADMIN, or MODERATOR can perform user status actions
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const nextStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
        const updated = await prisma.user.update({
            where: { id: req.params.id },
            data: { status: nextStatus },
            select: { id: true, name: true, status: true }
        });

        // Audit Log entry
        await prisma.activityLog.create({
            data: {
                userId: req.params.id,
                action: 'User status change',
                details: `Admin set merchant ${updated.name} status to ${updated.status}.`
            }
        });

        res.json({ message: 'User status updated successfully', user: updated });
    } catch (err) {
        console.error('User suspend error:', err);
        res.status(500).json({ error: 'Failed to toggle user suspension' });
    }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
    // Only SUPER_ADMIN, ADMIN, or MODERATOR can delete users
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Wipe user cascade manually
        await prisma.activityLog.deleteMany({ where: { userId: req.params.id } });
        await prisma.notification.deleteMany({ where: { userId: req.params.id } });
        await prisma.sale.deleteMany({ where: { userId: req.params.id } });
        await prisma.product.deleteMany({ where: { userId: req.params.id } });
        await prisma.user.delete({ where: { id: req.params.id } });

        res.json({ message: 'User account deleted successfully' });
    } catch (err) {
        console.error('User delete error:', err);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// 7. PRODUCT CATALOG
router.get('/products', adminAuth, async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                sellingPrice: true,
                costPrice: true,
                quantity: true,
                reorderLevel: true,
                unit: true,
                userId: true,
                barcode: true,
                brand: true,
                categoryId: true,
                specifications: true,
                weight: true,
                manufacturer: true,
                description: true,
                createdAt: true
            }
        });
        res.json({ products });
    } catch (err) {
        console.error('Products load failure:', err);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

router.post('/products', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied. Only Admins can manually register products.' });
    }

    const { name, barcode, brand, category, specifications, image } = req.body;

    if (!name || !barcode) {
        return res.status(400).json({ error: 'Product name and barcode are required' });
    }

    try {
        let systemUser = await prisma.user.findFirst({ where: { phone: '0000000000' } });
        if (!systemUser) {
            systemUser = await prisma.user.create({
                data: {
                    name: 'System Merchant',
                    phone: '0000000000',
                    password: 'ADMIN_NOT_PASSWORD_SIGN_IN',
                    storeName: 'System Catalog',
                    onboardingCompleted: true
                }
            });
        }

        const product = await prisma.product.create({
            data: {
                name: name.trim(),
                barcode: barcode.trim(),
                brand: brand ? brand.trim() : '',
                category: category || 'General',
                specifications: specifications ? specifications.trim() : '',
                image: image ? image.trim() : '',
                sellingPrice: 0.0,
                quantity: 0,
                userId: systemUser.id
            }
        });

        res.status(201).json({ message: 'Product created successfully', product });
    } catch (err) {
        console.error('Create product error:', err);
        res.status(500).json({ error: 'Failed to save product entry' });
    }
});

router.put('/products/:id', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { name, barcode, brand, category, specifications, image } = req.body;

    try {
        const updated = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                name: name ? name.trim() : undefined,
                barcode: barcode ? barcode.trim() : undefined,
                brand: brand !== undefined ? brand.trim() : undefined,
                category: category !== undefined ? category : undefined,
                specifications: specifications !== undefined ? specifications.trim() : undefined,
                image: image !== undefined ? image.trim() : undefined
            }
        });
        res.json({ message: 'Product modified successfully', product: updated });
    } catch (err) {
        console.error('Modify product error:', err);
        res.status(500).json({ error: 'Failed to modify product entry' });
    }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        await prisma.sale.deleteMany({ where: { productId: req.params.id } });
        await prisma.product.delete({ where: { id: req.params.id } });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ error: 'Failed to delete product entry' });
    }
});

// 8. BUSINESS MANAGEMENT
router.get('/businesses', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const merchants = await prisma.user.findMany({
            where: { storeName: { not: null, not: 'System Catalog' } },
            include: {
                products: {
                    select: {
                        sellingPrice: true,
                        quantity: true
                    }
                },
                sales: {
                    select: {
                        totalAmount: true
                    }
                }
            }
        });

        const list = merchants.map(m => {
            const inventoryItems = m.products.reduce((acc, p) => acc + p.quantity, 0);
            const inventoryValue = m.products.reduce((sum, p) => sum + (p.sellingPrice * p.quantity), 0);
            const revenue = m.sales.reduce((sum, s) => sum + s.totalAmount, 0);

            return {
                id: m.id,
                name: m.storeName,
                owner: m.name,
                location: m.email ? 'Lagos, Nigeria' : 'Nigeria',
                inventoryItems,
                inventoryValue,
                revenue,
                status: m.status
            };
        });

        res.json({ businesses: list });
    } catch (err) {
        console.error('Businesses query error:', err);
        res.status(500).json({ error: 'Failed to retrieve businesses' });
    }
});

// 9. INGESTION PIPELINE
router.get('/ingestion', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const items = await prisma.ingestionItem.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const queue = {
            review: items.filter(x => x.status === 'review'),
            imported: items.filter(x => x.status === 'imported'),
            duplicate: items.filter(x => x.status === 'duplicate'),
            failed: items.filter(x => x.status === 'failed')
        };
        res.json({ ingestion: queue });
    } catch (err) {
        console.error('Ingestion queue failure:', err);
        res.status(500).json({ error: 'Failed to load ingestion center queue' });
    }
});

router.post('/ingestion/:id/approve', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const item = await prisma.ingestionItem.findUnique({ where: { id: req.params.id } });
        if (!item) return res.status(404).json({ error: 'Ingestion item not found' });

        let systemUser = await prisma.user.findFirst({ where: { phone: '0000000000' } });
        if (!systemUser) {
            systemUser = await prisma.user.create({
                data: {
                    name: 'System Merchant',
                    phone: '0000000000',
                    password: 'ADMIN_NOT_PASSWORD_SIGN_IN',
                    storeName: 'System Catalog',
                    onboardingCompleted: true
                }
            });
        }

        await prisma.product.create({
            data: {
                name: item.name,
                barcode: item.barcode || '',
                brand: item.brand,
                category: item.category,
                specifications: item.spec || '',
                image: '',
                sellingPrice: 0.0,
                quantity: 0,
                userId: systemUser.id
            }
        });

        const updated = await prisma.ingestionItem.update({
            where: { id: req.params.id },
            data: { status: 'imported' }
        });

        res.json({ message: 'Item approved and catalogued', item: updated });
    } catch (err) {
        console.error('Ingestion approve error:', err);
        res.status(500).json({ error: 'Failed to approve ingestion item' });
    }
});

router.post('/ingestion/:id/dismiss', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const item = await prisma.ingestionItem.findUnique({ where: { id: req.params.id } });
        if (!item) return res.status(404).json({ error: 'Ingestion item not found' });

        await prisma.ingestionItem.delete({ where: { id: req.params.id } });
        res.json({ message: 'Ingestion item dismissed successfully' });
    } catch (err) {
        console.error('Ingestion dismiss error:', err);
        res.status(500).json({ error: 'Failed to dismiss ingestion item' });
    }
});

router.post('/ingestion/:id/retry', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { barcode } = req.body;

    try {
        const item = await prisma.ingestionItem.findUnique({ where: { id: req.params.id } });
        if (!item) return res.status(404).json({ error: 'Ingestion item not found' });

        const updatedBarcode = barcode || item.barcode;
        if (!updatedBarcode) {
            return res.status(400).json({ error: 'Valid EAN barcode is required for catalog injection' });
        }

        let systemUser = await prisma.user.findFirst({ where: { phone: '0000000000' } });
        if (!systemUser) {
            systemUser = await prisma.user.create({
                data: {
                    name: 'System Merchant',
                    phone: '0000000000',
                    password: 'ADMIN_NOT_PASSWORD_SIGN_IN',
                    storeName: 'System Catalog',
                    onboardingCompleted: true
                }
            });
        }

        await prisma.product.create({
            data: {
                name: item.name,
                barcode: updatedBarcode,
                brand: item.brand,
                category: item.category,
                specifications: item.spec || 'Standard packaging',
                image: '',
                sellingPrice: 0.0,
                quantity: 0,
                userId: systemUser.id
            }
        });

        await prisma.ingestionItem.delete({ where: { id: req.params.id } });

        res.json({ message: 'Sync retried successfully and item catalogued' });
    } catch (err) {
        console.error('Ingestion retry error:', err);
        res.status(500).json({ error: 'Failed to retry sync cataloging' });
    }
});

// 10. SYSTEM CATEGORIES MANAGER
router.get('/categories', adminAuth, async (req, res) => {
    try {
        const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
        res.json({ categories: cats.map(x => x.name) });
    } catch (err) {
        console.error('Categories load failure:', err);
        res.status(500).json({ error: 'Failed to retrieve system categories' });
    }
});

router.post('/categories', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });

    try {
        const existing = await prisma.category.findUnique({ where: { name: name.trim() } });
        if (existing) return res.status(400).json({ error: 'Category already exists' });

        const cat = await prisma.category.create({
            data: { name: name.trim() }
        });
        res.status(201).json({ message: 'Category added successfully', category: cat.name });
    } catch (err) {
        console.error('Category create failure:', err);
        res.status(500).json({ error: 'Failed to create category marker' });
    }
});

router.delete('/categories/:name', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        await prisma.category.delete({ where: { name: req.params.name } });
        res.json({ message: 'Category removed successfully' });
    } catch (err) {
        console.error('Category delete error:', err);
        res.status(500).json({ error: 'Failed to remove category marker' });
    }
});

// 11. OPERATIONS FEED (AUDIT LOGS)
router.get('/activity', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const logs = await prisma.activityLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
                user: {
                    select: {
                        name: true,
                        storeName: true
                    }
                }
            }
        });

        const mapped = logs.map(log => {
            let badgeType = 'badge-accent';
            let icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

            if (log.action.toLowerCase().includes('suspend') || log.action.toLowerCase().includes('delete') || log.action.toLowerCase().includes('failure')) {
                badgeType = 'badge-danger';
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>';
            } else if (log.action.toLowerCase().includes('approve') || log.action.toLowerCase().includes('create') || log.action.toLowerCase().includes('success')) {
                badgeType = 'badge-success';
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            } else if (log.action.toLowerCase().includes('update') || log.action.toLowerCase().includes('change')) {
                badgeType = 'badge-warning';
                icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
            }

            const minutesAgo = Math.floor((new Date() - log.createdAt) / 1000 / 60);
            let timeStr = 'Just now';
            if (minutesAgo >= 60 * 24) {
                timeStr = `${Math.floor(minutesAgo / 60 / 24)} day(s) ago`;
            } else if (minutesAgo >= 60) {
                timeStr = `${Math.floor(minutesAgo / 60)} hour(s) ago`;
            } else if (minutesAgo > 0) {
                timeStr = `${minutesAgo} min(s) ago`;
            }

            return {
                id: log.id,
                action: log.action,
                details: log.details || `${log.action} recorded`,
                operator: log.user ? log.user.name : 'System Agent',
                time: timeStr,
                badgeType,
                icon
            };
        });

        res.json({ activityLogs: mapped });
    } catch (err) {
        console.error('Activity logs fetch failure:', err);
        res.status(500).json({ error: 'Failed to retrieve system operations audit feed' });
    }
});

// 12. NOTIFICATIONS ALERTS
router.get('/notifications', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    try {
        const notifications = await prisma.notification.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                user: {
                    select: { name: true }
                }
            }
        });

        const mapped = notifications.map(n => {
            const minutesAgo = Math.floor((new Date() - n.createdAt) / 1000 / 60);
            let timeStr = 'Just now';
            if (minutesAgo >= 60 * 24) {
                timeStr = `${Math.floor(minutesAgo / 60 / 24)} day(s) ago`;
            } else if (minutesAgo >= 60) {
                timeStr = `${Math.floor(minutesAgo / 60)} hour(s) ago`;
            } else if (minutesAgo > 0) {
                timeStr = `${minutesAgo} min(s) ago`;
            }

            return {
                id: n.id,
                text: `${n.user ? n.user.name + ': ' : ''}${n.title} - ${n.message}`,
                time: timeStr,
                read: n.read
            };
        });

        res.json({ notifications: mapped });
    } catch (err) {
        console.error('Notifications query error:', err);
        res.status(500).json({ error: 'Failed to fetch administrator notifications' });
    }
});

router.post('/notifications/mark-read', adminAuth, async (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPPORT'].includes(req.adminRole)) {
        return res.status(403).json({ error: 'Access denied.' });
    }

    const { id } = req.body;
    try {
        if (id) {
            await prisma.notification.update({
                where: { id },
                data: { read: true }
            });
        } else {
            await prisma.notification.updateMany({
                where: { read: false },
                data: { read: true }
            });
        }
        res.json({ message: 'Notifications marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to mark notifications' });
    }
});

// 13. ADMIN PROFILE PERSISTENCE
router.put('/profile', adminAuth, async (req, res) => {
    const { name, email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
    }

    try {
        const existing = await prisma.admin.findFirst({
            where: {
                email: email.trim().toLowerCase(),
                NOT: { id: req.adminId }
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'This email is already in use by another admin.' });
        }

        const updated = await prisma.admin.update({
            where: { id: req.adminId },
            data: {
                name: name ? name.trim() : null,
                email: email.trim().toLowerCase()
            }
        });

        res.json({
            message: 'Profile updated successfully',
            admin: {
                id: updated.id,
                name: updated.name || '',
                email: updated.email,
                role: updated.role,
                status: updated.status,
                profilePhoto: updated.profilePhoto || ''
            }
        });
    } catch (err) {
        console.error('Admin profile update error:', err);
        res.status(500).json({ error: 'Failed to save profile changes' });
    }
});

// 14. ADMIN ROLE MANAGEMENT (SUPER_ADMIN ONLY)
router.get('/admins', adminAuth, async (req, res) => {
    if (req.adminRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    try {
        const admins = await prisma.admin.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                createdAt: true
            }
        });
        res.json({ admins });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load administrator accounts' });
    }
});

router.post('/admins', adminAuth, async (req, res) => {
    if (req.adminRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { name, email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    try {
        const existing = await prisma.admin.findUnique({
            where: { email: email.trim().toLowerCase() }
        });

        if (existing) {
            return res.status(400).json({ error: 'An administrator with this email already exists' });
        }

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        const admin = await prisma.admin.create({
            data: {
                name: name ? name.trim() : '',
                email: email.trim().toLowerCase(),
                passwordHash,
                role,
                status: 'Active'
            }
        });

        res.status(201).json({
            message: 'Administrator account created successfully',
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                status: admin.status
            }
        });
    } catch (err) {
        console.error('Create admin error:', err);
        res.status(500).json({ error: 'Failed to create administrator account' });
    }
});

router.put('/admins/:id', adminAuth, async (req, res) => {
    if (req.adminRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    const { name, email, role } = req.body;

    try {
        const admin = await prisma.admin.findUnique({ where: { id: req.params.id } });
        if (!admin) return res.status(404).json({ error: 'Admin account not found' });

        const updated = await prisma.admin.update({
            where: { id: req.params.id },
            data: {
                name: name !== undefined ? name.trim() : undefined,
                email: email !== undefined ? email.trim().toLowerCase() : undefined,
                role: role !== undefined ? role : undefined
            }
        });

        res.json({
            message: 'Administrator account updated successfully',
            admin: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                role: updated.role,
                status: updated.status
            }
        });
    } catch (err) {
        console.error('Edit admin error:', err);
        res.status(500).json({ error: 'Failed to update administrator account' });
    }
});

router.post('/admins/:id/toggle-status', adminAuth, async (req, res) => {
    if (req.adminRole !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
    }

    try {
        const admin = await prisma.admin.findUnique({ where: { id: req.params.id } });
        if (!admin) return res.status(404).json({ error: 'Admin account not found' });

        if (admin.id === req.adminId) {
            return res.status(400).json({ error: 'You cannot disable your own administrator account.' });
        }

        const nextStatus = admin.status === 'Active' ? 'Disabled' : 'Active';

        const updated = await prisma.admin.update({
            where: { id: req.params.id },
            data: { status: nextStatus }
        });

        res.json({
            message: `Administrator account status set to ${nextStatus}`,
            admin: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                role: updated.role,
                status: updated.status
            }
        });
    } catch (err) {
        console.error('Toggle admin status error:', err);
        res.status(500).json({ error: 'Failed to toggle administrator status' });
    }
});

module.exports = router;
