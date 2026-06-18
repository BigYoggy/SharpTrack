const express = require('express');
const router = express.Router();
const authMiddleware = require('./middleware/auth');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/scan-product', authMiddleware, async (req, res) => {
    try {
        const { imageBase64, mimeType } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const prompt = `Analyze this product image and return ONLY valid JSON in this exact format:
{
  "name": "Product Name",
  "brand": "Brand Name",
  "weight": "Weight/Size",
  "barcode": "Barcode if visible",
  "suggestedCategory": "Suggested category",
  "confidence": 0.95
}
If a field is not visible or cannot be determined, use an empty string. The confidence score should be between 0.0 and 1.0 reflecting how sure you are about the core product identity. DO NOT include markdown formatting like \`\`\`json. Return strictly the raw JSON object.`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType || 'image/jpeg'
                    }
                }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const text = response.text();
        
        let jsonResult;
        try {
            jsonResult = JSON.parse(text);
        } catch (e) {
            // Clean markdown wrap if present
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            jsonResult = JSON.parse(cleaned);
        }

        res.json(jsonResult);

    } catch (err) {
        console.error('AI Scan Error:', err);
        res.status(500).json({ error: 'Failed to analyze product image' });
    }
});

module.exports = router;
