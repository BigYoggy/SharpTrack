const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const userId = 'cmqh0kbsr0000ipprfuiixkz5';
    console.log(`Checking user with ID: ${userId}`);
    
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            console.log('User not found in database!');
            const allUsers = await prisma.user.findMany({ take: 5 });
            console.log('Sample users in DB:', allUsers);
            return;
        }
        
        console.log('User found:', user);
        
        console.log('Toggling user status...');
        const nextStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
        
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { status: nextStatus }
        });
        console.log('User status updated successfully in DB:', updated);

        console.log('Creating activity log...');
        const log = await prisma.activityLog.create({
            data: {
                userId: userId,
                action: 'User status change',
                details: `Super Admin toggled merchant status to ${nextStatus}`
            }
        });
        console.log('Activity log created successfully:', log);

    } catch (err) {
        console.error('CRITICAL ERROR DURING DB OPERATION:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
