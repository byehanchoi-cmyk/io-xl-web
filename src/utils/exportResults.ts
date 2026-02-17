import ExcelJS from 'exceljs';
import type { GridRow, GridColumn } from '../store/gridStore';

interface ExportOptions {
    rows: GridRow[];
    columns: GridColumn[];
    pkColumn: string;
    memos: Record<string, string>;
    refFileName: string | null;
    compFileName: string | null;
    config: {
        mappings: any[];
        exclusionRules: string[];
        columnExclusion: any;
        pkExclusion: any;
        pkColumn: string;
        skColumn: string;
        refFilePath: string | null;
        compFilePath: string | null;
        refFileName?: string | null; // Added
        compFileName?: string | null; // Added
        allGeneratedColumns?: GridColumn[]; // [Added] Saving all columns for Review Selector
        // [Added] Sheet Indices and Header Rows
        refSheetIdx?: number;
        compSheetIdx?: number;
        refSheetName?: string;
        compSheetName?: string;
        refHeaderRow?: number;
        compHeaderRow?: number;
    };
}

/**
 * Generate a date string in YYYYMMDD format
 */
function getDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Auto-fit column widths based on content
 */
function autoFitColumns(worksheet: ExcelJS.Worksheet) {
    worksheet.columns.forEach((column) => {
        if (!column.values) return;

        let maxLength = 10; // Minimum width
        column.values.forEach((cell) => {
            if (cell) {
                const cellLength = String(cell).length;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            }
        });

        // Set width with some padding (max 50 for readability)
        column.width = Math.min(maxLength + 2, 50);
    });
}

/**
 * Apply header formatting and filters
 */
function formatHeaders(worksheet: ExcelJS.Worksheet) {
    const headerRow = worksheet.getRow(1);

    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;

    // Enable filters
    if (worksheet.columns.length > 0) {
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: worksheet.columns.length }
        };
    }
}

/**
 * Get memo for a specific cell
 */
function getMemo(memos: Record<string, string>, rowKey: string, colId: string): string {
    return memos[`${rowKey}:${colId}`] || '';
}

/**
 * Get the display name for a column (handles special cases like Service Description)
 */
function getDisplayName(baseColName: string, isSK: boolean = false): string {
    if (isSK || baseColName.toLowerCase().includes('service') || baseColName.toLowerCase().includes('description')) {
        return 'Service Description';
    }
    return baseColName;
}

/**
 * Sanitize a string for use as an Excel worksheet name
 * (Removes * ? : \ / [ ] and limits to 31 chars)
 */
