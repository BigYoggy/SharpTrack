/* ============================================
   SHARPTRACK — DATA EXPORT UTILITIES (CSV/PDF)
   ============================================ */

/**
 * Exports inventory array to CSV format
 * @param {Array} products 
 */
function exportProductsToCSV(products) {
    if (!products || products.length === 0) {
        showToast('warning', 'No products to export', 'Add products to your inventory first.');
        return;
    }

    const headers = ['Product Name', 'Price (NGN)', 'Stock Quantity', 'Unit', 'Reorder Level', 'Date Added'];
    const rows = products.map(p => [
        `"${p.name.replace(/"/g, '""')}"`,
        p.sellingPrice,
        p.quantity,
        `"${p.unit}"`,
        p.reorderLevel,
        new Date(p.createdAt).toLocaleDateString('en-NG')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sharptrack_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Export Complete', 'Inventory downloaded successfully');
}

/**
 * Exports sales history array to CSV format
 * @param {Array} sales 
 */
function exportSalesToCSV(sales) {
    if (!sales || sales.length === 0) {
        showToast('warning', 'No sales to export', 'Record some sales transactions first.');
        return;
    }

    const headers = ['Sale ID', 'Product Name', 'Quantity Sold', 'Total Amount (NGN)', 'Payment Method', 'Date Sold'];
    const rows = sales.map(s => [
        s.id,
        `"${(s.product ? s.product.name : 'Unknown Product').replace(/"/g, '""')}"`,
        s.quantitySold,
        s.totalAmount,
        `"${s.paymentMethod}"`,
        new Date(s.soldAt).toLocaleDateString('en-NG') + ' ' + new Date(s.soldAt).toLocaleTimeString('en-NG')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sharptrack_sales_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Export Complete', 'Sales history downloaded successfully');
}

/**
 * Triggers browser print styles to generate a neat receipt or report
 */
function printReport() {
    window.print();
}

/**
 * Print a neat receipt modal/popup for a specific sale
 * @param {Object} sale 
 */
function printReceipt(sale) {
    const user = getUser() || { name: 'SharpTrack Merchant', storeName: 'My Store' };
    const receiptWindow = window.open('', '_blank', 'width=600,height=600');
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Receipt - SharpTrack</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    padding: 20px;
                    color: #000;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .text-center { text-align: center; }
                .divider { border-bottom: 1px dashed #000; margin: 12px 0; }
                .store-title { font-size: 18px; font-weight: bold; text-transform: uppercase; }
                .meta-row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
                .item-row { display: flex; justify-content: space-between; font-size: 14px; margin: 8px 0; }
                .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin: 12px 0 6px; }
                .footer { font-size: 11px; margin-top: 30px; }
                @media print {
                    .no-print { display: none; }
                }
                .btn-print {
                    background: #000;
                    color: #fff;
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-family: sans-serif;
                    font-weight: bold;
                    width: 100%;
                    margin-bottom: 16px;
                }
            </style>
        </head>
        <body>
            <button class="btn-print no-print" onclick="window.print()">Print Receipt</button>
            <div class="text-center">
                <div class="store-title">${user.storeName || 'SharpTrack Merchant'}</div>
                <div style="font-size: 12px; margin-top: 4px;">Merchant: ${user.name}</div>
            </div>
            
            <div class="divider"></div>
            
            <div class="meta-row">
                <span>Date:</span>
                <span>${new Date(sale.soldAt).toLocaleDateString('en-NG')} ${new Date(sale.soldAt).toLocaleTimeString('en-NG', {hour: '2-digit', minute: '2-digit'})}</span>
            </div>
            <div class="meta-row">
                <span>Receipt No:</span>
                <span>${sale.id.slice(-8).toUpperCase()}</span>
            </div>
            <div class="meta-row">
                <span>Payment:</span>
                <span>${sale.paymentMethod.toUpperCase()}</span>
            </div>

            <div class="divider"></div>

            <div style="font-weight: bold; font-size: 13px; display: flex; justify-content: space-between;">
                <span>ITEM</span>
                <span>TOTAL</span>
            </div>
            <div class="item-row">
                <div>
                    <div>${sale.product ? sale.product.name : 'Product Item'}</div>
                    <div style="font-size: 12px; color: #555;">${sale.quantitySold} x ₦${Number(sale.totalAmount / sale.quantitySold).toLocaleString()}</div>
                </div>
                <span>₦${Number(sale.totalAmount).toLocaleString()}</span>
            </div>

            <div class="divider"></div>

            <div class="total-row">
                <span>TOTAL:</span>
                <span>₦${Number(sale.totalAmount).toLocaleString()}</span>
            </div>

            <div class="divider"></div>
            
            <div class="text-center footer">
                <p>Thank you for your patronage!</p>
                <p style="margin-top: 6px; font-style: italic;">Powered by SharpTrack</p>
            </div>
        </body>
        </html>
    `;

    receiptWindow.document.write(html);
    receiptWindow.document.close();
}
