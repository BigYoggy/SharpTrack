const fs = require('fs');
const html = fs.readFileSync('add-stock.html', 'utf8');

const regex = /<script>([\s\S]*?)<\/script>/g;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
    fs.writeFileSync(`temp_script_${count}.js`, match[1]);
    count++;
}
console.log(`Extracted ${count} scripts.`);
