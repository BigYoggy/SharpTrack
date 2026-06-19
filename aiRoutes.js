const express = require('express');
const router = express.Router();
const authMiddleware = require('./middleware/auth');
const { GoogleGenAI } = require('@google/genai');

let aiInstance = null;

function getAi() {
    if (!aiInstance) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not configured');
        }
        aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
}

// 1. GET /test-ai Endpoint Logic
async function testAi(req, res) {
    try {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'Say hello and confirm AI connection'
        });
        
        res.json({
            success: true,
            result: response.text
        });
    } catch (err) {
        console.error('Test AI Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
}

// 2. POST /api/scan-product Endpoint Logic
async function scanProductLogic(req, res) {
    try {
        let base64Data = '';
        let mimeType = 'image/jpeg';

        // Check if raw binary upload (e.g. content-type image/jpeg)
        if (req.headers['content-type'] && req.headers['content-type'].startsWith('image/')) {
            mimeType = req.headers['content-type'];
            const buffers = [];
            for await (const chunk of req) {
                buffers.push(chunk);
            }
            base64Data = Buffer.concat(buffers).toString('base64');
        } else {
            // Read from JSON body
            const { imageBase64, mimeType: bodyMime } = req.body;
            if (!imageBase64) {
                return res.status(400).json({ success: false, error: 'No image provided' });
            }
            base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            if (bodyMime) mimeType = bodyMime;
        }

        const prompt = `Analyze this product image and return ONLY valid JSON.
Required fields:
{
  "productName": "",
  "brand": "",
  "category": "",
  "description": "",
  "weight": "",
  "barcode": "",
  "confidence": ""
}
Rules:
* Do not guess uncertain values
* Return null when uncertain
* Confidence should be from 0–1
* No extra text outside JSON`;

        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text;
        const jsonResult = JSON.parse(text);

        // Normalize fields for compatibility
        const normalizedData = {
            productName: jsonResult.productName || null,
            name: jsonResult.productName || null, // client fallback
            brand: jsonResult.brand || null,
            category: jsonResult.category || null,
            suggestedCategory: jsonResult.category || null, // client fallback
            description: jsonResult.description || null,
            weight: jsonResult.weight || null,
            barcode: jsonResult.barcode || null,
            confidence: jsonResult.confidence !== undefined && jsonResult.confidence !== null ? parseFloat(jsonResult.confidence) : null
        };

        // Determine if request is from the legacy client endpoint (/api/ai/scan-product)
        const isLegacy = req.baseUrl === '/api/ai' || req.originalUrl.includes('/api/ai');
        if (isLegacy) {
            return res.json(normalizedData);
        } else {
            return res.json({
                success: true,
                data: normalizedData
            });
        }
    } catch (err) {
        console.error('Scan Product Error:', err);
        const isLegacy = req.baseUrl === '/api/ai' || req.originalUrl.includes('/api/ai');
        if (isLegacy) {
            res.status(500).json({ error: 'Failed to analyze product image' });
        } else {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
}

// Map the endpoints to the router for the legacy path /api/ai/scan-product (protected by auth)
router.post('/scan-product', authMiddleware, scanProductLogic);

// Attach endpoints to router object for root-level mounting
router.testAi = testAi;
router.scanProduct = scanProductLogic;

module.exports = router;
