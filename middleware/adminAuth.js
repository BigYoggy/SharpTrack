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

const adminAuth = (req, res, next) => {
    // Determine if the request expects an API response
    const isApi = req.originalUrl.startsWith('/api/');

    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.admin_token;

    if (!token) {
        if (isApi) {
            return res.status(401).json({ error: 'Authentication required. Please log in.' });
        } else {
            return res.redirect('/admin/login');
        }
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'SUPER_ADMIN') {
            if (isApi) {
                return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
            } else {
                return res.redirect('/admin/login');
            }
        }
        req.adminId = decoded.id;
        req.adminEmail = decoded.email;
        req.adminRole = decoded.role;
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
