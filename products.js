const express = require('express');
const router = express.Router();
const prisma = require('./lib/prisma');
const authMiddleware = require('./middleware/auth');
const { isValidId, isValidBarcode, validateImageContent } = require('./lib/validation');
const { logActivity, createNotification } = require('./lib/monitoring');

// Centralized ID parameter validator middleware
router.param('id', (req, res, next, id) => {
    if (!isValidId(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
    }
    next();
});

// ADD PRODUCT
router.post('/', authMiddleware, async (req, res) => {
    const { name, sellingPrice, costPrice, quantity, reorderLevel, unit, brand, weight, barcode, description, categoryId, categoryName, image } = req.body;

    if (!name || sellingPrice === undefined || costPrice === undefined || quantity === undefined) {
        return res.status(400).json({ error: 'Name, selling price, cost price, and quantity are required' });
    }

    if (parseFloat(sellingPrice) <= 0 || parseFloat(costPrice) < 0) {
        return res.status(400).json({ error: 'Invalid prices: Selling price must be > 0 and Cost price >= 0' });
    }

    if (parseInt(quantity) < 0) {
        return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    if (categoryId && !isValidId(categoryId)) {
        return res.status(400).json({ error: 'Invalid category ID format' });
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
            barcode: barcode || null,
            description: description || null,
            categoryId: finalCategoryId,
            image: image || null
        };

        const product = await prisma.product.create({ data });

        // Log activity
        await logActivity(req.userId, 'product_created', `Created product: ${product.name} (Qty: ${product.quantity})`);
        await createNotification(req.userId, 'info', 'Product Added', `Added product: ${product.name} (${product.quantity} ${product.unit || 'pieces'}).`);

        res.status(201).json({ message: 'Product added', product });
    } catch (err) {
        console.error('Add product error:', err.message);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// GET ALL PRODUCTS
router.get('/', authMiddleware, async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ products });
    } catch (err) {
        console.error('Get products error:', err.message);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

// GET PRODUCT STATS (for dashboard)
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            where: { userId: req.userId },
            select: { id: true, quantity: true, reorderLevel: true, sellingPrice: true }
        });

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
router.get('/categories', authMiddleware, async (req, res) => {
    try {
        const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
        res.json({ categories: cats.map(x => x.name) });
    } catch (err) {
        console.error('Categories load failure:', err);
        res.status(500).json({ error: 'Failed to retrieve system categories' });
    }
});

// LOOKUP PRODUCT BY BARCODE
router.get('/barcode/:code', authMiddleware, async (req, res) => {
    const { code } = req.params;
    if (!code) {
        return res.status(400).json({ error: 'Barcode parameter is required' });
    }

    if (!isValidBarcode(code)) {
        return res.status(400).json({ error: 'Invalid barcode format' });
    }

    try {
        // Find match in current user's products first
        let product = await prisma.product.findFirst({
            where: { barcode: code, userId: req.userId },
            include: { category: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Fallback to checking products from other users
        if (!product) {
            product = await prisma.product.findFirst({
                where: { barcode: code },
                include: { category: { select: { name: true } } },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (product) {
            return res.json({
                found: true,
                product: {
                    name: product.name,
                    brand: product.brand,
                    weight: product.weight,
                    category: product.category ? product.category.name : null,
                    // Security check: Only reveal cost price if they own the product record
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
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

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

    if (categoryId && !isValidId(categoryId)) {
        return res.status(400).json({ error: 'Invalid category ID format' });
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
        // Verify ownership
        const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: { 
                name: name ? name.trim() : existing.name, 
                sellingPrice: sellingPrice !== undefined ? parseFloat(sellingPrice) : existing.sellingPrice, 
                costPrice: costPrice !== undefined && costPrice !== null ? parseFloat(costPrice) : (costPrice === null ? null : existing.costPrice),
                quantity: quantity !== undefined ? parseInt(quantity) : existing.quantity, 
                reorderLevel: reorderLevel !== undefined ? parseInt(reorderLevel) : existing.reorderLevel, 
                unit: unit || existing.unit,
                brand: brand !== undefined ? brand : existing.brand,
                weight: weight !== undefined ? weight : existing.weight,
                barcode: barcode !== undefined ? barcode : existing.barcode,
                description: description !== undefined ? description : existing.description,
                categoryId: categoryId !== undefined ? categoryId : existing.categoryId,
                image: image !== undefined ? image : existing.image
            }
        });
        await createNotification(req.userId, 'info', 'Product Updated', `Updated product: ${product.name} (Price: ₦${product.sellingPrice.toLocaleString()}, Stock: ${product.quantity}).`);
        res.json({ message: 'Product updated', product });
    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// DELETE PRODUCT
router.delete('/:id', authMiddleware, async (req, res) => {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    try {
        // Verify ownership
        const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete related sales first
        await prisma.sale.deleteMany({ where: { productId: req.params.id } });
        await prisma.product.delete({ where: { id: req.params.id } });

        // Log activity
        await logActivity(req.userId, 'product_deleted', `Deleted product: ${existing.name}`);
        await createNotification(req.userId, 'info', 'Product Deleted', `Deleted product: ${existing.name} from inventory.`);

        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Delete product error:', err.message);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;
