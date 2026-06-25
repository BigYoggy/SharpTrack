const prisma = require('./prisma');

/**
 * Normalizes notification type to match the Prisma schema enum (INFO, WARNING, LOW_STOCK, SYSTEM)
 * @param {string} type 
 * @returns {string}
 */
function normalizeNotificationType(type) {
    if (!type) return 'INFO';
    const upper = type.toUpperCase();
    if (upper === 'SUCCESS' || upper === 'INFO') return 'INFO';
    if (upper === 'WARNING') return 'WARNING';
    if (upper === 'LOW_STOCK') return 'LOW_STOCK';
    if (upper === 'ERROR' || upper === 'SYSTEM') return 'SYSTEM';
    return 'INFO';
}

/**
 * Log user activity in the database
 * @param {string} userId 
 * @param {string} action 
 * @param {string} details 
 * @returns {Promise<void>}
 */
async function logActivity(userId, action, details) {
    try {
        await prisma.activityLog.create({
            data: {
                userId,
                action: action.trim(),
                details: details ? details.trim() : null
            }
        });
    } catch (err) {
        console.error('[ActivityLog Error] Failed to log activity:', err.message);
    }
}

/**
 * Create a notification for a user
 * @param {string} userId 
 * @param {string} type 
 * @param {string} title 
 * @param {string} message 
 * @returns {Promise<void>}
 */
async function createNotification(userId, type, title, message) {
    try {
        const normalizedType = normalizeNotificationType(type);
        await prisma.notification.create({
            data: {
                userId,
                type: normalizedType,
                title: title.trim(),
                message: message.trim()
            }
        });
    } catch (err) {
        console.error('[Notification Error] Failed to create notification:', err.message);
    }
}

module.exports = {
    logActivity,
    createNotification
};
