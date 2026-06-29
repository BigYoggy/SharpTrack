const redisClient = require('../services/redis');

/**
 * Cache middleware for Express routes.
 * Caches the response body for a default of 1 hour (3600 seconds).
 * @param {string} prefix - The prefix for the cache key (e.g., 'products')
 * @param {number} ttl - Time to live in seconds (default 3600)
 */
const cache = (prefix, ttl = 3600) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        try {
            // Generate a cache key using the prefix, user ID (if available), and the URL
            const userId = req.user && req.user.userId ? req.user.userId : 'anonymous';
            const key = `${prefix}:${userId}:${req.originalUrl}`;

            const cachedData = await redisClient.get(key);

            if (cachedData) {
                // If data exists in cache, parse and return it
                return res.json(JSON.parse(cachedData));
            }

            // If not in cache, capture the original res.json
            const originalJson = res.json.bind(res);
            res.json = (body) => {
                // Cache the response body before sending
                redisClient.setEx(key, ttl, JSON.stringify(body))
                    .catch(err => console.error('Redis Set Error:', err));
                
                // Call the original res.json to send the response
                originalJson(body);
            };

            next();
        } catch (error) {
            console.error('Redis Cache Error:', error);
            next();
        }
    };
};

/**
 * Helper to clear cache matching a pattern
 * @param {string} pattern - Redis key pattern to match (e.g., 'products:*')
 */
const clearCache = async (pattern) => {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(keys);
            console.log(`Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
        }
    } catch (error) {
        console.error('Redis Clear Cache Error:', error);
    }
};

module.exports = { cache, clearCache };
