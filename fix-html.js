const fs = require('fs');
let html = fs.readFileSync('add-stock.html', 'utf8');

const regex = /<button class="unit-tag active" onclick="selectUnit\(this, 'pieces'\)">Pieces<\/button>[\s\S]*?<div id="bulkProductsMode"/;

const replacement = `<button class="unit-tag active" onclick="selectUnit(this, 'pieces')">Pieces</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'cartons')">Cartons</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'bags')">Bags</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'packs')">Packs</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'crates')">Crates</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'kg')">Kg</button>
                            <button class="unit-tag" onclick="selectUnit(this, 'litres')">Litres</button>
                        </div>
                    </div>
                </div>

                <button class="btn btn-primary btn-block btn-lg" id="submitBtn" onclick="handleSubmit()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Save Product
                </button>
            </div>
        </div>

        <!-- ═══════════════════════════════════
             BULK PRODUCTS MODE
             ═══════════════════════════════════ -->
        <div id="bulkProductsMode"`;

if (regex.test(html)) {
    html = html.replace(regex, replacement);
    fs.writeFileSync('add-stock.html', html);
    console.log("Fixed successfully!");
} else {
    console.log("Target not found!");
}
