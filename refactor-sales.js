const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, 'sales.js'), 'utf8');

// 1. Add tidb import
content = content.replace(
    "const { logActivity, createNotification } = require('./lib/monitoring');",
    "const { logActivity, createNotification } = require('./lib/monitoring');\nconst tidb = require('./services/tidb');"
);

// 2. Replace transaction block
const txBlockRegex = /const result = await prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?return \{ sale, newQuantity: updatedProduct\.quantity, productName: product\.name, reorderLevel: product\.reorderLevel, unit: product\.unit \};\s*\}\);\s*const \{ sale, newQuantity, productName, reorderLevel, unit \} = result;/;
const newTxBlock = `
        await tidb.initTable();
        const product = await tidb.getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (product.userId !== req.userId) {
            return res.status(403).json({ error: 'Access forbidden' });
        }
        if (product.quantity < qtyToSold) {
            return res.status(400).json({ error: 'Insufficient stock available' });
        }

        const totalAmount = product.sellingPrice * qtyToSold;

        // Update in TiDB
        const newQuantity = product.quantity - qtyToSold;
        await tidb.updateProduct(productId, { quantity: newQuantity });

        // Create Sale in Prisma
        const sale = await prisma.sale.create({
            data: {
                productId,
                quantitySold: qtyToSold,
                totalAmount,
                paymentMethod: paymentMethod || 'cash',
                userId: req.userId,
                productName: product.name,
                unitPrice: product.sellingPrice
            }
        });

        const productName = product.name;
        const reorderLevel = product.reorderLevel;
        const unit = product.unit;
`;
content = content.replace(txBlockRegex, newTxBlock);

// 3. Remove all includes for product
content = content.replace(/include:\s*\{\s*product:\s*\{\s*select:\s*\{[\s\S]*?\}\s*\}\s*\},/g, '');
content = content.replace(/include:\s*\{\s*product:\s*\{\s*select:\s*\{[\s\S]*?\}\s*\}\s*\}/g, '');
content = content.replace(/include:\s*\{\s*product:\s*true\s*\},/g, '');
content = content.replace(/include:\s*\{\s*product:\s*true\s*\}/g, '');

// 4. Inject formatSales function
content = content.replace(
    "// GET ALL SALES",
    `
function formatSales(sales) {
    return sales.map(s => {
        if (!s.product) {
            s.product = {
                id: s.productId,
                name: s.productName || 'Unknown Product',
                sellingPrice: s.unitPrice || 0,
                unit: 'pieces'
            };
        }
        return s;
    });
}
// GET ALL SALES`
);

// 5. Wrap res.json({ sales }) with formatSales(sales)
content = content.replace(/res\.json\(\{\s*sales\s*\}\)/g, 'res.json({ sales: formatSales(sales) })');
content = content.replace(/res\.json\(\{\s*sales:\s*sales\s*\}\)/g, 'res.json({ sales: formatSales(sales) })');

// 6. Fix Top Products Logic
// Old logic used s.product.name. Since we have s.productName, replace it.
content = content.replace(/s\.product\.name/g, '(s.productName || "Unknown")');
content = content.replace(/s\.product\.unit/g, '"pieces"');
content = content.replace(/!s\.product/g, '!s.productId');

// 7. Fix analytics logic
content = content.replace(/sale\.product\.costPrice/g, '(sale.unitPrice * 0.75)'); // Approximate since costPrice isn't in Sale
content = content.replace(/sale\.product\.sellingPrice/g, 'sale.unitPrice');
content = content.replace(/if\s*\(sale\.product\)/g, 'if (true)');


fs.writeFileSync(path.join(__dirname, 'sales.js'), content);
console.log('sales.js refactored!');
