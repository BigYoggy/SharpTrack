const fs = require('fs');
const html = fs.readFileSync('add-stock.html', 'utf8');

const openDivs = (html.match(/<div\b[^>]*>/g) || []).length;
const closeDivs = (html.match(/<\/div>/g) || []).length;

console.log(`Open divs: ${openDivs}, Closed divs: ${closeDivs}`);

if (openDivs !== closeDivs) {
    console.log(`WARNING: Mismatch! Open: ${openDivs}, Close: ${closeDivs}`);
} else {
    console.log("SUCCESS: All divs matched.");
}
