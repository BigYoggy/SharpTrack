require('dotenv').config();
const tidb = require('../services/tidb');

async function testConnection() {
    try {
        console.log("Connecting to TiDB and initializing table...");
        await tidb.initTable();
        console.log("Table Product created or exists.");
        
        const count = await tidb.countAllProducts();
        console.log("Current total products:", count);
        
        console.log("SUCCESS!");
        process.exit(0);
    } catch (e) {
        console.error("FAILED to connect or run query:", e);
        process.exit(1);
    }
}

testConnection();
