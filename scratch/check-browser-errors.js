const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.log('PAGE ERROR:', error.message);
    });

    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });

    try {
        const fileUrl = 'file:///' + path.resolve(__dirname, '../add-stock.html').replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 5000 });
        
        // Wait for page to be ready
        await page.evaluate(() => {
            if (typeof showBulkProducts === 'function') {
                try {
                    showBulkProducts();
                    console.log('showBulkProducts executed');
                } catch (e) {
                    console.error('showBulkProducts error:', e.message);
                }
            } else {
                console.error('showBulkProducts is not defined!');
            }
        });
        
    } catch (e) {
        console.log("Execution failed:", e.message);
    }
    
    await browser.close();
})();
