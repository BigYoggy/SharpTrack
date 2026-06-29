require('dotenv').config();
const tidb = require('./services/tidb');

async function test() {
    try {
        console.log('Testing tidb.countAllProducts...');
        const result = await tidb.countAllProducts();
        console.log('Result:', result);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

test();
