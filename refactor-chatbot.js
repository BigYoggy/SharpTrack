const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, 'chatbot.js'), 'utf8');

// Add tidb
content = content.replace(
    "const { logActivity } = require('./lib/monitoring');",
    "const { logActivity } = require('./lib/monitoring');\nconst tidb = require('./services/tidb');"
);

// We need to replace all `await prisma.product...` with tidb methods.
// Since chatbot.js has standard calls, let's use regex.

content = content.replace(
    /await prisma\.product\.findFirst\(\{\s*where:\s*\{\s*userId: (.*?),[\s\S]*?name:\s*\{\s*contains:\s*(.*?),\s*mode:\s*'insensitive'\s*\}\s*\}[\s\S]*?\}\)/g,
    `await (async () => { const list = await tidb.searchProducts($1, $2); return list.length > 0 ? list[0] : null; })()`
);

// update product
content = content.replace(
    /await prisma\.product\.update\(\{\s*where:\s*\{\s*id:\s*(.*?)\s*\},\s*data:\s*\{\s*quantity:\s*\{\s*(increment|decrement):\s*(.*?)\s*\}\s*\}\s*\}\)/g,
    `await (async () => { const prod = await tidb.getProductById($1); if(prod) await tidb.updateProduct($1, { quantity: prod.quantity $2 === 'increment' ? '+' : '-' + $3 }); })()`
);

content = content.replace(
    /await prisma\.product\.update\(\{\s*where:\s*\{\s*id:\s*(.*?)\s*\},\s*data:\s*\{\s*([a-zA-Z]+):\s*(.*?)\s*\}\s*\}\)/g,
    `await tidb.updateProduct($1, { $2: $3 })`
);

content = content.replace(
    /await prisma\.product\.delete\(\{\s*where:\s*\{\s*id:\s*(.*?)\s*\}\s*\}\)/g,
    `await tidb.deleteProduct($1)`
);

content = content.replace(
    /await prisma\.product\.findMany\(\{\s*where:\s*\{\s*userId: (.*?)\s*\}[\s\S]*?\}\)/g,
    `await tidb.getProductsByUser($1)`
);

content = content.replace(
    /await prisma\.product\.create\(\{\s*data:\s*\{([\s\S]*?)\}\s*\}\)/g,
    `await tidb.createProduct({$1})`
);

fs.writeFileSync(path.join(__dirname, 'chatbot.js'), content);
console.log('chatbot.js refactored!');
