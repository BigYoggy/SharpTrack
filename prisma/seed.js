const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    console.log('Starting database seeding...');

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        console.error('CRITICAL ERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.');
        process.exit(1);
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // 1. Seed SUPER_ADMIN
    console.log(`Seeding Admin: ${email}`);
    const admin = await prisma.admin.upsert({
        where: { email },
        update: { passwordHash },
        create: {
            email,
            passwordHash,
            role: 'SUPER_ADMIN'
        }
    });
    console.log('Admin account upserted successfully.');

    // 2. Seed Default Categories
    const categories = [
        'Beverages & Dairy',
        'Packaged Foods',
        'Bakery & Snacks',
        'Alcoholic Drinks',
        'Baking & Cooking',
        'Personal Care',
        'Household Items',
        'Stationery & Office'
    ];

    console.log('Seeding categories...');
    for (const catName of categories) {
        await prisma.category.upsert({
            where: { name: catName },
            update: {},
            create: { name: catName }
        });
    }
    console.log('Categories seeded.');

    // 3. Seed System Merchant (for products managed directly by Admin)
    console.log('Seeding System Merchant...');
    const systemUser = await prisma.user.upsert({
        where: { phone: '0000000000' },
        update: {},
        create: {
            name: 'System Merchant',
            phone: '0000000000',
            password: passwordHash,
            email: 'system@sharptrack.com.ng',
            storeName: 'System Catalog',
            onboardingCompleted: true,
            status: 'Active'
        }
    });

    // 4. Seed initial mock merchants if the User table only contains the system merchant
    const userCount = await prisma.user.count();
    if (userCount <= 1) {
        console.log('Seeding mock users, products, sales, notifications, activity logs and ingestion items for testing...');

        // Mock users
        const u1 = await prisma.user.create({
            data: {
                name: 'Chukwudi Okafor',
                phone: '2348031112222',
                email: 'chukwudi@okaforshop.com',
                password: passwordHash,
                storeName: 'Chukwudi Provisions',
                onboardingCompleted: true,
                status: 'Active'
            }
        });

        const u2 = await prisma.user.create({
            data: {
                name: 'Amina Bello',
                phone: '2348123334444',
                email: 'amina@abujaspice.ng',
                password: passwordHash,
                storeName: 'Abuja Spice Hub',
                onboardingCompleted: true,
                status: 'Active'
            }
        });

        const u3 = await prisma.user.create({
            data: {
                name: 'Nnamdi Azikiwe',
                phone: '2347087778888',
                email: 'nnamdi@zikstationery.net',
                password: passwordHash,
                storeName: 'Zik Stationery',
                onboardingCompleted: true,
                status: 'Suspended'
            }
        });

        // Mock Products
        const p1 = await prisma.product.create({
            data: {
                name: 'Peak Milk Powder',
                sellingPrice: 1200.0,
                quantity: 45,
                reorderLevel: 10,
                unit: 'tins',
                userId: u1.id,
                barcode: '037000000213',
                brand: 'FrieslandCampina',
                category: { connect: { name: 'Beverages & Dairy' } },
                specifications: '400g Refill Tin',
                image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=100&auto=format&fit=crop&q=60'
            }
        });

        const p2 = await prisma.product.create({
            data: {
                name: 'Indomie Instant Noodles Onion Flavor',
                sellingPrice: 180.0,
                quantity: 120,
                reorderLevel: 20,
                unit: 'packs',
                userId: u1.id,
                barcode: '6151100020126',
                brand: 'Dufil Prima Foods',
                category: { connect: { name: 'Packaged Foods' } },
                specifications: '70g Pack of 40',
                image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=100&auto=format&fit=crop&q=60'
            }
        });

        const p3 = await prisma.product.create({
            data: {
                name: 'Coca Cola Pet Bottle',
                sellingPrice: 250.0,
                quantity: 80,
                reorderLevel: 15,
                unit: 'bottles',
                userId: u2.id,
                barcode: '5449000000996',
                brand: 'Coca-Cola Hellenic',
                category: { connect: { name: 'Beverages & Dairy' } },
                specifications: '50cl Pack of 12',
                image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=100&auto=format&fit=crop&q=60'
            }
        });

        const p4 = await prisma.product.create({
            data: {
                name: 'Guinness Foreign Extra Stout',
                sellingPrice: 450.0,
                quantity: 4, // low stock!
                reorderLevel: 10,
                unit: 'bottles',
                userId: u2.id,
                barcode: '6151101511210',
                brand: 'Guinness Nigeria PLC',
                category: { connect: { name: 'Alcoholic Drinks' } },
                specifications: '45cl Returnable Bottle',
                image: 'https://images.unsplash.com/photo-1608270176050-12ec057de8f1?w=100&auto=format&fit=crop&q=60'
            }
        });

        // Mock Sales
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        await prisma.sale.create({
            data: { quantitySold: 5, totalAmount: 6000.0, paymentMethod: 'cash', productId: p1.id, userId: u1.id, productName: p1.name, unitPrice: p1.sellingPrice, soldAt: today }
        });
        await prisma.sale.create({
            data: { quantitySold: 10, totalAmount: 1800.0, paymentMethod: 'pos', productId: p2.id, userId: u1.id, productName: p2.name, unitPrice: p2.sellingPrice, soldAt: today }
        });
        await prisma.sale.create({
            data: { quantitySold: 12, totalAmount: 3000.0, paymentMethod: 'transfer', productId: p3.id, userId: u2.id, productName: p3.name, unitPrice: p3.sellingPrice, soldAt: yesterday }
        });
        await prisma.sale.create({
            data: { quantitySold: 8, totalAmount: 3600.0, paymentMethod: 'cash', productId: p4.id, userId: u2.id, productName: p4.name, unitPrice: p4.sellingPrice, soldAt: twoDaysAgo }
        });

        // Mock Activity Logs
        await prisma.activityLog.create({
            data: { userId: u1.id, action: 'store_created', details: 'Merchant initialized store Chukwudi Provisions', createdAt: twoDaysAgo }
        });
        await prisma.activityLog.create({
            data: { userId: u2.id, action: 'profile_updated', details: 'Merchant updated profile info for Abuja Spice Hub', createdAt: yesterday }
        });
        await prisma.activityLog.create({
            data: { userId: u3.id, action: 'login_failure', details: 'Repeated PIN errors recorded on device', createdAt: today }
        });

        // Mock Ingestion Queue Items
        await prisma.ingestionItem.createMany({
            data: [
                { name: 'Sardines in Vegetable Oil', barcode: '6151100099882', brand: 'Titus', category: 'Packaged Foods', spec: '125g Can', source: 'Web Scraper: Jumia Nigeria', status: 'review', reason: 'Unverified manufacturer matching', userId: u1.id },
                { name: 'Close Up Deep Action Toothpaste', barcode: '6151100288210', brand: 'Unilever Nigeria', category: 'Personal Care', spec: '140g Tube', source: 'Web Scraper: Konga', status: 'review', reason: 'Alternative categorization flag', userId: u1.id },
                { name: 'St. Louis Sugar Cube', barcode: '3221100055420', brand: 'Saint Louis', category: 'Baking & Cooking', spec: '500g Carton', source: 'Partner API sync', status: 'review', reason: 'High weight variance check', userId: u1.id },
                { name: 'Hollandia Evap Milk', barcode: '6151100344008', brand: 'CHI Limited', category: 'Beverages & Dairy', spec: '120g Pack', source: 'API Bulk Sync', status: 'imported', userId: u1.id },
                { name: 'Peak Full Cream Milk powder (Tin)', barcode: '037000000213', brand: 'Peak Milk', category: 'Beverages & Dairy', spec: '400g', source: 'Jumia Scraper Sync', status: 'duplicate', duplicateOfId: p1.id, userId: u1.id },
                { name: 'Nivea Men Shower Gel', barcode: '', brand: 'Beiersdorf', category: 'Personal Care', source: 'Scan Stream API', status: 'failed', error: 'Missing barcode (EAN required)', userId: u1.id }
            ]
        });

        console.log('Mock database records seeded successfully.');
    }

    console.log('Database seeding completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
