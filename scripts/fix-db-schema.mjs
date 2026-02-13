import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Checking database schema...\n');

    // Check which columns exist on the User table
    const columns = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'User' 
    ORDER BY ordinal_position
  `;

    const existingCols = columns.map(c => c.column_name);
    console.log('Existing User columns:', existingCols.join(', '));

    // Add missing columns
    const fixes = [];

    if (!existingCols.includes('role')) {
        console.log('\n➕ Adding "role" column...');
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER'`);
        fixes.push('role');
    }

    if (!existingCols.includes('createdAt')) {
        console.log('\n➕ Adding "createdAt" column...');
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        fixes.push('createdAt');
    }

    if (!existingCols.includes('updatedAt')) {
        console.log('\n➕ Adding "updatedAt" column...');
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        fixes.push('updatedAt');
    }

    if (!existingCols.includes('password')) {
        console.log('\n➕ Adding "password" column...');
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "password" TEXT`);
        fixes.push('password');
    }

    if (!existingCols.includes('settings')) {
        console.log('\n➕ Adding "settings" column...');
        await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "settings" JSONB`);
        fixes.push('settings');
    }

    if (fixes.length === 0) {
        console.log('\n✅ All columns already exist. No changes needed.');
    } else {
        console.log(`\n✅ Added ${fixes.length} missing column(s): ${fixes.join(', ')}`);
    }

    // Verify
    const verify = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'User' 
    ORDER BY ordinal_position
  `;
    console.log('\nFinal User columns:', verify.map(c => c.column_name).join(', '));
}

main()
    .catch(e => {
        console.error('❌ Error:', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
