const cron = require('node-cron');
const axios = require('axios');

function initCron() {
    console.log('[Cron] Initializing scheduled tasks...');

    // Ping the backend every 14 minutes to prevent Render from spinning down
    // (Render free tier sleeps after 15 minutes of inactivity)
    cron.schedule('*/14 * * * *', async () => {
        try {
            // Use the production URL if available, otherwise fallback to localhost
            const url = process.env.RENDER_EXTERNAL_URL 
                ? `${process.env.RENDER_EXTERNAL_URL}/health` 
                : (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/health` : `http://localhost:${process.env.PORT || 3000}/health`);
            
            await axios.get(url);
            console.log(`[Cron] Successfully pinged ${url} to keep server awake. (${new Date().toISOString()})`);
        } catch (error) {
            console.error(`[Cron] Ping failed:`, error.message);
        }
    });
}

module.exports = { initCron };
