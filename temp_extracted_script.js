
        if (!initPage('add-stock')) { /* redirected */ }
        else {
            injectNavbar();
            injectBottomNav('inventory');
            loadCategories();
        }

        const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? ''
            : 'https://sharptrack-api.onrender.com';

        let selectedUnit = 'pieces';
        let html5Qrcode = null;
        let aiImageBase64 = null;
        let bulkImageBase64 = null;
        let cropper = null;
        let activeCropMode = 'manual';
        let currentMode = 'selection'; // 'selection', 'single', 'bulk'
        let currentBulkStep = 1;
        let bulkItems = [];

        // ── MODE SWITCHING ──
        function showModeSelection() {
            currentMode = 'selection';
            document.getElementById('modeSelection').classList.remove('hidden');
            document.getElementById('singleProductMode').classList.add('hidden');
            document.getElementById('bulkProductsMode').classList.add('hidden');
        }

        function showSingleProduct() {
            currentMode = 'single';
            document.getElementById('modeSelection').classList.add('hidden');
            document.getElementById('singleProductMode').classList.remove('hidden');
            document.getElementById('bulkProductsMode').classList.add('hidden');
        }

        function showBulkProducts() {
            currentMode = 'bulk';
            currentBulkStep = 1;
            document.getElementById('modeSelection').classList.add('hidden');
            document.getElementById('singleProductMode').classList.add('hidden');
            document.getElementById('bulkProductsMode').classList.remove('hidden');
            if (bulkItems.length === 0) addBulkItem();
            goToStep(1);
        }

        function goBack() {
            if (!document.getElementById('scannerSection').classList.contains('hidden')) {
                stopBarcodeScanner();
            } else if (currentMode === 'single' || currentMode === 'bulk') {
                showModeSelection();
            } else {
                history.back();
            }
        }

        // ── BULK WIZARD STEPS ──
        function goToStep(step) {
            currentBulkStep = step;
            renderBulkItems();
        }

        // ── BULK ITEMS MANAGEMENT ──
        function addBulkItem(name, costPrice, sellingPrice, qty, brand, specifications, categoryName, image) {
            bulkItems.push({ 
                name: name || '', 
                costPrice: costPrice || '', 
                sellingPrice: sellingPrice || '', 
                quantity: qty || '' 
            });
            renderBulkItems();
        }

        function removeBulkItem(index) {
            bulkItems.splice(index, 1);
            if (bulkItems.length === 0) addBulkItem();
            else renderBulkItems();
        }

        function updateBulkItem(index, field, value) {
            if (bulkItems[index]) bulkItems[index][field] = value;
        }

        function renderBulkItems() {
            const container = document.getElementById('bulkItemsList');
            const catOptions = '<option value="">Category</option>' + (typeof categoryList !== 'undefined' ? categoryList : []).map(c => `<option value="${c}">${c}</option>`).join('');

            container.innerHTML = bulkItems.map((item, i) => `
                <div class="bulk-item-row" style="flex-wrap: wrap; padding-bottom: 16px;">
                    <div style="display:flex; width:100%; gap: 12px; align-items:center;">
                        <div class="drag-handle">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>
                        </div>
                        <div class="tag-icon" id="bulk-img-${i}">
                            ${item.image ? `<img src="${item.image}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`}
                        </div>
                        <input type="text" class="item-name" placeholder="Product name" value="${item.name}" oninput="updateBulkItem(${i},'name',this.value); debounceGlobalSearch(${i}, this.value)">
                        <div class="bulk-field-group cost-group">
                            <label>Cost (₦)</label>
                            <input type="number" placeholder="0" value="${item.costPrice}" oninput="updateBulkItem(${i},'costPrice',this.value)">
                        </div>
                        <div class="bulk-field-group sell-group">
                            <label>Sell (₦)</label>
                            <input type="number" placeholder="0" value="${item.sellingPrice}" oninput="updateBulkItem(${i},'sellingPrice',this.value)">
                        </div>
                        <div class="bulk-field-group qty-group">
                            <label>Quantity</label>
                            <input type="number" placeholder="0" value="${item.quantity}" oninput="updateBulkItem(${i},'quantity',this.value)">
                        </div>
                        <button class="bulk-delete-btn" onclick="removeBulkItem(${i})">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <div style="display:flex; width:100%; gap: 12px; padding-left: 36px; margin-top: 8px;">
                        <input type="text" id="bulk-brand-${i}" placeholder="Brand" value="${item.brand || ''}" oninput="updateBulkItem(${i},'brand',this.value)" style="flex:1; padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px;">
                        <input type="text" id="bulk-spec-${i}" placeholder="Size (e.g. 50cl)" value="${item.specifications || ''}" oninput="updateBulkItem(${i},'specifications',this.value)" style="flex:1; padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px;">
                        <select id="bulk-cat-${i}" onchange="updateBulkItem(${i},'categoryName',this.value)" style="flex:1; padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px;">
                            ${catOptions.replace(`value="${item.categoryName || ''}"`, `value="${item.categoryName || ''}" selected`)}
                        </select>
                    </div>
                </div>
            `).join('');
        }

        let globalSearchTimeout = null;
        async function debounceGlobalSearch(index, query) {
            if (!query || query.length < 3) return;
            clearTimeout(globalSearchTimeout);
            globalSearchTimeout = setTimeout(async () => {
                try {
                    const res = await apiRequest(`/api/products/search-global?q=${encodeURIComponent(query)}`);
                    if (res.products && res.products.length > 0) {
                        const match = res.products[0]; 
                        const item = bulkItems[index];
                        
                        if (!item.brand && match.brand) { 
                            item.brand = match.brand; 
                            document.getElementById(`bulk-brand-${index}`).value = match.brand;
                        }
                        if (!item.specifications && match.specifications) { 
                            item.specifications = match.specifications; 
                            document.getElementById(`bulk-spec-${index}`).value = match.specifications;
                        }
                        if (!item.categoryName && match.category && match.category.name) { 
                            item.categoryName = match.category.name; 
                            document.getElementById(`bulk-cat-${index}`).value = match.category.name;
                        }
                        if (!item.image && match.image) { 
                            item.image = match.image; 
                            document.getElementById(`bulk-img-${index}`).innerHTML = `<img src="${match.image}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">`;
                        }
                    }
                } catch (e) {
                    console.error('Global search error:', e);
                }
            }, 600);
        }

        function renderReviewTable() {
            const body = document.getElementById('reviewTableBody');
            let totalItems = 0;
            let totalValue = 0;

            body.innerHTML = bulkItems.filter(it => it.name.trim()).map(item => {
                const price = parseFloat(item.price) || 0;
                const qty = parseInt(item.quantity) || 0;
                const total = price * qty;
                totalItems++;
                totalValue += total;
                return `<tr><td>${item.name}</td><td>${price.toLocaleString()}</td><td>${qty}</td><td>${total.toLocaleString()}</td></tr>`;
            }).join('');

            document.getElementById('reviewTotalItems').textContent = totalItems;
            document.getElementById('reviewTotalValue').textContent = '₦' + totalValue.toLocaleString();
        }

        // ── UNIT LOGIC ──
        const CATEGORY_UNIT_MAP = {
            'beverage':'litres','beverages':'litres','soft drink':'litres','soda':'litres',
            'juice':'litres','water':'litres','wine':'litres','cooking oil':'litres','oil':'litres',
            'drinks':'crates','beer':'crates','malt':'crates',
            'rice':'bags','grains':'bags','flour':'bags','sugar':'bags','cement':'bags','feed':'bags',
            'groceries':'packs','grocery':'packs','snacks':'packs','noodles':'packs','pasta':'packs',
            'seasoning':'packs','detergent':'packs','cleaning':'packs','toiletries':'packs','soap':'packs',
            'meat':'kg','fish':'kg','produce':'kg','vegetable':'kg','fruit':'kg','frozen':'kg',
            'electronics':'pieces','phones':'pieces','dairy':'pieces','milk':'pieces','canned':'pieces',
            'carton':'cartons','wholesale':'cartons',
        };

        function getUnitForCategory(category) {
            if (!category) return null;
            const n = category.toLowerCase().trim();
            if (CATEGORY_UNIT_MAP[n]) return CATEGORY_UNIT_MAP[n];
            for (const [alias, unit] of Object.entries(CATEGORY_UNIT_MAP)) {
                if (n.includes(alias) || alias.includes(n)) return unit;
            }
            return null;
        }

        function autoSelectUnit(unitName) {
            if (!unitName) return;
            const normalized = unitName.toLowerCase();
            const unitBtns = document.querySelectorAll('.unit-tag');
            for (const btn of unitBtns) {
                if (btn.textContent.trim().toLowerCase() === normalized) {
                    selectUnit(btn, normalized); return;
                }
            }
        }

        function selectUnit(el, unit) {
            selectedUnit = unit;
            document.querySelectorAll('.unit-tag').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
        }

        // ── CATEGORY DROPDOWN ──
        let categoryList = [];

        async function loadCategories() {
            try {
                const res = await apiRequest('/api/products/categories');
                categoryList = res.categories || [];
                renderCategories(categoryList);
            } catch (err) { console.error("Failed to load categories:", err); }
        }

        function renderCategories(list) {
            const container = document.getElementById('categoryOptions');
            if (list.length === 0) {
                container.innerHTML = '<div class="custom-dropdown-item" style="color:var(--muted)">No categories found</div>';
                return;
            }
            container.innerHTML = list.map(c => `<div class="custom-dropdown-item" onclick="selectCategory('${c}', event)">${c}</div>`).join('');
        }

        function toggleDropdown() { document.getElementById('categoryDropdown').classList.toggle('open'); }

        function selectCategory(catName, e) {
            if(e) e.stopPropagation();
            document.getElementById('categoryName').value = catName;
            document.getElementById('categorySelected').innerText = catName;
            document.getElementById('categorySelected').classList.remove('placeholder-text');
            document.getElementById('categoryDropdown').classList.remove('open');
        }

        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('categoryDropdown');
            if (dropdown && !dropdown.contains(e.target)) dropdown.classList.remove('open');
        });

        // ── CROPPER LOGIC ──
        async function initCrop(event, mode) {
            const file = event.target.files[0];
            if (!file) return;
            activeCropMode = mode;
            const base64Str = await convertFileToBase64(file);
            document.getElementById('cropperModal').classList.remove('hidden');
            const image = document.getElementById('cropperImage');
            image.src = base64Str;
            if (cropper) cropper.destroy();
            cropper = new Cropper(image, {
                aspectRatio: (mode === 'receipt') ? NaN : 1,
                viewMode: 1, autoCropArea: 0.8, background: false
            });
            event.target.value = '';
        }

        function cancelCrop() {
            if (cropper) cropper.destroy();
            document.getElementById('cropperModal').classList.add('hidden');
        }

        function confirmCrop() {
            if (!cropper) return;
            const canvas = cropper.getCroppedCanvas({ width: 500, height: 500 });
            const croppedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            cancelCrop();

            if (activeCropMode === 'manual') {
                setPreviewImage(croppedBase64);
            } else if (activeCropMode === 'ai') {
                setPreviewImage(croppedBase64);
                processAIImage(croppedBase64);
            } else if (activeCropMode === 'bulk-manual') {
                setBulkPreviewImage(croppedBase64);
            } else if (activeCropMode === 'bulk-ai') {
                setBulkPreviewImage(croppedBase64);
                processBulkAIImage(croppedBase64);
            } else if (activeCropMode === 'receipt') {
                setBulkPreviewImage(croppedBase64);
                processReceiptImage(croppedBase64);
            }
        }

        // ── IMAGE HANDLING ──
        function setPreviewImage(base64Str) {
            aiImageBase64 = base64Str;
            const img = document.getElementById('imagePreview');
            const box = document.getElementById('imageBox');
            const placeholder = document.getElementById('imagePlaceholder');
            img.src = base64Str; img.classList.remove('hidden');
            placeholder.classList.add('hidden'); box.classList.add('has-image');
        }

        function setBulkPreviewImage(base64Str) {
            bulkImageBase64 = base64Str;
            const img = document.getElementById('bulkImagePreview');
            const box = document.getElementById('bulkImageBox');
            const placeholder = document.getElementById('bulkImagePlaceholder');
            img.src = base64Str; img.classList.remove('hidden');
            placeholder.classList.add('hidden'); box.classList.add('has-image');
        }

        function convertFileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
        }

        // ── BARCODE SCANNER ──
        function startBarcodeScanner() {
            document.getElementById('singleFormContainer')?.classList.add('hidden');
            document.getElementById('bulkStep1')?.classList.add('hidden');
            document.getElementById('scannerSection').classList.remove('hidden');
            if (!html5Qrcode) html5Qrcode = new Html5Qrcode("reader");
            html5Qrcode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                onScanSuccess, onScanFailure
            ).catch(err => {
                console.error("Camera error:", err);
                showToast('error', 'Camera Error', 'Could not access camera.');
                stopBarcodeScanner();
            });
        }

        function stopBarcodeScanner() {
            if (html5Qrcode && html5Qrcode.isScanning) {
                html5Qrcode.stop().then(() => html5Qrcode.clear()).catch(err => console.error(err));
            }
            document.getElementById('scannerSection').classList.add('hidden');
            if (currentMode === 'single') document.getElementById('singleFormContainer')?.classList.remove('hidden');
            if (currentMode === 'bulk') document.getElementById('bulkStep1')?.classList.remove('hidden');
        }

        async function onScanSuccess(decodedText) {
            stopBarcodeScanner();
            if (currentMode === 'single') {
                document.getElementById('barcode').value = decodedText;
                lookupBarcode(decodedText);
            } else if (currentMode === 'bulk') {
                // Add as a new bulk item from barcode
                addBulkItem(decodedText, '', '', '');
                showToast('success', 'Barcode Scanned', `Added ${decodedText} to items list.`);
                goToStep(2);
            }
        }

        function onScanFailure(error) { /* Ignore */ }

        async function lookupBarcodeManual() {
            const val = document.getElementById('barcode').value.trim();
            if (!val) { showToast('warning', 'Barcode Missing', 'Enter a barcode to lookup.'); return; }
            lookupBarcode(val);
        }

        async function lookupBarcode(barcodeValue) {
            const lookupBtn = document.querySelector('.btn-lookup');
            const originalText = lookupBtn.innerText;
            lookupBtn.innerText = '...'; lookupBtn.disabled = true;
            showToast('info', 'Searching', 'Looking up product info...');
            try {
                const localRes = await fetch(`${API_BASE}/api/products/barcode/${barcodeValue}`, {
                    headers: { ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) }
                });
                if (localRes.ok) {
                    const localData = await localRes.json();
                    if (localData && localData.found) {
                        const p = localData.product;
                        if (p.name && !document.getElementById('productName').value) document.getElementById('productName').value = p.name;
                        if (p.brand && !document.getElementById('brand').value) document.getElementById('brand').value = p.brand;
                        if (p.weight && !document.getElementById('weight').value) document.getElementById('weight').value = p.weight;
                        if (p.category) {
                            const catField = document.getElementById('categoryName');
                            if (catField && catField.value.trim() === '') {
                                selectCategory(p.category);
                                if (!categoryList.includes(p.category)) { categoryList.push(p.category); renderCategories(categoryList); }
                            }
                        }
                        if (p.costPrice !== null && !document.getElementById('costPrice').value) document.getElementById('costPrice').value = p.costPrice;
                        if (p.sellingPrice !== null && !document.getElementById('sellingPrice').value) document.getElementById('sellingPrice').value = p.sellingPrice;
                        if (p.unit) autoSelectUnit(p.unit);
                        showToast('success', 'Found! 📦', 'Product details auto-filled.');
                        return;
                    }
                }
                const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcodeValue}.json`);
                const data = await res.json();
                if (data && data.product) {
                    const p = data.product;
                    if (p.product_name && !document.getElementById('productName').value) document.getElementById('productName').value = p.product_name;
                    if (p.brands && !document.getElementById('brand').value) document.getElementById('brand').value = p.brands.split(',')[0];
                    if (p.quantity && !document.getElementById('weight').value) document.getElementById('weight').value = p.quantity;
                    showToast('success', 'Found Globally!', 'Product details auto-filled.');
                } else {
                    showToast('warning', 'Not Found', 'No data found. Try AI Scan.');
                }
            } catch (err) {
                console.error("Barcode lookup failed:", err);
                showToast('error', 'Lookup Failed', 'Could not fetch product data.');
            } finally {
                lookupBtn.innerText = originalText; lookupBtn.disabled = false;
            }
        }

        // ── AI SCANNER (SINGLE) ──
        function setAIStatus(type, title, message) {
            const banner = document.getElementById('aiStatusBanner');
            const text = document.getElementById('aiStatusText');
            const badge = document.getElementById('aiBadge');
            if (type === 'hidden') { banner.classList.add('hidden'); if(badge) badge.classList.add('hidden'); return; }
            banner.className = `ai-status-banner ${type}`;
            text.innerHTML = `<strong>${title}:</strong> ${message}`;
            banner.classList.remove('hidden');
            if (badge) { badge.classList[type === 'success' || type === 'warning' ? 'remove' : 'add']('hidden'); }
        }

        async function processAIImage(base64Str) {
            const scanBtn = document.getElementById('aiScanBtn');
            const overlay = document.getElementById('aiLoadingOverlay');
            overlay.classList.remove('hidden');
            if (scanBtn) scanBtn.disabled = true;
            document.querySelectorAll('[data-ai-filled]').forEach(el => { el.removeAttribute('data-ai-filled'); el.classList.remove('ai-generated'); });
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                const response = await fetch(`${API_BASE}/api/scan-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) },
                    body: JSON.stringify({ imageBase64: base64Str, mimeType: "image/jpeg" }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const rawText = await response.text();
                let result; try { result = JSON.parse(rawText); } catch(e) {}
                if (!response.ok) throw new Error(result?.error || 'AI analysis failed');
                const data = result && (result.data || result);
                if (!data) throw new Error("No data from AI");
                const confidence = parseFloat(data.confidence) || 0;
                const fillIfEmpty = (id, val) => {
                    const field = document.getElementById(id);
                    if (val && field && field.value.trim() === '') { field.value = val; field.setAttribute('data-ai-filled','true'); field.classList.add('ai-generated'); }
                };
                if (confidence >= 0.5 && data.productName) {
                    fillIfEmpty('productName', data.productName);
                    fillIfEmpty('brand', data.brand);
                    fillIfEmpty('weight', data.weight);
                    fillIfEmpty('barcode', data.barcode);
                    if (data.category) {
                        const catField = document.getElementById('categoryName');
                        if (catField && catField.value.trim() === '') {
                            selectCategory(data.category);
                            if (!categoryList.includes(data.category)) { categoryList.push(data.category); renderCategories(categoryList); }
                            autoSelectUnit(getUnitForCategory(data.category));
                        }
                    }
                    setAIStatus(confidence >= 0.8 ? 'success' : 'warning', 'AI Scan', confidence >= 0.8 ? 'Product detected!' : 'Please verify info');
                } else {
                    setAIStatus('error', 'Low Confidence', 'Could not detect — fill manually');
                }
                saveScanRecord(base64Str, data, confidence);
            } catch (error) {
                console.error(error);
                showToast('error', 'AI Scan Failed', error.message);
                setAIStatus('hidden');
            } finally {
                overlay.classList.add('hidden');
                if (scanBtn) scanBtn.disabled = false;
            }
        }

        // ── AI SCANNER (BULK) ──
        async function processBulkAIImage(base64Str) {
            const overlay = document.getElementById('aiLoadingOverlay');
            overlay.classList.remove('hidden');
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                const response = await fetch(`${API_BASE}/api/scan-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) },
                    body: JSON.stringify({ imageBase64: base64Str, mimeType: "image/jpeg", mode: "bulk" }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const rawText = await response.text();
                let result; try { result = JSON.parse(rawText); } catch(e) {}
                if (!response.ok) throw new Error(result?.error || 'AI analysis failed');
                const data = result && (result.data || result);
                
                if (data && data.items && Array.isArray(data.items)) {
                    bulkItems = [];
                    data.items.forEach(item => {
                        addBulkItem(item.name || item.productName || '', item.costPrice || '', item.sellingPrice || item.price || '', item.quantity || item.qty || '', item.brand || '', item.specifications || '', item.category || '', item.image || '');
                    });
                    setBulkStatus('success', `AI detected ${data.items.length} products!`);
                    goToStep(2);
                } else if (data && data.productName) {
                    bulkItems = [];
                    addBulkItem(data.productName, data.costPrice || '', data.sellingPrice || '', data.quantity || '', data.brand || '', data.specifications || '', data.category || '', data.image || '');
                    setBulkStatus('success', 'AI detected product: ' + data.productName);
                    goToStep(2);
                } else {
                    setBulkStatus('warning', 'Could not detect products. Add items manually.');
                    goToStep(2);
                }
            } catch (error) {
                console.error(error);
                showToast('error', 'AI Scan Failed', error.message);
            } finally {
                overlay.classList.add('hidden');
            }
        }

        // ── RECEIPT SCANNER ──
        async function processReceiptImage(base64Str) {
            const overlay = document.getElementById('aiLoadingOverlay');
            overlay.classList.remove('hidden');
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 45000);
                const response = await fetch(`${API_BASE}/api/scan-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}) },
                    body: JSON.stringify({ imageBase64: base64Str, mimeType: "image/jpeg", mode: "receipt" }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const rawText = await response.text();
                let result; try { result = JSON.parse(rawText); } catch(e) {}
                if (!response.ok) throw new Error(result?.error || 'Receipt analysis failed');
                const data = result && (result.data || result);
                if (data && data.items && Array.isArray(data.items)) {
                    bulkItems = [];
                    data.items.forEach(item => {
                        addBulkItem(item.name || item.productName || '', item.costPrice || '', item.sellingPrice || item.price || '', item.quantity || item.qty || '', item.brand || '', item.specifications || '', item.category || '', item.image || '');
                    });
                    setBulkStatus('success', `Found ${data.items.length} items from receipt!`);
                    goToStep(2);
                } else if (data && data.productName) {
                    bulkItems = [];
                    addBulkItem(data.productName, data.costPrice || '', data.sellingPrice || '', data.quantity || '', data.brand || '', data.specifications || '', data.category || '', data.image || '');
                    setBulkStatus('success', 'Detected 1 item from receipt.');
                    goToStep(2);
                } else {
                    setBulkStatus('warning', 'Could not read receipt. Add items manually.');
                    goToStep(2);
                }
            } catch (error) {
                console.error(error);
                showToast('error', 'Receipt Scan Failed', error.message);
            } finally {
                overlay.classList.add('hidden');
            }
        }

        function setBulkStatus(type, message) {
            const banner = document.getElementById('bulkAiStatusBanner');
            const text = document.getElementById('bulkAiStatusText');
            banner.className = `ai-status-banner ${type}`;
            text.textContent = message;
            banner.classList.remove('hidden');
        }

        function saveScanRecord(imageBase64, aiOutput, confidence) {
            try {
                const record = { aiOutput, confidence, timestamp: Date.now(), imageSnippet: imageBase64.substring(0, 200) };
                const history = JSON.parse(localStorage.getItem('st_scan_history') || '[]');
                history.push(record);
                if (history.length > 50) history.shift();
                localStorage.setItem('st_scan_history', JSON.stringify(history));
            } catch (e) { console.warn('Could not save scan record:', e); }
        }

        // ── SUBMIT: SINGLE ──
        async function handleSubmit() {
            const name = document.getElementById('productName').value.trim();
            const sellingPrice = document.getElementById('sellingPrice').value;
            const costPrice = document.getElementById('costPrice').value;
            const quantity = document.getElementById('quantity').value;
            const reorderLevel = document.getElementById('reorderLevel').value || '5';
            const barcode = document.getElementById('barcode').value.trim();
            const brand = document.getElementById('brand').value.trim();
            const weight = document.getElementById('weight').value.trim();
            const categoryName = document.getElementById('categoryName').value.trim();
            const btn = document.getElementById('submitBtn');

            if (!name) { showToast('warning', 'Name Required', 'Enter a product name.'); return; }
            if (!costPrice || parseFloat(costPrice) < 0) { showToast('warning', 'Cost Price Required', 'Enter a valid cost price.'); return; }
            if (!sellingPrice || parseFloat(sellingPrice) <= 0) { showToast('warning', 'Selling Price Required', 'Enter a valid selling price.'); return; }
            if (!quantity || parseInt(quantity) < 0) { showToast('warning', 'Quantity Required', 'Enter the stock quantity.'); return; }

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Saving...';
            try {
                await apiRequest('/api/products', {
                    method: 'POST',
                    body: JSON.stringify({
                        name, sellingPrice: parseFloat(sellingPrice), costPrice: parseFloat(costPrice),
                        quantity: parseInt(quantity), reorderLevel: parseInt(reorderLevel),
                        unit: selectedUnit, barcode: barcode || null, brand: brand || null,
                        weight: weight || null, categoryName: categoryName || null, image: aiImageBase64 || null
                    })
                });
                showToast('success', 'Product Saved! 📦', `${name} has been added.`);
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                showToast('error', 'Failed', err.message);
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Save Product';
            }
        }

        // ── SUBMIT: BULK ──
        async function handleBulkSubmit() {
            const validItems = bulkItems.filter(it => it.name.trim() && parseFloat(it.sellingPrice) > 0 && parseInt(it.quantity) > 0);
            if (validItems.length === 0) {
                showToast('warning', 'No Items', 'Add at least one item with name, sell price, and quantity.');
                return;
            }

            const btn = document.getElementById('bulkSubmitBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Saving all items...';

            let saved = 0;
            let failed = 0;

            try {
                const promises = validItems.map(item =>
                    apiRequest('/api/products', {
                        method: 'POST',
                        body: JSON.stringify({
                            name: item.name.trim(),
                            sellingPrice: parseFloat(item.sellingPrice),
                            costPrice: parseFloat(item.costPrice) || (parseFloat(item.sellingPrice) * 0.7),
                            quantity: parseInt(item.quantity),
                            reorderLevel: 5,
                            unit: 'pieces',
                            brand: item.brand || null,
                            specifications: item.specifications || null,
                            categoryName: item.categoryName || null,
                            image: item.image || bulkImageBase64 || null
                        })
                    }).then(() => { saved++; }).catch(() => { failed++; })
                );

                await Promise.all(promises);

                if (saved > 0) {
                    showToast('success', 'Inventory Updated! 📦', `${saved} product(s) saved successfully.`);
                }
                if (failed > 0) {
                    showToast('warning', 'Partial Save', `${failed} product(s) failed to save.`);
                }

                setTimeout(() => { window.location.href = 'inventory.html'; }, 1500);
            } catch (err) {
                showToast('error', 'Save Failed', err.message);
                btn.disabled = false;
                btn.innerHTML = 'Save to Inventory';
            }
        }
    