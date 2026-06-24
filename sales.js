const express = require('express');
const router = express.Router();
const prisma = require('./lib/prisma');
const authMiddleware = require('./middleware/auth');
const { isValidId } = require('./lib/validation');

// RECORD A SALE
router.post('/', authMiddleware, async (req, res) => {
    const { productId, quantitySold, paymentMethod } = req.body;

    if (!productId || !quantitySold) {
        return res.status(400).json({ error: 'Product and quantity are required' });
    }

    if (!isValidId(productId)) {
        return res.status(400).json({ error: 'Invalid product ID format' });
    }

    const qtyToSold = parseInt(quantitySold);
    if (isNaN(qtyToSold) || qtyToSold <= 0) {
        return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    try {
        // Double-click / Spam prevention: Check if identical sale recorded in last 5 seconds
        const recentSale = await prisma.sale.findFirst({
            where: {
                userId: req.userId,
                productId,
                quantitySold: qtyToSold,
                soldAt: { gte: new Date(Date.now() - 5000) }
            }
        });
        if (recentSale) {
            return res.status(409).json({ error: 'Duplicate sale detected. Please wait a moment.' });
        }

        // Perform stock validation and record sale atomically within a transaction
        const result = await prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) throw new Error('NOT_FOUND');
            if (product.userId !== req.userId) throw new Error('FORBIDDEN');
            if (product.quantity < qtyToSold) {
                throw new Error('OUT_OF_STOCK');
            }

            const totalAmount = product.sellingPrice * qtyToSold;

            // Decr stock atomically
            const updatedProduct = await tx.product.update({
                where: { id: productId },
                data: { quantity: { decrement: qtyToSold } }
            });

            // Double check stock bounds
            if (updatedProduct.quantity < 0) {
                throw new Error('OUT_OF_STOCK');
            }

            const sale = await tx.sale.create({
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

            return { sale, newQuantity: updatedProduct.quantity, productName: product.name, reorderLevel: product.reorderLevel, unit: product.unit };
        });

        const { sale, newQuantity, productName, reorderLevel, unit } = result;

        // Check for low stock and create notification
        if (newQuantity <= reorderLevel && newQuantity > 0) {
            try {
                await prisma.notification.create({
                    data: {
                        userId: req.userId,
                        type: 'WARNING',
                        title: 'Low Stock Alert',
                        message: `${productName} is running low (${newQuantity} ${unit} remaining). Consider restocking soon.`
                    }
                });
            } catch (e) { /* non-critical */ }
        }

        if (newQuantity === 0) {
            try {
                await prisma.notification.create({
                    data: {
                        userId: req.userId,
                        type: 'SYSTEM',
                        title: 'Out of Stock!',
                        message: `${productName} is now out of stock. Restock immediately to avoid missed sales.`
                    }
                });
            } catch (e) { /* non-critical */ }
        }

        res.status(201).json({ message: 'Sale recorded', sale });
    } catch (err) {
        if (err.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (err.message === 'FORBIDDEN') {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (err.message === 'OUT_OF_STOCK') {
            return res.status(400).json({ error: 'Not enough stock available.' });
        }
        console.error('Record sale error:', err.message);
        res.status(500).json({ error: 'Failed to record sale' });
    }
});

// GET ALL SALES
router.get('/', authMiddleware, async (req, res) => {
    try {
        const sales = await prisma.sale.findMany({
            where: { userId: req.userId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        sellingPrice: true,
                        unit: true
                    }
                }
            },
            orderBy: { soldAt: 'desc' }
        });
        res.json({ sales });
    } catch (err) {
        console.error('Get all sales error:', err.message);
        res.status(500).json({ error: 'Failed to load sales history' });
    }
});

