const express = require('express');
const router = express.Router();
const prisma = require('./lib/prisma');
const authMiddleware = require('./middleware/auth');
const { cache, clearCache } = require('./middleware/cache');
const { isValidId, isValidBarcode, validateImageContent } = require('./lib/validation');
const { logActivity, createNotification } = require('./lib/monitoring');
const tidb = require('./services/tidb');

// Centralized ID parameter validator middleware (Now standard regex since we use generic strings for TiDB IDs)
router.param('id', (req, res, next, id) => {
    // Basic format check for ID, can be expanded based on what TiDB generates
    if (typeof id !== 'string' || id.length < 5) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
});

// ADD PRODUCT
router.post('/', authMiddleware, async (req, res) => {
    const { name, sellingPrice, costPrice, quantity, reorderLevel, unit, brand, weight, barcode, description, categoryId, categoryName, image, specifications } = req.body;

    if (!name || sellingPrice === undefined || costPrice === undefined || quantity === undefined) {
        return res.status(400).json({ error: 'Name, selling price, cost price, and quantity are required' });
    }

    if (parseFloat(sellingPrice) <= 0 || parseFloat(costPrice) < 0) {
        return res.status(400).json({ error: 'Invalid prices: Selling price must be > 0 and Cost price >= 0' });
    }

    if (parseInt(quantity) < 0) {
        return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    if (barcode && !isValidBarcode(barcode)) {
        return res.status(400).json({ error: 'Invalid barcode format' });
    }

    if (image) {
        const imgVal = validateImageContent(image);
        if (!imgVal.valid) {
            return res.status(400).json({ error: `Image validation failed: ${imgVal.error}` });
        }
    }

    try {
        await tidb.initTable(); // Ensure table exists

        let finalCategoryId = categoryId || null;
        if (categoryName && !finalCategoryId) {
            let cat = await prisma.category.findUnique({ where: { name: categoryName } });
            if (!cat) {
                cat = await prisma.category.create({ data: { name: categoryName } });
            }
            finalCategoryId = cat.id;
        }

        const data = {
            name: name.trim(),
            sellingPrice: parseFloat(sellingPrice),
            costPrice: parseFloat(costPrice),
            quantity: parseInt(quantity),
            reorderLevel: parseInt(reorderLevel) || 5,
            unit: unit || 'pieces',
            userId: req.userId,
            brand: brand || null,
            weight: weight || null,
            specifications: specifications || null,
            barcode: barcode || null,
            description: description || null,
            categoryId: finalCategoryId,
            image: image || null
        };

        const product = await tidb.createProduct(data);

        // Log activity
        await logActivity(req.userId, 'product_created', `Created product: ${product.name} (Qty: ${product.quantity})`);
        await createNotification(req.userId, 'info', 'Product Added', `Added product: ${product.name} (${product.quantity} ${product.unit || 'pieces'}).`);

        await clearCache(`products*`);
        await clearCache(`dashboard:${req.userId}:*`);
        res.status(201).json({ message: 'Product added', product });
    } catch (err) {
        console.error('Add product error:', err.message);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// GET ALL PRODUCTS
router.get('/', authMiddleware, cache('products'), async (req, res) => {
    try {
        await tidb.initTable();
        const products = await tidb.getProductsByUser(req.userId);
        res.json({ products });
    } catch (err) {
        console.error('Get products error:', err.message);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

// GET PRODUCT STATS (for dashboard)
router.get('/stats', authMiddleware, cache('products_stats'), async (req, res) => {
    try {
        await tidb.initTable();
        const products = await tidb.getProductsByUser(req.userId);

        const totalProducts = products.length;
        const lowStockItems = products.filter(p => p.quantity <= p.reorderLevel);
        const outOfStock = products.filter(p => p.quantity === 0);
        const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.sellingPrice), 0);

        res.json({ 
            totalProducts,
            lowStockCount: lowStockItems.length,
            outOfStockCount: outOfStock.length,
            totalValue
        });
    } catch (err) {
        console.error('Get product stats error:', err.message);
        res.status(500).json({ error: 'Failed to load product stats' });
    }
});

// GET CATEGORIES
router.get('/categories', authMiddleware, cache('products_cat'), async (req, res) => {
    try {
        const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
        res.json({ categories: cats.map(x => x.name) });
    } catch (err) {
        console.error('Categories load failure:', err);
        res.status(500).json({ error: 'Failed to retrieve system categories' });
    }
});

// LOOKUP PRODUCT BY BARCODE
router.get('/barcode/:code', authMiddleware, cache('products_barcode'), async (req, res) => {
    const { code } = req.params;
    if (!code) {
        return res.status(400).json({ error: 'Barcode parameter is required' });
    }

    if (!isValidBarcode(code)) {
        return res.status(400).json({ error: 'Invalid barcode format' });
    }

    try {
        await tidb.initTable();
        // Currently TiDB search is limited, so we just pull user products and filter manually for simplicity,
        // or we use a proper TiDB query. Let's use getProductsByUser for safety since barcode search might be specific.
        const allUserProducts = await tidb.getProductsByUser(req.userId);
        let product = allUserProducts.find(p => p.barcode === code);

        // Note: For global fallback we would need a TiDB query for global scope.
        // If not found in user's, we can't easily search all of TiDB without a global method.
        // For now, we just skip global fallback or implement it in TiDB.

        if (product) {
            return res.json({
                found: true,
                product: {
                    name: product.name,
                    brand: product.brand,
                    weight: product.weight,
                    category: product.categoryId, // In full app, join with Category
                    costPrice: product.userId === req.userId ? product.costPrice : null,
                    sellingPrice: product.sellingPrice,
                    unit: product.unit,
                    description: product.description
                }
            });
        }

        return res.json({ found: false });
    } catch (err) {
        console.error('Barcode lookup error:', err.message);
        res.status(500).json({ error: 'Failed to look up barcode locally' });
    }
});

// UPDATE PRODUCT
router.put('/:id', authMiddleware, async (req, res) => {
    const { name, sellingPrice, costPrice, quantity, reorderLevel, unit, brand, weight, barcode, description, categoryId, image } = req.body;

    if (sellingPrice !== undefined && parseFloat(sellingPrice) <= 0) {
        return res.status(400).json({ error: 'Selling price must be greater than zero' });
    }

    if (costPrice !== undefined && costPrice !== null && parseFloat(costPrice) < 0) {
        return res.status(400).json({ error: 'Cost price cannot be negative' });
    }

    if (quantity !== undefined && parseInt(quantity) < 0) {
        return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    if (barcode && !isValidBarcode(barcode)) {
        return res.status(400).json({ error: 'Invalid barcode format' });
    }

    if (image) {
        const imgVal = validateImageContent(image);
        if (!imgVal.valid) {
            return res.status(400).json({ error: `Image validation failed: ${imgVal.error}` });
        }
    }

    try {
        await tidb.initTable();
        // Verify ownership
        const existing = await tidb.getProductById(req.params.id);
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const dataToUpdate = {};
        if (name) dataToUpdate.name = name.trim();
        if (sellingPrice !== undefined) dataToUpdate.sellingPrice = parseFloat(sellingPrice);
        if (costPrice !== undefined) dataToUpdate.costPrice = costPrice === null ? null : parseFloat(costPrice);
        if (quantity !== undefined) dataToUpdate.quantity = parseInt(quantity);
        if (reorderLevel !== undefined) dataToUpdate.reorderLevel = parseInt(reorderLevel);
        if (unit) dataToUpdate.unit = unit;
        if (brand !== undefined) dataToUpdate.brand = brand;
        if (weight !== undefined) dataToUpdate.weight = weight;
        if (barcode !== undefined) dataToUpdate.barcode = barcode;
        if (description !== undefined) dataToUpdate.description = description;
        if (categoryId !== undefined) dataToUpdate.categoryId = categoryId;
        if (image !== undefined) dataToUpdate.image = image;

        const product = await tidb.updateProduct(req.params.id, dataToUpdate);
        
        await createNotification(req.userId, 'info', 'Product Updated', `Updated product: ${product.name} (Price: ₦${product.sellingPrice.toLocaleString()}, Stock: ${product.quantity}).`);
        res.json({ message: 'Product updated', product });
    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// DELETE PRODUCT
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await tidb.initTable();
        // Verify ownership
        const existing = await tidb.getProductById(req.params.id);
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete related sales first (in Prisma)
        await prisma.sale.deleteMany({ where: { productId: req.params.id } });
        
        // Delete in TiDB
        await tidb.deleteProduct(req.params.id);

        // Log activity
        await logActivity(req.userId, 'product_deleted', `Deleted product: ${existing.name}`);
        await createNotification(req.userId, 'info', 'Product Deleted', `Deleted product: ${existing.name} from inventory.`);

        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Delete product error:', err.message);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// SEARCH GLOBAL CATALOG BY NAME (Auto-fill support)
router.get('/search-global', authMiddleware, cache('products_global'), async (req, res) => {
    const query = req.query.q;
    if (!query || query.length < 2) {
        return res.json({ products: [] });
    }

    try {
        await tidb.initTable();
        // Assuming searchProducts searches only the user's catalog for now
        const products = await tidb.searchProducts(req.userId, query);
        // Note: Global search needs a different TiDB query without userId, skipped for scope mapping.
        res.json({ products: products.slice(0, 5) });
    } catch (err) {
        console.error('Global search error:', err.message);
        res.status(500).json({ error: 'Failed to search catalog' });
    }
});

module.exports = router;
