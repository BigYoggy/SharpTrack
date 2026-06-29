const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const virtualConsole = new VirtualConsole();
virtualConsole.on("error", (err) => {
  console.log("JS ERROR:", err);
});
virtualConsole.on("jsdomError", (err) => {
  console.log("JSDOM ERROR:", err);
});
virtualConsole.on("log", (log) => {
  console.log("LOG:", log);
});

let html = fs.readFileSync(path.join(__dirname, '../add-stock.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

// Inject app.js right before the first script
html = html.replace('<script src="js/app.js"></script>', `<script>${appJs}</script>`);

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    virtualConsole,
    url: "http://localhost/"
});

setTimeout(() => {
    try {
        dom.window.showBulkProducts();
        console.log("showBulkProducts() executed fine.");
        console.log("bulkProductsMode class:", dom.window.document.getElementById('bulkProductsMode').className);
        console.log("bulkItemsList innerHTML length:", dom.window.document.getElementById('bulkItemsList').innerHTML.length);
    } catch (e) {
        console.log("Error running showBulkProducts:", e.stack);
    }
}, 500);
