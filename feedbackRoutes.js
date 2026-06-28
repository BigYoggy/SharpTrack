const express = require('express');
const router = express.Router();
const { sendFeedbackEmail } = require('./services/email');

// POST /api/feedback
router.post('/', async (req, res) => {
    try {
        const { type, message, userId, userName, timestamp } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const feedbackItem = {
            type: type || 'other',
            message: message,
            userId: userId || 'anonymous',
            userName: userName || 'Anonymous',
            timestamp: timestamp || new Date().toISOString()
        };

        // Send the feedback email
        await sendFeedbackEmail(feedbackItem);

        res.status(200).json({ success: true, message: 'Feedback sent successfully' });
    } catch (err) {
        console.error('[Feedback Route Error]:', err);
        res.status(500).json({ error: 'Failed to send feedback' });
    }
});

module.exports = router;