// GET TODAY'S SALES
router.get('/today', authMiddleware, async (req, res) => {
    let timezoneOffset = -60; // Default to Nigeria (UTC+1)
    if (req.query.timezoneOffset !== undefined) {
        timezoneOffset = parseInt(req.query.timezoneOffset);
    }
    const now = new Date();
    const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    localNow.setUTCHours(0, 0, 0, 0);
    const start = new Date(localNow.getTime() + (timezoneOffset * 60 * 1000));

    try {
        const sales = await prisma.sale.findMany({
            where: { userId: req.userId, soldAt: { gte: start } },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        sellingPrice: true,
                        unit: true
                    }
                }
            },
            orderBy: { soldAt: 'desc' }
        });

        const total = sales.reduce((sum, s) => sum + s.totalAmount, 0);

        // Calculate yesterday's total for comparison
        const yesterdayStart = new Date(start);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const yesterdaySales = await prisma.sale.findMany({
            where: { 
                userId: req.userId, 
                soldAt: { gte: yesterdayStart, lt: start } 
            }
        });
        const yesterdayTotal = yesterdaySales.reduce((sum, s) => sum + s.totalAmount, 0);

        let percentChange = 0;
        if (yesterdayTotal > 0) {
            percentChange = Math.round(((total - yesterdayTotal) / yesterdayTotal) * 100);
        }

        res.json({ sales, total, yesterdayTotal, percentChange, salesCount: sales.length });
    } catch (err) {
        console.error('Get today sales error:', err.message);
        res.status(500).json({ error: 'Failed to load sales data' });
    }
});

// GET LAST 5 SALES
router.get('/recent', authMiddleware, async (req, res) => {
    try {
        const sales = await prisma.sale.findMany({
            where: { userId: req.userId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        sellingPrice: true,
                        unit: true
                    }
                }
            },
            orderBy: { soldAt: 'desc' },
            take: 5
        });
        res.json({ sales });
    } catch (err) {
        console.error('Get recent sales error:', err.message);
        res.status(500).json({ error: 'Failed to load recent sales' });
    }
});

// GET SALES STATS
router.get('/stats', authMiddleware, async (req, res) => {
    let timezoneOffset = -60; // Default to Nigeria (UTC+1)
    if (req.query.timezoneOffset !== undefined) {
        timezoneOffset = parseInt(req.query.timezoneOffset);
    }
    const now = new Date();
    const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    localNow.setUTCHours(0, 0, 0, 0);
    const today = new Date(localNow.getTime() + (timezoneOffset * 60 * 1000));

    try {
        const todaySales = await prisma.sale.findMany({
            where: { userId: req.userId, soldAt: { gte: today } }
        });

        const allSales = await prisma.sale.findMany({
            where: { userId: req.userId }
        });

        const todayTotal = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
        const allTimeTotal = allSales.reduce((sum, s) => sum + s.totalAmount, 0);

        res.json({
            todayTotal,
            todaySalesCount: todaySales.length,
            allTimeTotal,
            allTimeSalesCount: allSales.length
        });
    } catch (err) {
        console.error('Get sales stats error:', err.message);
        res.status(500).json({ error: 'Failed to load sales stats' });
    }
});

// GET WEEKLY SALES (Last 7 Days)
router.get('/weekly', authMiddleware, async (req, res) => {
    let timezoneOffset = -60; // Default to Nigeria (UTC+1)
    if (req.query.timezoneOffset !== undefined) {
        timezoneOffset = parseInt(req.query.timezoneOffset);
    }
    const now = new Date();
    const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    localNow.setUTCHours(0, 0, 0, 0);
    
    // 7 days including today starts at: localNow - 6 days
    const start = new Date(localNow.getTime() - (6 * 24 * 60 * 60 * 1000) + (timezoneOffset * 60 * 1000));

    try {
        const sales = await prisma.sale.findMany({
            where: {
                userId: req.userId,
                soldAt: { gte: start }
            },
            orderBy: { soldAt: 'asc' }
        });

        // Initialize last 7 days mapping
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyData = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(localNow.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateStr = d.toISOString().split('T')[0];
            weeklyData.push({
                dayName: days[d.getUTCDay()],
                dateString: dateStr,
                amount: 0,
                count: 0
            });
        }

        // Helper to convert date to local date string
        const getLocalDateString = (date, offset) => {
            const localTime = new Date(date.getTime() - (offset * 60 * 1000));
            return localTime.toISOString().split('T')[0];
        };

        // Aggregate sales by date
        sales.forEach(sale => {
            const saleDate = getLocalDateString(sale.soldAt, timezoneOffset);
            const target = weeklyData.find(item => item.dateString === saleDate);
            if (target) {
                target.amount += sale.totalAmount;
                target.count += 1;
            }
        });

        res.json({ weekly: weeklyData });
    } catch (err) {
        console.error('Get weekly sales error:', err.message);
        res.status(500).json({ error: 'Failed to load weekly sales' });
    }
});

