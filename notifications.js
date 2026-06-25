const express = require('express');
const router = express.Router();
const prisma = require('./lib/prisma');
const authMiddleware = require('./middleware/auth');
const { isValidId } = require('./lib/validation');

// Centralized ID parameter validator middleware
router.param('id', (req, res, next, id) => {
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
});

// GET ALL NOTIFICATIONS
router.get('/', authMiddleware, async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const unreadCount = await prisma.notification.count({
            where: { userId: req.userId, read: false }
        });

        res.json({ notifications, unreadCount });
    } catch (err) {
        console.error('Get notifications error:', err.message);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
});

// GET UNREAD COUNT ONLY
router.get('/count', authMiddleware, async (req, res) => {
    try {
        const unreadCount = await prisma.notification.count({
            where: { userId: req.userId, read: false }
        });
        res.json({ unreadCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get notification count' });
    }
});

// MARK ONE AS READ
router.put('/:id/read', authMiddleware, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid notification ID format' });
    }

    try {
        const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await prisma.notification.update({
            where: { id: req.params.id },
            data: { read: true }
        });
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error('Update notification error:', err.message);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// MARK ALL AS READ
router.put('/read-all', authMiddleware, async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.userId, read: false },
            data: { read: true }
        });
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// DELETE NOTIFICATION
router.delete('/:id', authMiddleware, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid notification ID format' });
    }

    try {
        const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        await prisma.notification.delete({
            where: { id: req.params.id }
        });
        res.json({ message: 'Notification deleted' });
    } catch (err) {
        console.error('Delete notification error:', err.message);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

module.exports = router;
