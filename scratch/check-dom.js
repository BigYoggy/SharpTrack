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

const html = fs.readFileSync(path.join(__dirname, '../add-stock.html'), 'utf8');

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    virtualConsole,
    url: "http://localhost/"
});

setTimeout(() => {
    try {
        dom.window.showBulkProducts();
        console.log("showBulkProducts() executed fine.");
    } catch (e) {
        console.log("Error running showBulkProducts:", e.message);
    }
}, 500);
