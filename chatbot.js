const express = require('express');
const router = express.Router();
const authMiddleware = require('./middleware/auth');
const OpenAI = require('openai');
const axios = require('axios');

let glmClient = null;

function getGLMClient() {
    if (!glmClient) {
        const apiKey = process.env.GLM_API_KEY;
        if (!apiKey) {
            throw new Error('GLM_API_KEY environment variable is not configured');
        }
        glmClient = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://open.bigmodel.cn/api/paas/v4/'
        });
    }
    return glmClient;
}

async function callAI(systemPrompt, message) {
    const client = getGLMClient();
    const response = await client.chat.completions.create({
        model: 'glm-4-flash',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ]
    });
    return response.choices[0].message.content;
}

// POST /api/chat
router.post('/', authMiddleware, async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const systemPrompt = `You are SharpTrack AI, an inventory assistant for Nigerian provision store owners.
Extract intent and entities from user messages and return ONLY valid JSON with no extra text.

Format:
{
  "intent": "add_product|update_price|check_stock|low_stock|record_sale|daily_summary|unknown",
  "product": "product name or null",
  "quantity": number or null,
  "price": number or null,
  "action": "brief description"
}`;

        let geminiJson;

        if (process.env.GLM_API_KEY) {
            try {
                const rawText = await callAI(systemPrompt, `User query: "${message}"`);
                // Strip markdown code fences if GLM wraps the JSON in them
                const cleaned = rawText.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
                geminiJson = JSON.parse(cleaned);
            } catch (glmErr) {
                console.error('GLM API call failed, falling back to local parser:', glmErr.message);
                // If GLM_API_KEY is invalid or GLM is unreachable, fall through to local parser
                geminiJson = null;
            }
        }

        if (!geminiJson) {
            console.warn("GLM_API_KEY not configured. Using local fallback parser for testing.");
            
            // Helper functions for fallback parsing
            const capitalizeWords = (str) => str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            // Extract the user query if wrapped in the prompt template
            let query = message;
            const marker = 'User query: "';
            const markerIdx = message.indexOf(marker);
            if (markerIdx !== -1) {
                query = message.substring(markerIdx + marker.length);
                if (query.endsWith('"')) {
                    query = query.slice(0, -1);
                }
            }

            const msg = query.toLowerCase().trim();
            // Clean punctuation but preserve letters, spaces, and currency symbols
            const cleanMsg = msg.replace(/[?.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();

            // 1. Add Stock / Put Product
            const addMatch = cleanMsg.match(/(?:add|put|buy)\s+(\d+)\s+(.+?)(?:\s+at\s+n?[\u20A6₦]?\s*(\d+))?$/i) ||
                             cleanMsg.match(/(?:add|put|buy)\s+(.+?)\s+(\d+)\s+(?:at\s+n?[\u20A6₦]?\s*(\d+))?$/i);
            
            // 2. Record Sale
            const saleMatch = cleanMsg.match(/(?:sold|sell|recorded)\s+(\d+)\s+(.+)$/i) ||
                              cleanMsg.match(/(?:sold|sell|recorded)\s+(.+?)\s+(\d+)$/i);

            // 3. Update Price
            const priceMatch = cleanMsg.match(/(?:update|change|set)\s+(.+?)\s+price\s+to\s+(\d+)/i) ||
                               cleanMsg.match(/(?:update|change|set)\s+price\s+of\s+(.+?)\s+to\s+(\d+)/i);

            // 4. Check Stock
            const checkMatch = cleanMsg.match(/how\s+many\s+(.+?)(?:\s+do\s+i\s+have|\s+i\s+get|\s+remaining|\s+left)?$/i) ||
                               cleanMsg.match(/(?:check\s+stock\s+of|stock\s+level\s+of|check\s+)\s+(.+)$/i);

            if (addMatch && !cleanMsg.includes('sell') && !cleanMsg.includes('sold')) {
                const qty = parseInt(addMatch[1], 10);
                let prod = addMatch[2].replace(/\bat\b.*$/i, '').trim();
                prod = prod.replace(/\bnaira\b.*$/i, '').trim();
                const priceStr = addMatch[3];
                const price = priceStr ? parseInt(priceStr, 10) : null;
                
                geminiJson = {
                    intent: "add_product",
                    product: capitalizeWords(prod),
                    quantity: qty,
                    price: price,
                    action: `Add ${qty} ${prod}` + (price ? ` at ₦${price}` : '')
                };
            } else if (saleMatch) {
                const qty = parseInt(saleMatch[1], 10);
                let prod = saleMatch[2].trim();
                prod = prod.replace(/\bnaira\b.*$/i, '').trim();
                
                geminiJson = {
                    intent: "record_sale",
                    product: capitalizeWords(prod),
                    quantity: qty,
                    price: null,
                    action: `Record sale of ${qty} ${prod}`
                };
            } else if (priceMatch) {
                const prod = priceMatch[1].trim();
                const price = parseInt(priceMatch[2], 10);
                
                geminiJson = {
                    intent: "update_price",
                    product: capitalizeWords(prod),
                    quantity: null,
                    price: price,
                    action: `Update ${prod} price to ₦${price}`
                };
            } else if (checkMatch) {
                let prod = checkMatch[1].trim();
                prod = prod.replace(/\b(?:do i have|i get|remaining|left|stock)\b/gi, '').trim();
                
                geminiJson = {
                    intent: "check_stock",
                    product: capitalizeWords(prod),
                    quantity: null,
                    price: null,
                    action: `Check stock of ${prod}`
                };
            } else if (cleanMsg.includes("running low") || cleanMsg.includes("low stock") || cleanMsg.includes("run low") || cleanMsg.includes("alerts")) {
                geminiJson = {
                    intent: "low_stock",
                    product: null,
                    quantity: null,
                    price: null,
                    action: "What products are running low?"
                };
            } else if (cleanMsg.includes("today") || cleanMsg.includes("summary") || cleanMsg.includes("report")) {
                geminiJson = {
                    intent: "daily_summary",
                    product: null,
                    quantity: null,
                    price: null,
                    action: "Show today's sales"
                };
            } else {
                geminiJson = {
                    intent: "unknown",
                    product: null,
                    quantity: null,
                    price: null,
                    action: query
                };
            }
        }

        const { intent, product, quantity, price } = geminiJson;

        const PORT = process.env.PORT || 3000;
        const apiBase = `http://localhost:${PORT}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization // Forward the user's JWT token
        };

        let responseMessage = '';

        switch (intent) {
            case 'add_product': {
                if (!product || quantity === null || price === null) {
                    responseMessage = "Abeg, tell me the product name, how many you want to add, and the price (e.g. 'Add 20 Milo at ₦1900').";
                    break;
                }

                // Check if product already exists
                const getRes = await axios.get(`${apiBase}/api/products`, { headers });
                const products = getRes.data.products || [];
                const existing = products.find(p => p.name.toLowerCase() === product.toLowerCase());

                if (existing) {
                    // Update existing
                    const newQuantity = existing.quantity + quantity;
                    await axios.put(`${apiBase}/api/products/${existing.id}`, {
                        quantity: newQuantity,
                        sellingPrice: price
                    }, { headers });

                    responseMessage = `Oya, I have updated *${existing.name}*. Added ${quantity} unit(s). New stock level: ${newQuantity}. Selling price set to ₦${price.toLocaleString()}.`;
                } else {
                    // Create new
                    await axios.post(`${apiBase}/api/products`, {
                        name: product,
                        sellingPrice: price,
                        costPrice: price * 0.75, // Default cost price (75% of selling price)
                        quantity: quantity,
                        reorderLevel: 5,
                        unit: 'pieces'
                    }, { headers });

                    responseMessage = `Correct! I have added *${product}* as a new product in your inventory with ${quantity} unit(s) at ₦${price.toLocaleString()} each.`;
                }
                break;
            }

            case 'update_price': {
                if (!product || price === null) {
                    responseMessage = "Abeg, specify the product name and the new price you want to set (e.g. 'Update Indomie price to ₦700').";
                    break;
                }

                const getRes = await axios.get(`${apiBase}/api/products`, { headers });
                const products = getRes.data.products || [];
                const existing = products.find(p => p.name.toLowerCase() === product.toLowerCase());

                if (!existing) {
                    responseMessage = `Ah, I search for *${product}* but I no see am for your inventory list. Confirm the name first.`;
                    break;
                }

                await axios.put(`${apiBase}/api/products/${existing.id}`, {
                    sellingPrice: price
                }, { headers });

                responseMessage = `Done deal! I have updated the price of *${existing.name}* to ₦${price.toLocaleString()}.`;
                break;
            }

            case 'check_stock': {
                if (!product) {
                    responseMessage = "Which product you want to check? Tell me (e.g. 'How many Indomie do I have?').";
                    break;
                }

                const getRes = await axios.get(`${apiBase}/api/products`, { headers });
                const products = getRes.data.products || [];
                const existing = products.find(p => p.name.toLowerCase() === product.toLowerCase());

                if (existing) {
                    responseMessage = `You get **${existing.quantity}** ${existing.unit || 'pieces'} of *${existing.name}* remaining for your shop.`;
                } else {
                    responseMessage = `I no see *${product}* for your inventory list o. Make sure say you add the product first.`;
                }
                break;
            }

            case 'low_stock': {
                const getRes = await axios.get(`${apiBase}/api/products`, { headers });
                const products = getRes.data.products || [];
                const lowStock = products.filter(p => p.quantity <= p.reorderLevel);

                if (lowStock.length === 0) {
                    responseMessage = "Everything dey intact! None of your products is running low for now.";
                } else {
                    const list = lowStock.map(p => `• **${p.name}**: ${p.quantity} left (reorder level: ${p.reorderLevel})`).join('\n');
                    responseMessage = `Abeg take note, these products dey run low:\n\n${list}`;
                }
                break;
            }

            case 'record_sale': {
                if (!product || !quantity) {
                    responseMessage = "To record sale, specify the product and how many you sell (e.g. 'I sold 5 Milo').";
                    break;
                }

                const getRes = await axios.get(`${apiBase}/api/products`, { headers });
                const products = getRes.data.products || [];
                const existing = products.find(p => p.name.toLowerCase() === product.toLowerCase());

                if (!existing) {
                    responseMessage = `Ah, *${product}* no dey your inventory. You must add the product before you fit record sale for am.`;
                    break;
                }

                if (existing.quantity < quantity) {
                    responseMessage = `Insufficient stock! You only get **${existing.quantity}** of *${existing.name}* left, but you want to sell ${quantity}.`;
                    break;
                }

                await axios.post(`${apiBase}/api/sales`, {
                    productId: existing.id,
                    quantitySold: quantity,
                    paymentMethod: 'cash'
                }, { headers });

                const totalAmount = existing.sellingPrice * quantity;
                responseMessage = `Recorded! You just sell ${quantity} *${existing.name}* for a total of ₦${totalAmount.toLocaleString()}. Remaining stock: **${existing.quantity - quantity}**.`;
                break;
            }

            case 'daily_summary': {
                const getRes = await axios.get(`${apiBase}/api/sales/today`, { headers });
                const data = getRes.data;

                if (!data.sales || data.sales.length === 0) {
                    responseMessage = "You never record any sales today. Sales no dey for now.";
                } else {
                    const list = data.sales.map(s => `• ${s.quantitySold}x **${s.productName || 'Product'}** (₦${s.totalAmount.toLocaleString()})`).join('\n');
                    responseMessage = `Here is today's sales summary:\n\n• **Total Revenue**: ₦${data.total.toLocaleString()}\n• **Total Sales Logged**: ${data.salesCount}\n\nTransactions:\n${list}`;
                }
                break;
            }

            case 'unknown':
            default:
                responseMessage = "Abeg, I no understand that command. You fit ask me to add stock, update price, check stock levels, record sale, or show today's summary.";
                break;
        }

        res.json({
            success: true,
            response: responseMessage,
            data: geminiJson
        });
    } catch (err) {
        console.error('Chatbot API Error:', err);
        res.status(500).json({
            success: false,
            error: err.response?.data?.error || err.message
        });
    }
});

module.exports = router;