function sanitizeSheetName(name: string): string {
    // Replace invalid characters with underscore: \ / * ? : [ ]
    const sanitized = name.replace(/[\\/*?:[\]＊？：［］]/g, '_');
    // Limit to 31 characters (Excel limit)
    return sanitized.substring(0, 31);
}

/**
 * Export main result file with all grid data, memos, and color coding
 */
async function exportMainResultFile(options: ExportOptions): Promise<Blob> {
    const { rows, columns, memos, config } = options;
    const workbook = new ExcelJS.Workbook();

    // [Config Sheet] INI style visible sheet
    const iniSheet = workbook.addWorksheet('INI');

    // Define headers
    iniSheet.getCell('A1').value = 'Key';
    iniSheet.getCell('B1').value = 'Value';
    iniSheet.getCell('C1').value = 'Description';

    const iniHeaderRow = iniSheet.getRow(1);
    iniHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    iniHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    // Helper to add rows
    const addIniRow = (key: string, value: any, desc: string) => {
        let valStr = (typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');

        // [Fix] Normalize to NFC to prevent broken Hangul (NFD) in Excel (common on macOS)
        if (valStr.normalize) {
            valStr = valStr.normalize('NFC');
        }

        iniSheet.addRow([key, valStr, desc]);
    };

    // Populate Data
    addIniRow('Version', '1.0', 'Project Version');
    addIniRow('Timestamp', new Date().toISOString(), 'Export Time');

    // Configs
    addIniRow('PK_Column', config.pkColumn, 'Primary Key Column');
    addIniRow('SK_Column', config.skColumn, 'Sub Key Column');

    addIniRow('Ref_Sheet_Index', config.refSheetIdx, 'Reference Sheet Index');
    addIniRow('Comp_Sheet_Index', config.compSheetIdx, 'Comparison Sheet Index');
    addIniRow('Ref_Sheet_Name', config.refSheetName, 'Reference Sheet Name');
    addIniRow('Comp_Sheet_Name', config.compSheetName, 'Comparison Sheet Name');
    addIniRow('Ref_Header_Row', config.refHeaderRow, 'Reference Header Row Index');
    addIniRow('Comp_Header_Row', config.compHeaderRow, 'Comparison Header Row Index');

    addIniRow('Ref_File_Path', config.refFilePath, 'Original Reference File Path');
    addIniRow('Comp_File_Path', config.compFilePath, 'Original Comparison File Path');
    addIniRow('Ref_File_Name', config.refFileName, 'Reference File Name');
    addIniRow('Comp_File_Name', config.compFileName, 'Comparison File Name');

    // JSON Data
    addIniRow('Mappings', config.mappings, 'Column Mappings (JSON)');
    addIniRow('Exclusion_Rules', config.exclusionRules, 'Exclusion Rules (JSON)');
    addIniRow('Column_Exclusion', config.columnExclusion, 'Column Exclusion Config (JSON)');
    addIniRow('PK_Exclusion', config.pkExclusion, 'PK Exclusion Config (JSON)');

    addIniRow('Columns', columns, 'Grid Columns Info (JSON)');
    addIniRow('Memos', memos, 'User Memos (JSON)');
    if (config.allGeneratedColumns) {
        addIniRow('All_Generated_Columns', config.allGeneratedColumns, 'Review Selector Columns (JSON)');
    }

    // Styling
    iniSheet.getColumn(1).width = 25; // Key
    iniSheet.getColumn(2).width = 80; // Value
    iniSheet.getColumn(3).width = 40; // Desc

    const worksheet = workbook.addWorksheet('결과');

    // Add headers with increased font size
    const headers = columns.map(col => col.title);
    const headerRow = worksheet.addRow(headers);

    // Format headers with larger font for visibility
    headerRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // [Config] Exclude "Add" rows from main result
    const pkColumn = options.pkColumn;
    const refPKReviewCol = `${pkColumn}_기준검토`;
    const compPKReviewCol = `${pkColumn}_비교검토`;

    // Filter rows: Exclude if either side is marked as 'Add'
    const validRows = rows.filter(row => {
        const refStatus = String(row[refPKReviewCol] || '').trim().toLowerCase();
        const compStatus = String(row[compPKReviewCol] || '').trim().toLowerCase();
        // If marked as ADD, exclude from this main sheet (it goes to "Added Items" sheet)
        if ((refStatus === '추가' || refStatus === 'add') || (compStatus === '추가' || compStatus === 'add')) {
            return false;
        }
        return true;
    });

    // Add data rows with memos and color coding
    validRows.forEach((row) => {
        const rowData = columns.map(col => row[col.id] ?? '');
        const excelRow = worksheet.addRow(rowData);

        // Check if this row has any differences
        let rowHasDiff = false;
        for (const key of Object.keys(row)) {
            if (key.endsWith('_diff') && row[key] === true) {
                rowHasDiff = true;
                break;
            }
        }

        // Check if row is deleted (has "삭제" in any review column)
        const pkColumn = options.pkColumn;
        const refPKReviewCol = `${pkColumn}_기준검토`;
        const compPKReviewCol = `${pkColumn}_비교검토`;

        const refStatus = String(row[refPKReviewCol] || '').trim().toLowerCase();
        const compStatus = String(row[compPKReviewCol] || '').trim().toLowerCase();

        // Strategy: If either side marks it as deleted via PK, the whole row in Main Result is crossed out?
        // Or strictly if the relevant side is deleted?
        // Main result combines both. Let's say if ANY side deletes via PK, we cross it out.
        const isDeleted = (refStatus === '삭제' || refStatus === 'delete') ||
            (compStatus === '삭제' || compStatus === 'delete');

        // Apply styling and memos to each cell
        columns.forEach((col, colIndex) => {
            const cell = excelRow.getCell(colIndex + 1); // Excel is 1-indexed
            const memoKey = `${row.integratedKey}:${col.id}`;
            const memo = memos[memoKey];

            // Add memo as cell note
            if (memo) {
                cell.note = {
                    texts: [{ text: memo }],
                    margins: {
                        insetmode: 'auto',
                        inset: [0.13, 0.13, 0.25, 0.25]
                    }
                };
            }

            // [New] Apply strikethrough if deleted
            if (isDeleted) {
                cell.font = { strike: true, color: { argb: 'FF9CA3AF' } }; // Gray strikethrough
                // Skip other color logic to keep it simple/consistent with deletion status
                // Or merge styles? Let's prioritize deletion status.
                return;
            }

            // Check if this is a diff field and if it's different
            const isDiffField = col.id.endsWith('_기준') || col.id.endsWith('_비교');
            let isDifferent = false;

            if (isDiffField && row.exists === 'Both') {
                const baseKey = col.id.replace('_기준', '').replace('_비교', '');
                if (row[`${baseKey}_diff`] === true) {
                    isDifferent = true;
                }
            }

            // Check if corresponding base column has review data
            const isReviewColumn = col.id.endsWith('_기준검토') || col.id.endsWith('_비교검토');
            let baseShouldBeRed = false;

            if (isDiffField && !isReviewColumn) {
                const reviewColId = `${col.id}검토`;
                const reviewValue = row[reviewColId];
                if (reviewValue && String(reviewValue).trim() !== '') {
                    baseShouldBeRed = true;
                }
            }

            // Apply cell styling
            // Integrated Key with differences
            if ((col.id === 'standardPK' || col.id === 'standardSK' || col.id === 'integratedKey') && rowHasDiff) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEF08A' } // Visible yellow (rgb(254, 240, 138))
                };
                cell.font = { color: { argb: 'FF000000' }, bold: true }; // Black text
            }
            // Base column with review data -> RED text + Light Red Background
            else if (baseShouldBeRed) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFECACA' }
                };
                cell.font = { color: { argb: 'FFEF4444' } }; // Red text
            }
            // Different values -> YELLOW
            else if (isDifferent) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEF08A' } // Visible yellow (rgb(254, 240, 138))
                };
                cell.font = { color: { argb: 'FF000000' } }; // Black text for readability
            }
        });
    });

    // Enable filters
    if (worksheet.columns.length > 0) {
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: worksheet.columns.length }
        };
    }

    autoFitColumns(worksheet);

    // [New] Add Change History Sheet
    const historySheet = workbook.addWorksheet('변경이력');
    historySheet.addRow(['통합 Key', pkColumn, '변경항목(Column)', '기존값(Original)', '변경값(New)', '메모(Memo)']);

    rows.forEach(row => {
        // 1. Check all target columns for review data
        columns.forEach(col => {
            const isReviewColumn = col.id.endsWith('_기준검토') || col.id.endsWith('_비교검토');
            if (isReviewColumn) {
                const reviewValue = String(row[col.id] || '').trim();
                // Special case: don't log "추가" as a change here, it's in the Added Items sheet
                // But wait, the user might want to see it here too?
                // Usually "Change History" includes deletions and updates.
                if (reviewValue && reviewValue !== '추가' && reviewValue !== 'add') {
                    const baseColId = col.id.replace('_기준검토', '').replace('_비교검토', '');
                    const isRef = col.id.endsWith('_기준검토');
                    const originalColId = isRef ? `${baseColId}_기준` : `${baseColId}_비교`;
                    const originalValue = String(row[originalColId] || '').trim();

                    const memo = getMemo(memos, row.integratedKey, col.id);
                    const pkValue = isRef ? row[`${pkColumn}_기준`] : row[`${pkColumn}_비교`];

                    historySheet.addRow([
                        row.integratedKey,
                        pkValue || row.standardPK,
                        col.title,
                        originalValue,
                        reviewValue,
                        memo
                    ]);
                }
            }
        });

        // 2. Check for general review_remarks (manual checklist remarks)
        if (String(row.review_remarks || '').trim()) {
            historySheet.addRow([
                row.integratedKey,
                row.standardPK,
                '검토의견(General Remarks)',
                '', // No original value for general remarks
                row.review_remarks,
                ''
            ]);
        }

        // 3. Check for standalone memos on non-review columns
        columns.forEach(col => {
            const isReviewColumn = col.id.endsWith('_기준검토') || col.id.endsWith('_비교검토');
            if (!isReviewColumn && col.id !== 'review_remarks') {
                const memo = getMemo(memos, row.integratedKey, col.id);
                if (memo) {
                    const reviewColId = `${col.id}검토`;
                    if (!String(row[reviewColId] || '').trim()) {
                        const pkValue = col.id.endsWith('_기준') ? row[`${pkColumn}_기준`] :
                            (col.id.endsWith('_비교') ? row[`${pkColumn}_비교`] : row.standardPK);

                        historySheet.addRow([
                            row.integratedKey,
                            pkValue || row.standardPK,
                            `${col.title} (Memo Only)`,
                            '',
                            '',
                            memo
                        ]);
                    }
                }
            }
        });
    });

    formatHeaders(historySheet);
    autoFitColumns(historySheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export reference analysis file (기준파일)
 */
async function exportReferenceFile(options: ExportOptions): Promise<Blob> {
    const { rows, pkColumn, memos } = options;
    const workbook = new ExcelJS.Workbook();
    const refPKReviewCol = `${pkColumn}_기준검토`;

    // Filter rows: Exclude if marked as 'Add' in Reference
    const validRows = rows.filter(row => {
        const refStatus = String(row[refPKReviewCol] || '').trim().toLowerCase();
        return !(refStatus === '추가' || refStatus === 'add');
    });

    // Get all reference columns (ending with _기준 or _기준검토)
    const refColumns = Array.from(new Set(
        Object.keys(validRows[0] || {})
            .filter(key => key.includes('_기준') || key.includes('_기준검토'))
            .map(key => {
                // Extract base column name by removing suffixes
                const base = key.replace(/_기준검토$/, '').replace(/_기준$/, '');
                return base;
            })
    ));

    // Sheet 1: Summary of all reference columns
    const summarySheet = workbook.addWorksheet('기준열 Summary');
    summarySheet.addRow(['Column Name', 'Row Count', 'Has Review Data']);

    refColumns.forEach(baseColName => {
        const reviewCol = `${baseColName}_기준검토`;
        const rowsWithReview = validRows.filter(r => String(r[reviewCol] || '').trim() !== '');
        const displayName = getDisplayName(baseColName);
        summarySheet.addRow([displayName, rowsWithReview.length, rowsWithReview.length > 0 ? 'Yes' : 'No']);
    });

    formatHeaders(summarySheet);
    autoFitColumns(summarySheet);

    // Create sheets for each reference review column that has data
    refColumns.forEach(baseColName => {
        const reviewCol = `${baseColName}_기준검토`;

        // Determine if this is a PK column
        const isPKColumn = baseColName === pkColumn;

        const sheetRows = validRows.filter(r => String(r[reviewCol] || '').trim() !== '');
        if (sheetRows.length === 0) return; // Skip if no review data

        // Use getDisplayName for spreadsheet title
        const displayName = getDisplayName(baseColName);
        const worksheet = workbook.addWorksheet(sanitizeSheetName(displayName));

        if (isPKColumn) {
            // For PK columns: [TAG NO (actual name)] | [TAG NO]_기준검토 | 메모
            // Using displayName (TAG NO) instead of "Standard PK"
            worksheet.addRow([displayName, `${displayName}_기준검토`, '메모']);

            sheetRows.forEach(row => {
                const pkValue = row[`${pkColumn}_기준`];
                const reviewValue = row[`${pkColumn}_기준검토`];
                const memo = getMemo(memos, row.integratedKey, `${pkColumn}_기준검토`);

                const addedRow = worksheet.addRow([pkValue, reviewValue, memo]);

                // Check if deleted (Strict PK Check)
                const isDeleted = String(row[`${pkColumn}_기준검토`] || '').trim().toLowerCase().match(/^(삭제|delete)$/);

                if (isDeleted) {
                    addedRow.font = { strike: true, color: { argb: 'FF9CA3AF' } };
                }
            });
        } else {
            // For non-PK columns: [TAG NO] | [Column Name] | [Column Name]_기준검토 | 메모
            worksheet.addRow([pkColumn, displayName, `${displayName}_기준검토`, '메모']);

            sheetRows.forEach(row => {
                const pkValue = row[`${pkColumn}_기준`];
                const colValue = row[`${baseColName}_기준`];
                const reviewValue = row[`${baseColName}_기준검토`];
                const memo = getMemo(memos, row.integratedKey, `${baseColName}_기준검토`);

                const addedRow = worksheet.addRow([pkValue, colValue, reviewValue, memo]);

                // Check if deleted (Strict PK Check)
                const isDeleted = String(row[`${pkColumn}_기준검토`] || '').trim().toLowerCase().match(/^(삭제|delete)$/);

                if (isDeleted) {
                    addedRow.font = { strike: true, color: { argb: 'FF9CA3AF' } };
                }
            });
        }

        formatHeaders(worksheet);
        autoFitColumns(worksheet);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Export comparison analysis file (비교파일)
 */
async function exportComparisonFile(options: ExportOptions): Promise<Blob> {
    const { rows, pkColumn, memos } = options;
    const workbook = new ExcelJS.Workbook();
    const compPKReviewCol = `${pkColumn}_비교검토`;

    // Filter rows: Exclude if marked as 'Add' in Comparison
    const validRows = rows.filter(row => {
        const compStatus = String(row[compPKReviewCol] || '').trim().toLowerCase();
        return !(compStatus === '추가' || compStatus === 'add');
    });

    // Get all comparison columns (ending with _비교 or _비교검토)
    const compColumns = Array.from(new Set(
        Object.keys(validRows[0] || {})
            .filter(key => key.includes('_비교') || key.includes('_비교검토'))
            .map(key => {
                // Extract base column name by removing suffixes
                const base = key.replace(/_비교검토$/, '').replace(/_비교$/, '');
                return base;
            })
    ));

    // Sheet 1: Summary of all comparison columns
    const summarySheet = workbook.addWorksheet('비교열 Summary');
    summarySheet.addRow(['Column Name', 'Row Count', 'Has Review Data']);

    compColumns.forEach(baseColName => {
        const reviewCol = `${baseColName}_비교검토`;
        const rowsWithReview = validRows.filter(r => String(r[reviewCol] || '').trim() !== '');
        const displayName = getDisplayName(baseColName);
        summarySheet.addRow([displayName, rowsWithReview.length, rowsWithReview.length > 0 ? 'Yes' : 'No']);
    });

    formatHeaders(summarySheet);
    autoFitColumns(summarySheet);

    // Create sheets for each comparison review column that has data
    compColumns.forEach(baseColName => {
        const reviewCol = `${baseColName}_비교검토`;
        const sheetRows = validRows.filter(r => String(r[reviewCol] || '').trim() !== '');

        if (sheetRows.length === 0) return; // Skip if no review data

        // Use getDisplayName for spreadsheet title
        const displayName = getDisplayName(baseColName);
        const worksheet = workbook.addWorksheet(sanitizeSheetName(displayName));

        // Determine if this is a PK column
        const isPKColumn = baseColName === pkColumn;

        if (isPKColumn) {
            // For PK columns: [TAG NO (actual name)] | [TAG NO]_비교검토 | 메모
            worksheet.addRow([displayName, `${displayName}_비교검토`, '메모']);

            sheetRows.forEach(row => {
                const pkValue = row[`${pkColumn}_비교`];
                const reviewValue = row[`${pkColumn}_비교검토`];
                const memo = getMemo(memos, row.integratedKey, `${pkColumn}_비교검토`);

                const addedRow = worksheet.addRow([pkValue, reviewValue, memo]);

                // Check if deleted (Strict PK Check)
                const isDeleted = String(row[`${pkColumn}_비교검토`] || '').trim().toLowerCase().match(/^(삭제|delete)$/);

                if (isDeleted) {
                    addedRow.font = { strike: true, color: { argb: 'FF9CA3AF' } };
                }
            });
        } else {
            // For non-PK columns: Use TAG NO_비교 instead of Integrated Key
            worksheet.addRow([pkColumn, displayName, `${displayName}_비교검토`, '메모']);

            sheetRows.forEach(row => {
                const pkValue = row[`${pkColumn}_비교`]; // Changed from integratedKey
                const colValue = row[`${baseColName}_비교`];
                const reviewValue = row[`${baseColName}_비교검토`];
                const memo = getMemo(memos, row.integratedKey, `${baseColName}_비교검토`);

                const addedRow = worksheet.addRow([pkValue, colValue, reviewValue, memo]);

                // Check if deleted (Strict PK Check)
                const isDeleted = String(row[`${pkColumn}_비교검토`] || '').trim().toLowerCase().match(/^(삭제|delete)$/);

                if (isDeleted) {
                    addedRow.font = { strike: true, color: { argb: 'FF9CA3AF' } };
                }
            });
        }

        formatHeaders(worksheet);
        autoFitColumns(worksheet);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}


/**
 * Export Added Items Sheet (추가된 항목)
 */
async function exportAddedItemsSheet(options: ExportOptions): Promise<Blob> {
    const { rows, columns, memos } = options;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Added Items');

    // Headers
    const headers = columns.map(col => col.title);
    const headerRow = worksheet.addRow(headers);

    headerRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF16A34A' } // Green header
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Filter rows marked as "추가"
    // [New] Strict Check: Only check PK Review Column for "Add" status
    const pkColumn = options.pkColumn;
    const refPKReviewCol = `${pkColumn}_기준검토`;
    const compPKReviewCol = `${pkColumn}_비교검토`;

    const addedRows = rows.filter(row => {
        const refStatus = String(row[refPKReviewCol] || '').trim().toLowerCase();
        const compStatus = String(row[compPKReviewCol] || '').trim().toLowerCase();

        return (refStatus === '추가' || refStatus === 'add') ||
            (compStatus === '추가' || compStatus === 'add');
    });

    if (addedRows.length === 0) {
        // Create empty sheet or just return simpler blob
        worksheet.addRow(['No added items found']);
    } else {
        addedRows.forEach(row => {
            const rowData = columns.map(col => row[col.id] ?? '');
            const excelRow = worksheet.addRow(rowData);

            // Apply green background to indicate addition
            excelRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE6FFFA' } // Light green background
            };

            // Add memos if present
            columns.forEach((col, colIndex) => {
                const cell = excelRow.getCell(colIndex + 1);
                const memoKey = `${row.integratedKey}:${col.id}`;
                const memo = memos[memoKey];

                if (memo) {
                    cell.note = {
                        texts: [{ text: memo }],
                        margins: {
                            insetmode: 'auto',
                            inset: [0.13, 0.13, 0.25, 0.25]
                        }
                    };
                }
            });
        });
    }

    autoFitColumns(worksheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Save file to a specific directory using File System Access API
 */
async function saveFileToDirectory(dirHandle: any, blob: Blob, filename: string): Promise<void> {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

/**
 * Standard download fallback
 */
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Main export function - generates all files and triggers downloads
 */
/**
 * Main export function - generates files and handles saving
 */
export async function exportResults(options: ExportOptions): Promise<void> {
    const { rows, pkColumn } = options;

    // --- Electron Logic ---
    if (window.electron) {
        try {
            // 1. Ask user for 'Result File' save path
            const saveDialogResult = await window.electron.showSaveDialog({
                title: '결과 파일 저장 (Save Result File)',
                defaultPath: `Analysis_Result_${getDateString()}.xlsx`,
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
            });

            if (saveDialogResult.canceled || !saveDialogResult.filePath) {
                console.log('[Export] User cancelled save dialog.');
                return;
            }

            const savePath = saveDialogResult.filePath;
            const targetDir = await window.electron.path.dirname(savePath);
            const mainName = await window.electron.path.basename(savePath);

            // Get base name and extension from the chosen filename
            const dotIndex = mainName.lastIndexOf('.');
            const baseName = dotIndex > 0 ? mainName.substring(0, dotIndex) : mainName;
            const ext = dotIndex > 0 ? mainName.substring(dotIndex) : '.xlsx';

            // 1. Generate All Files in Parallel (Main, Ref, Comp, Added)
            // Note: Parallelizing generator calls for speed
            const [mainBlob, refBlob, compBlob, addedBlob] = await Promise.all([
                exportMainResultFile(options),
                exportReferenceFile(options),
                exportComparisonFile(options),
                exportAddedItemsSheet(options)
            ]);

            // 2. Define target paths
            const filesToSave = [
                { buffer: await mainBlob.arrayBuffer(), path: savePath, label: '결과파일' },
                { buffer: await refBlob.arrayBuffer(), path: await window.electron.path.join(targetDir, `${baseName}_기준${ext}`), label: '기준파일' },
                { buffer: await compBlob.arrayBuffer(), path: await window.electron.path.join(targetDir, `${baseName}_비교${ext}`), label: '비교파일' }
            ];

            // Only add "Added Items" if there are actually added rows
            const hasAddedRows = rows.some(row => {
                const pkReview = `${pkColumn}_기준검토`;
                const s = String(row[pkReview] || '').trim().toLowerCase();
                return s === '추가' || s === 'add';
            });

            if (hasAddedRows) {
                filesToSave.push({
                    buffer: await addedBlob.arrayBuffer(),
                    path: await window.electron.path.join(targetDir, `${baseName}_추가${ext}`),
                    label: '추가항목'
                });
            }

            // 3. Save files to disk
            for (const file of filesToSave) {
                await window.electron.writeFile(file.path, file.buffer);
                console.log(`[Export] Saved ${file.label} to: ${file.path}`);
            }

            alert('파일 내보내기가 완료되었습니다.\n(결과/기준/비교 파일이 저장되었습니다.)');

        } catch (error) {
            console.error('[Export] Electron export failed:', error);
            alert(`내보내기 중 오류가 발생했습니다: ${error}`);
        }
        return;
    }

    // --- Web Fallback (Existing Logic) ---
    const dateStr = getDateString();

    try {
        // Generate all files in parallel
        const [mainBlob, refBlob, compBlob, addedBlob] = await Promise.all([
            exportMainResultFile(options),
            exportReferenceFile(options),
            exportComparisonFile(options),
            exportAddedItemsSheet(options)
        ]);

        console.log('[Export] Generated 4 files, starting save process');

        const files = [
            { blob: mainBlob, name: `결과파일_${dateStr}.xlsx`, description: '결과파일' },
            { blob: refBlob, name: `기준파일_${dateStr}.xlsx`, description: '기준파일' },
            { blob: compBlob, name: `비교파일_${dateStr}.xlsx`, description: '비교파일' },
            { blob: addedBlob, name: `추가항목_${dateStr}.xlsx`, description: '추가항목' }
        ];

        // Try to use File System Access API (Save File Picker directly)
        try {
            if ('showSaveFilePicker' in window) {
                console.log('[Export] Opening Save As dialog...');

                // 1. Open Save As dialog for the Main Result File
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: files[0].name,
                    types: [{
                        description: 'Excel Files',
                        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
                    }]
                });

                // 2. Sync filenames based on user's choice
                if (fileHandle.name !== files[0].name) {
                    const params = fileHandle.name.match(/^(.*)(\.xlsx)$/i);
                    if (params) {
                        const baseName = params[1];
                        files[1].name = `${baseName}_기준.xlsx`;
                        files[2].name = `${baseName}_비교.xlsx`;
                        files[3].name = `${baseName}_추가.xlsx`;
                    }
                }

                // 3. Save the Main File
                const writable = await fileHandle.createWritable();
                await writable.write(files[0].blob);
                await writable.close();

                // 4. Try to save other files to the same directory
                try {
                    const parentHandle = await fileHandle.getParent?.();
                    if (parentHandle) {
                        for (let i = 1; i < files.length; i++) {
                            await saveFileToDirectory(parentHandle, files[i].blob, files[i].name);
                        }
                        return;
                    }
                } catch {
                    console.log('[Export] Could not access parent directory, prompting for remaining files');
                }

                // Fallback: ask for others
                for (let i = 1; i < files.length; i++) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const handle = await (window as any).showSaveFilePicker({ suggestedName: files[i].name });
                    const w = await handle.createWritable();
                    await w.write(files[i].blob);
                    await w.close();
                }
                return;
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.log('[Export] File picker failed, falling back to download');
        }

        // Final fallback: Standard download
        files.forEach((file, index) => {
            setTimeout(() => {
                downloadBlob(file.blob, file.name);
            }, index * 300);
        });

    } catch (error) {
        console.error('[Export] Error generating files:', error);
        throw error;
    }
}
