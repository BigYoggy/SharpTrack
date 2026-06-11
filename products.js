const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('./middleware/auth');

const prisma = new PrismaClient();

// ADD PRODUCT
router.post('/', authMiddleware, async (req, res) => {
    const { name, sellingPrice, quantity, reorderLevel, unit } = req.body;

    if (!name || sellingPrice === undefined || quantity === undefined) {
        return res.status(400).json({ error: 'Name, price and quantity are required' });
    }

    if (parseFloat(sellingPrice) <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    if (parseInt(quantity) < 0) {
        return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    try {
        const product = await prisma.product.create({
            data: {
                name: name.trim(),
                sellingPrice: parseFloat(sellingPrice),
                quantity: parseInt(quantity),
                reorderLevel: parseInt(reorderLevel) || 5,
                unit: unit || 'pieces',
                userId: req.userId
            }
        });
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

// UPDATE PRODUCT
router.put('/:id', authMiddleware, async (req, res) => {
    const { name, sellingPrice, quantity, reorderLevel, unit } = req.body;

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
                quantity: quantity !== undefined ? parseInt(quantity) : existing.quantity, 
                reorderLevel: reorderLevel !== undefined ? parseInt(reorderLevel) : existing.reorderLevel, 
                unit: unit || existing.unit 
            }
        });
        res.json({ message: 'Product updated', product });
    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// DELETE PRODUCT
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        // Verify ownership
        const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.userId !== req.userId) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Delete related sales first
        await prisma.sale.deleteMany({ where: { productId: req.params.id } });
        await prisma.product.delete({ where: { id: req.params.id } });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Delete product error:', err.message);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;
