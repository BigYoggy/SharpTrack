const fs = require('fs');
let html = fs.readFileSync('add-stock.html', 'utf8');

// The goal is to remove the <div id="bulkStep1">, <div id="bulkStep2">, <div id="bulkStep3"> wrappers
// and just keep their contents.

// Step 1: Remove `<div id="bulkStep1">` and its matching `</div>` which is right before `<!-- STEP 2: ADD ITEMS -->`
html = html.replace(/<!-- STEP 1: CAPTURE -->\s*<div id="bulkStep1">/, '<!-- STEP 1: CAPTURE -->\n            <div class="bulk-capture-section">');

html = html.replace(/<\/div>\s*<!-- STEP 2: ADD ITEMS -->/, '</div>\n\n            <!-- STEP 2: ADD ITEMS -->');

// Step 2: Remove `<div id="bulkStep2">` and its matching `</div>` which is right before `<!-- SAVE SECTION -->`
html = html.replace(/<!-- STEP 2: ADD ITEMS -->\s*<div id="bulkStep2">/, '<!-- STEP 2: ADD ITEMS -->\n            <div class="bulk-items-section">');

html = html.replace(/<\/div>\s*<!-- SAVE SECTION -->/, '</div>\n\n            <!-- SAVE SECTION -->');

// Step 3: Remove `<div id="bulkStep3">` and its matching `</div>`
html = html.replace(/<!-- SAVE SECTION -->\s*<div id="bulkStep3">/, '<!-- SAVE SECTION -->\n            <div class="bulk-save-section">');

html = html.replace(/<div style="height: 32px;"><\/div>\s*<\/div>\s*<\/div>\s*<!-- AI LOADING OVERLAY -->/, '<div style="height: 32px;"></div>\n            </div>\n        </div>\n\n        <!-- AI LOADING OVERLAY -->');

// Step 4: Remove any Javascript references to bulkStep1, bulkStep2, etc.
html = html.replace(/document\.getElementById\('bulkStep1'\)\?\.classList\.add\('hidden'\);/g, '');
html = html.replace(/if \(currentMode === 'bulk'\) document\.getElementById\('bulkStep1'\)\?\.classList\.remove\('hidden'\);/g, '');
html = html.replace(/let currentBulkStep = 1;/g, '');
html = html.replace(/currentBulkStep = 1;/g, '');
html = html.replace(/function goToStep\(step\) \{\s*currentBulkStep = step;\s*renderBulkItems\(\);\s*\}/g, '');
html = html.replace(/goToStep\(1\);/g, 'renderBulkItems();');

fs.writeFileSync('add-stock.html', html);
console.log("Refactor script executed!");
