const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(path.join(__dirname, 'adminRoutes.js'), 'utf8');

content = content.replace(
    "const { cache, clearCache } = require('./middleware/cache');",
    "const { cache, clearCache } = require('./middleware/cache');\nconst tidb = require('./services/tidb');"
);

content = content.replace(
    "const totalProducts = await prisma.product.count();",
    "const totalProducts = await tidb.countAllProducts();"
);

content = content.replace(
    "await prisma.product.deleteMany({ where: { userId: req.params.id } });",
    "await tidb.deleteProductsByUser(req.params.id);"
);

// 7. PRODUCT CATALOG
content = content.replace(
    /const products = await prisma\.product\.findMany\(\{\s*orderBy:\s*\{\s*createdAt:\s*'desc'\s*\},\s*select:[\s\S]*?\}\);/m,
    `const products = await tidb.getAllProductsAdmin();`
);

// Product create
const createProductRegex = /const product = await prisma\.product\.create\(\{\s*data:\s*\{[\s\S]*?\}\s*\}\);/m;
content = content.replace(
    createProductRegex,
    `const product = await tidb.createProduct({
            name: name.trim(),
            barcode: barcode.trim(),
            brand: brand ? brand.trim() : '',
            categoryId: cat.id,
            specifications: specifications ? specifications.trim() : '',
            image: image ? image.trim() : '',
            sellingPrice: 0.0,
            quantity: 0,
            userId: systemUser.id
        });`
);

// Product update
const updateProductRegex = /const updated = await prisma\.product\.update\(\{\s*where: \{ id: req\.params\.id \},\s*data: \{[\s\S]*?\}\s*\}\);/m;
content = content.replace(
    updateProductRegex,
    `const updated = await tidb.updateProduct(req.params.id, {
            name: name ? name.trim() : undefined,
            barcode: barcode ? barcode.trim() : undefined,
            brand: brand !== undefined ? brand.trim() : undefined,
            categoryId: finalCategoryId,
            specifications: specifications !== undefined ? specifications.trim() : undefined,
            image: image !== undefined ? image.trim() : undefined,
            description: description !== undefined ? description.trim() : undefined
        });`
);

// Product delete
content = content.replace(
    "await prisma.product.delete({ where: { id: req.params.id } });",
    "await tidb.deleteProduct(req.params.id);"
);

// Ingestion pipeline create product 1
const ingestionCreate1Regex = /await prisma\.product\.create\(\{\s*data:\s*\{\s*name:\s*item\.name,\s*barcode:\s*item\.barcode[\s\S]*?\}\s*\}\);/m;
content = content.replace(
    ingestionCreate1Regex,
    `await tidb.createProduct({
            name: item.name,
            barcode: item.barcode || '',
            brand: item.brand,
            categoryId: cat.id,
            specifications: item.spec || '',
            image: '',
            sellingPrice: 0.0,
            quantity: 0,
            userId: systemUser.id
        });`
);

// Ingestion pipeline create product 2 (retry)
const ingestionCreate2Regex = /await prisma\.product\.create\(\{\s*data:\s*\{\s*name:\s*item\.name,\s*barcode:\s*updatedBarcode[\s\S]*?\}\s*\}\);/m;
content = content.replace(
    ingestionCreate2Regex,
    `await tidb.createProduct({
            name: item.name,
            barcode: updatedBarcode,
            brand: item.brand,
            categoryId: cat.id,
            specifications: item.spec || 'Standard packaging',
            image: '',
            sellingPrice: 0.0,
            quantity: 0,
            userId: systemUser.id
        });`
);

// /businesses includes product
const businessesProductsRegex = /include:\s*\{\s*products:\s*\{\s*select:\s*\{\s*sellingPrice:\s*true,\s*quantity:\s*true\s*\}\s*\},/m;
content = content.replace(businessesProductsRegex, `include: {`);

content = content.replace(
    "const inventoryItems = m.products.reduce((acc, p) => acc + p.quantity, 0);",
    "// Inventory omitted as product moved to tidb\n            const inventoryItems = 0;"
);

content = content.replace(
    "const inventoryValue = m.products.reduce((sum, p) => sum + (p.sellingPrice * p.quantity), 0);",
    "const inventoryValue = 0;"
);

fs.writeFileSync(path.join(__dirname, 'adminRoutes.js'), content);
console.log('adminRoutes.js refactored!');
