import type { GridRow, GridColumn } from '../store/gridStore';

/**
 * Generates a print-friendly HTML table and triggers the browser's print dialog.
 */
export const printGrid = async (columns: GridColumn[], rows: GridRow[], title: string = 'Analysis Result', mode: 'print' | 'pdf' = 'print'): Promise<void> => {
    const dateStr = new Date().toLocaleString();

    // Create HTML content
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @page { 
                    size: landscape; 
                    margin: 10mm; 
                }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    padding: 0;
                    margin: 0;
                    color: #1e293b;
                    background: white;
                    -webkit-print-color-adjust: exact;
                }
                .print-container {
                    padding: 0;
                }
                .header {
                    margin-bottom: 20px;
                    border-bottom: 2px solid #3b82f6;
                    padding-bottom: 10px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .header h1 {
                    margin: 0;
                    color: #1e3a8a;
                    font-size: 22px;
                    font-weight: 700;
                }
                .header .info {
                    font-size: 11px;
                    color: #64748b;
                    text-align: right;
                    line-height: 1.4;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 8px;
                    table-layout: auto;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                thead {
                    display: table-header-group;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                th, td {
                    border: 1px solid #e2e8f0;
                    padding: 5px 3px;
                    text-align: left;
                    overflow: hidden;
                    white-space: normal;
                    word-break: break-all;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                th {
                    background-color: #f1f5f9 !important;
                    font-weight: 600;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.025em;
                }
                .status-both { color: #16a34a; font-weight: 700; }
                .status-ref { color: #ea580c; font-weight: 700; }
                .status-comp { color: #2563eb; font-weight: 700; }
                .diff-highlight { 
                    background-color: #fef9c3 !important; 
                }
                .deleted { text-decoration: line-through; color: #94a3b8; }
                
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="print-container">
                <div class="header">
                    <div>
                        <h1>${title}</h1>
                    </div>
                    <div class="info">
                        Printed on: ${dateStr}<br>
                        Total Rows: ${rows.length}
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            ${columns.map(col => `<th>${col.title}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => {
        // [Fix] Determine deletion status from actual row data
        const isDeleted = Object.keys(row).some(key =>
            key.endsWith('검토') && (String(row[key]).includes('삭제') || String(row[key]).toLowerCase().includes('delete'))
        );

        return `
                                <tr class="${isDeleted ? 'deleted-row' : ''}">
                                    ${columns.map(col => {
            const value = row[col.id] ?? '';
            let cellClass = '';

            if (col.id === 'exists') {
                if (String(value).startsWith('Both')) cellClass = 'status-both';
                else if (String(value).startsWith('Only Ref')) cellClass = 'status-ref';
                else if (String(value).startsWith('Only Comp')) cellClass = 'status-comp';
            }

            // Highlight differences
            const baseColId = col.id.replace('_기준', '').replace('_비교', '');
            const isDiffField = row[`${baseColId}_diff`] === true && (col.id.endsWith('_기준') || col.id.endsWith('_비교'));

            if (isDiffField) cellClass += ' diff-highlight';

            const contentClass = isDeleted ? 'deleted' : '';

            return `<td class="${cellClass}"><span class="${contentClass}">${value}</span></td>`;
        }).join('')}
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;

    // Handle Electron printing
    // Handle Electron printing
    if (window.electron?.printHTML) {
        await window.electron.printHTML(html, mode).catch((err: any) => {
            console.error('[Print] Electron IPC print failed:', err);
            alert('인쇄 중 오류가 발생했습니다.');
            throw err;
        });
        return;
    }

    // Web Fallback
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('팝업 차단을 해제해 주세요.');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
};

/**
 * Generates a Summary Report PDF/Print out.
 */
export const printSummaryReport = async (summary: any[], title: string = 'Analysis Summary', mode: 'print' | 'pdf' = 'print'): Promise<void> => {
    const dateStr = new Date().toLocaleString();

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @page { size: landscape; margin: 5mm; }
                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: #1e293b;
                    padding: 10px;
                }
                .header {
                    border-bottom: 2px solid #3b82f6;
                    margin-bottom: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                h1 { margin: 0; color: #1e3a8a; font-size: 18px; }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                th, td {
                    border: 1px solid #e2e8f0;
                    padding: 6px 4px; /* Reduced padding */
                    text-align: center;
                    font-size: 9px; /* Reduced font size from 11px */
                }
                th {
                    background-color: #f8fafc;
                    font-weight: 700;
                    color: #475569;
                    text-transform: uppercase;
                }
                .target-name { text-align: left; font-weight: 700; background-color: #f1f5f9; }
                .val-diff { color: #ef4444; font-weight: 700; }
                .val-match { color: #10b981; }
                .status-warn { color: #f59e0b; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="header">
                <div><h1>${title}</h1></div>
                <div style="font-size: 11px; color: #64748b; text-align: right;">
                    Generated on: ${dateStr}
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 25%;">Analysis Target</th>
                        <th>Base Rows</th>
                        <th>Comp Rows</th>
                        <th>Identical</th>
                        <th>Different</th>
                        <th>Base Only</th>
                        <th>Comp Only</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${summary.map(row => `
                        <tr>
                            <td class="target-name">${row.columnName}</td>
                            <td>${row.refRowCount.toLocaleString()}</td>
                            <td>${row.compRowCount.toLocaleString()}</td>
                            <td class="val-match">${row.sameCount.toLocaleString()}</td>
                            <td class="${row.diffCount > 0 ? 'val-diff' : ''}">${row.diffCount.toLocaleString()}</td>
                            <td>${row.onlyRefCount.toLocaleString()}</td>
                            <td>${row.onlyCompCount.toLocaleString()}</td>
                            <td class="status-warn">${row.status || 'OK'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;

    if (window.electron?.printHTML) {
        await window.electron.printHTML(html, mode);
    } else {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        }
    }
};
