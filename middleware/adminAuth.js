const jwt = require('jsonwebtoken');

const parseCookies = (cookieHeader) => {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        let parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
    return list;
};

const adminAuth = async (req, res, next) => {
    // Determine if the request expects an API response
    const isApi = req.originalUrl.startsWith('/api/');

    // Check Authorization header first (frontend sends token from localStorage)
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else {
        // Fallback to cookie
        const cookies = parseCookies(req.headers.cookie);
        token = cookies.admin_token;
    }

    if (!token) {
        if (isApi) {
            return res.status(401).json({ error: 'Authentication required. Please log in.' });
        } else {
            return res.redirect('/admin/login');
        }
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Connect to database to check if admin was disabled
        const prisma = require('../lib/prisma');
        const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });

        if (!admin || admin.status === 'Disabled' || !['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR', 'DEV'].includes(admin.role)) {
            res.clearCookie('admin_token');
            if (isApi) {
                return res.status(403).json({ error: 'Access denied. Account disabled or insufficient privileges.' });
            } else {
                return res.redirect('/admin/login');
            }
        }

        req.adminId = admin.id;
        req.adminEmail = admin.email;
        req.adminRole = admin.role;
        next();
    } catch (err) {
        if (isApi) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Session expired. Please log in again.' });
            }
            return res.status(401).json({ error: 'Invalid token. Please log in again.' });
        } else {
            res.clearCookie('admin_token');
            return res.redirect('/admin/login');
        }
    }
};

module.exports = adminAuth;