// GET TOP-SELLING PRODUCTS
router.get('/top-products', authMiddleware, async (req, res) => {
    try {
        const sales = await prisma.sale.findMany({
            where: { userId: req.userId },
            include: {
                product: {
                    select: {
                        id: true,
                        name: true,
                        unit: true
                    }
                }
            }
        });

        const productSales = {};
        sales.forEach(s => {
            if (!s.product) return;
            if (!productSales[s.productId]) {
                productSales[s.productId] = {
                    id: s.productId,
                    name: s.product.name,
                    quantity: 0,
                    revenue: 0,
                    unit: s.product.unit
                };
            }
            productSales[s.productId].quantity += s.quantitySold;
            productSales[s.productId].revenue += s.totalAmount;
        });

        const sorted = Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        res.json({ topProducts: sorted });
    } catch (err) {
        console.error('Get top products error:', err.message);
        res.status(500).json({ error: 'Failed to load top products' });
    }
});

// GET DETAILED ANALYTICS (Revenue, Cost, profit/gains)
// GET DETAILED ANALYTICS (Revenue, Cost, profit/gains)
router.get('/analytics', authMiddleware, async (req, res) => {
    let timezoneOffset = -60; // Default to Nigeria (UTC+1)
    if (req.query.timezoneOffset !== undefined) {
        timezoneOffset = parseInt(req.query.timezoneOffset);
    }
    const range = req.query.range || 'week'; // 'day', 'week', 'month'

    const now = new Date();
    
    // Convert current time to local time in merchant's timezone
    const localNow = new Date(now.getTime() - (timezoneOffset * 60 * 1000));
    
    // Current boundaries in local time
    const todayStr = localNow.toISOString().split('T')[0];

    // Last 24 hours start
    const last24hStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    // Last 7 days start (including today)
    const last7dStart = new Date(localNow.getTime() - (6 * 24 * 60 * 60 * 1000));
    last7dStart.setUTCHours(0, 0, 0, 0);
    const last7dStartUtc = new Date(last7dStart.getTime() + (timezoneOffset * 60 * 1000));

    // Last 30 days start (including today)
    const last30dStart = new Date(localNow.getTime() - (29 * 24 * 60 * 60 * 1000));
    last30dStart.setUTCHours(0, 0, 0, 0);
    const last30dStartUtc = new Date(last30dStart.getTime() + (timezoneOffset * 60 * 1000));

    // Previous periods for comparison
    const prevLast24hStart = new Date(now.getTime() - (48 * 60 * 60 * 1000));
    
    const prevLast7dStart = new Date(last7dStart.getTime() - (7 * 24 * 60 * 60 * 1000));
    const prevLast7dStartUtc = new Date(prevLast7dStart.getTime() + (timezoneOffset * 60 * 1000));
    
    const prevLast30dStart = new Date(last30dStart.getTime() - (30 * 24 * 60 * 60 * 1000));
    const prevLast30dStartUtc = new Date(prevLast30dStart.getTime() + (timezoneOffset * 60 * 1000));

    // Oldest date to fetch from the database to satisfy the summaries and comparison period
    // If the active range is month, we need to go back 60 days (previous month range)
    // Otherwise, we need at least 30 days to populate the monthly summary card correctly
    const dbStartDateUtc = range === 'month' ? prevLast30dStartUtc : last30dStartUtc;

    try {
        // Fetch only recent sales for this user, and EXCLUDE the image field to prevent P6009 payload limits (since products can have large base64 images)
        const sales = await prisma.sale.findMany({
            where: { 
                userId: req.userId,
                soldAt: { gte: dbStartDateUtc }
            },
            include: {
                product: {
                    select: {
                        costPrice: true,
                        sellingPrice: true,
                        // image: true, <-- Excluded to keep payload size tiny and fast
                        unit: true
                    }
                }
            },
            orderBy: { soldAt: 'asc' }
        });

        // Helper function to calculate cost price for a sale
        const getSaleCostPrice = (sale) => {
            if (sale.product) {
                return sale.product.costPrice !== null && sale.product.costPrice !== undefined
                    ? sale.product.costPrice
                    : sale.product.sellingPrice * 0.75;
            }
            return sale.unitPrice * 0.75;
        };

        // Helper to convert date to local date string (YYYY-MM-DD)
        const getLocalDateString = (date) => {
            const localTime = new Date(date.getTime() - (timezoneOffset * 60 * 1000));
            return localTime.toISOString().split('T')[0];
        };

        // Helper to convert date to local date string with hour (e.g. YYYY-MM-DD HH:00)
        const getLocalDateHourString = (date) => {
            const localTime = new Date(date.getTime() - (timezoneOffset * 60 * 1000));
            const datePart = localTime.toISOString().split('T')[0];
            const hour = localTime.getUTCHours().toString().padStart(2, '0');
            return `${datePart} ${hour}:00`;
        };

        // Compute metrics
        let todayRevenue = 0, todayCost = 0, todayCount = 0;
        let weekRevenue = 0, weekCost = 0, weekCount = 0;
        let monthRevenue = 0, monthCost = 0, monthCount = 0;

        let prevTodayRevenue = 0, prevTodayCost = 0;
        let prevWeekRevenue = 0, prevWeekCost = 0;
        let prevMonthRevenue = 0, prevMonthCost = 0;

        // For time-series chart
        const chartMap = new Map();

        // 1. Initialize chart buckets based on selected range
        if (range === 'day') {
            // 24 hourly buckets
            for (let i = 23; i >= 0; i--) {
                const d = new Date(now.getTime() - (i * 60 * 60 * 1000));
                const hourStr = getLocalDateHourString(d);
                const localTime = new Date(d.getTime() - (timezoneOffset * 60 * 1000));
                const h = localTime.getUTCHours();
                const displayLabel = h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
                chartMap.set(hourStr, { label: displayLabel, revenue: 0, cost: 0, gain: 0, salesCount: 0 });
            }
        } else if (range === 'week') {
            // 7 daily buckets
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(localNow.getTime() - (i * 24 * 60 * 60 * 1000));
                const dateStr = d.toISOString().split('T')[0];
                const displayLabel = days[d.getUTCDay()];
                chartMap.set(dateStr, { label: displayLabel, date: dateStr, revenue: 0, cost: 0, gain: 0, salesCount: 0 });
            }
        } else if (range === 'month') {
            // 30 daily buckets
            for (let i = 29; i >= 0; i--) {
                const d = new Date(localNow.getTime() - (i * 24 * 60 * 60 * 1000));
                const dateStr = d.toISOString().split('T')[0];
                const displayLabel = d.getUTCDate().toString() + ' ' + d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
                chartMap.set(dateStr, { label: displayLabel, date: dateStr, revenue: 0, cost: 0, gain: 0, salesCount: 0 });
            }
        }

        // Determine range start for breakdown filtering
        let startBoundary = last7dStartUtc;
        if (range === 'day') startBoundary = last24hStart;
        else if (range === 'month') startBoundary = last30dStartUtc;

        // 2. Loop through all sales and aggregate metrics
        sales.forEach(sale => {
            const saleCostPrice = getSaleCostPrice(sale);
            const saleCost = saleCostPrice * sale.quantitySold;
            const saleGain = sale.totalAmount - saleCost;
            const saleDateStr = getLocalDateString(sale.soldAt);
            const saleHourStr = getLocalDateHourString(sale.soldAt);

            // Today's metrics (today starts at 00:00 local time)
            if (saleDateStr === todayStr) {
                todayRevenue += sale.totalAmount;
                todayCost += saleCost;
                todayCount += 1;
            } else {
                // Yesterday's metrics for comparison
                const yesterday = new Date(localNow.getTime() - (24 * 60 * 60 * 1000));
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                if (saleDateStr === yesterdayStr) {
                    prevTodayRevenue += sale.totalAmount;
                    prevTodayCost += saleCost;
                }
            }

            // Weekly metrics (last 7 days)
            if (sale.soldAt >= last7dStartUtc) {
                weekRevenue += sale.totalAmount;
                weekCost += saleCost;
                weekCount += 1;
            } else if (sale.soldAt >= prevLast7dStartUtc && sale.soldAt < last7dStartUtc) {
                // Previous week metrics for comparison
                prevWeekRevenue += sale.totalAmount;
                prevWeekCost += saleCost;
            }

            // Monthly metrics (last 30 days)
            if (sale.soldAt >= last30dStartUtc) {
                monthRevenue += sale.totalAmount;
                monthCost += saleCost;
                monthCount += 1;
            } else if (sale.soldAt >= prevLast30dStartUtc && sale.soldAt < last30dStartUtc) {
                // Previous month metrics for comparison
                prevMonthRevenue += sale.totalAmount;
                prevMonthCost += saleCost;
            }

            // Aggregation for the current chart selection
            if (range === 'day') {
                if (chartMap.has(saleHourStr)) {
                    const bucket = chartMap.get(saleHourStr);
                    bucket.revenue += sale.totalAmount;
                    bucket.cost += saleCost;
                    bucket.gain += saleGain;
                    bucket.salesCount += 1;
                }
            } else if (range === 'week' || range === 'month') {
                if (chartMap.has(saleDateStr)) {
                    const bucket = chartMap.get(saleDateStr);
                    bucket.revenue += sale.totalAmount;
                    bucket.cost += saleCost;
                    bucket.gain += saleGain;
                    bucket.salesCount += 1;
                }
            }
        });

        // Convert chartMap to flat array
        const chartData = Array.from(chartMap.values());

        // Calculate gains (profits)
        const todayGain = todayRevenue - todayCost;
        const weekGain = weekRevenue - weekCost;
        const monthGain = monthRevenue - monthCost;

        const prevTodayGain = prevTodayRevenue - prevTodayCost;
        const prevWeekGain = prevWeekRevenue - prevWeekCost;
        const prevMonthGain = prevMonthRevenue - prevMonthCost;

        // Calculate percentages
        const calculateChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        // Determine current vs previous stats based on active range
        let selectedRevenue = 0, selectedCost = 0, selectedGain = 0, selectedCount = 0;
        let prevRevenue = 0, prevGain = 0;
        
        if (range === 'day') {
            selectedRevenue = todayRevenue;
            selectedCost = todayCost;
            selectedGain = todayGain;
            selectedCount = todayCount;
            prevRevenue = prevTodayRevenue;
            prevGain = prevTodayGain;
        } else if (range === 'week') {
            selectedRevenue = weekRevenue;
            selectedCost = weekCost;
            selectedGain = weekGain;
            selectedCount = weekCount;
            prevRevenue = prevWeekRevenue;
            prevGain = prevWeekGain;
        } else if (range === 'month') {
            selectedRevenue = monthRevenue;
            selectedCost = monthCost;
            selectedGain = monthGain;
            selectedCount = monthCount;
            prevRevenue = prevMonthRevenue;
            prevGain = prevMonthGain;
        }

        const revenueChangePercent = calculateChange(selectedRevenue, prevRevenue);
        const gainChangePercent = calculateChange(selectedGain, prevGain);

        // 3. Compute top selling products and margins for the selected range
        const productMap = new Map();
        sales.forEach(sale => {
            if (sale.soldAt >= startBoundary) {
                const saleCostPrice = getSaleCostPrice(sale);
                const saleCost = saleCostPrice * sale.quantitySold;
                const saleGain = sale.totalAmount - saleCost;
                
                if (!productMap.has(sale.productId)) {
                    productMap.set(sale.productId, {
                        productId: sale.productId,
                        productName: sale.productName || (sale.product ? sale.product.name : 'Unknown Product'),
                        quantitySold: 0,
                        revenue: 0,
                        cost: 0,
                        gain: 0,
                        unitPrice: sale.unitPrice,
                        costPrice: saleCostPrice,
                        image: sale.product ? sale.product.image : null,
                        unit: sale.product ? sale.product.unit : 'pcs'
                    });
                }
                
                const prodStats = productMap.get(sale.productId);
                prodStats.quantitySold += sale.quantitySold;
                prodStats.revenue += sale.totalAmount;
                prodStats.cost += saleCost;
                prodStats.gain += saleGain;
            }
        });

        const productBreakdown = Array.from(productMap.values()).map(p => {
            const margin = p.revenue > 0 ? Math.round((p.gain / p.revenue) * 100) : 0;
            return {
                ...p,
                margin
            };
        }).sort((a, b) => b.gain - a.gain); // Sort by highest net gain/profit

        res.json({
            range,
            summary: {
                today: { revenue: todayRevenue, cost: todayCost, gain: todayGain, salesCount: todayCount },
                weekly: { revenue: weekRevenue, cost: weekCost, gain: weekGain, salesCount: weekCount },
                monthly: { revenue: monthRevenue, cost: monthCost, gain: monthGain, salesCount: monthCount }
            },
            currentPeriod: {
                revenue: selectedRevenue,
                cost: selectedCost,
                gain: selectedGain,
                salesCount: selectedCount,
                revenueChangePercent,
                gainChangePercent
            },
            chartData,
            productBreakdown
        });

    } catch (err) {
        console.error('Get analytics metrics error:', err.message);
        res.status(500).json({ error: 'Failed to load analytics data' });
    }
});

module.exports = router;