import ExcelJS from 'exceljs';

// =============================================================================
// Interfaces
// =============================================================================

export interface ParsedSheet {
    name: string;
    data: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
    // Map "rowIndex:colIndex" (0-based data index) -> "comment text"
    comments: Record<string, string>;
}

export interface ParsedWorkbook {
    fileName: string;
    sheets: ParsedSheet[];
    activeSheet: string;
}

export interface ExportColumn {
    id: string;
    title: string;
}

// =============================================================================
// Parser
// =============================================================================

export async function parseExcelFile(source: File | ArrayBuffer, options?: { hasHeader?: boolean, headerRow?: number, fileName?: string }): Promise<ParsedWorkbook> {
    const { hasHeader = true, headerRow: useHeaderRow = 1, fileName } = options || {};

    let buffer: ArrayBuffer;
    let name = fileName || 'Unknown.xlsx';

    if (source instanceof File) {
        buffer = await source.arrayBuffer();
        name = source.name;
    } else {
        buffer = source;
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch (e) {
        console.error(`[ExcelParser] Error loading workbook`, e);
        throw e;
    }

    const sheets: ParsedSheet[] = [];

    // Process each sheet
    for (let i = 0; i < workbook.worksheets.length; i++) {
        const worksheet = workbook.worksheets[i];
        try {
            const data: Record<string, unknown>[] = [];
            const columns: string[] = [];
            const comments: Record<string, string> = {};

            // Helper to safe extract string
            const getSafeCellValue = (cell: ExcelJS.Cell): string => {
                const val = cell.value;
                if (val === null || val === undefined) return '';
                if (typeof val === 'string') return val.trim();
                if (typeof val === 'number') return String(val);
                if (typeof val === 'boolean') return String(val);
                if (typeof val === 'object') {
                    // Try to extract text from RichText/Formula/Hyperlink
                    // We avoid cell.text which might crash
                    try {
                        if ('text' in val) return (val as any).text || '';
                        if ('result' in val) return String((val as any).result || '');
                        if ('hyperlink' in val && 'text' in val) return (val as any).text || '';
                    } catch (ignore) {
                        return '';
                    }
                }
                return String(val).trim();
            };

            const headerRow = worksheet.getRow(useHeaderRow);

            // [Deduplication] Track seen column names
            const seenHeaders = new Map<string, number>();

            if (hasHeader) {
                headerRow.eachCell((cell, colNumber) => {
                    let headerText = getSafeCellValue(cell);

                    // Fallback for empty headers
                    if (!headerText) headerText = `Col ${colNumber}`;

                    // Deduplicate
                    if (seenHeaders.has(headerText)) {
                        const count = seenHeaders.get(headerText)! + 1;
                        seenHeaders.set(headerText, count);
                        headerText = `${headerText}_${count}`;
                    } else {
                        seenHeaders.set(headerText, 1);
                    }

                    // [Fix] Use direct assignment to preserve column index order (1-based -> 0-based)
                    // This handles empty columns in the header row correctly
                    columns[colNumber - 1] = headerText;
                });
            } else {
                // Generate default headers "Col 1", "Col 2"...
                // We use worksheet.columnCount as a heuristic, but it might be larger than actual data
                const maxCol = worksheet.columnCount || 26;
                for (let c = 1; c <= maxCol; c++) {
                    columns[c - 1] = `Col ${c}`;
                }
            }

            // Iterate all rows
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber <= (hasHeader ? useHeaderRow : 0)) return; // Skip header and preceding rows

                const rowData: Record<string, unknown> = {};
                let hasData = false;

                // Map each defined column
                columns.forEach((colName, idx) => {
                    const colNumber = idx + 1;
                    const cell = row.getCell(colNumber);

                    // Use Safe Extractor
                    const strVal = getSafeCellValue(cell);
                    rowData[colName] = strVal;

                    if (strVal) hasData = true;

                    // Extract Comment (Note)
                    if (cell.note) {
                        const noteText = typeof cell.note === 'string'
                            ? cell.note
                            : cell.note.texts?.map(t => t.text).join('') || '';

                        // Key: "dataRowIndex:colIndex" (0-based)
                        // dataRowIndex = data.length (current index being pushed)
                        comments[`${data.length}:${idx} `] = noteText;
                    }
                });

                if (hasData || row.cellCount > 0) {
                    // Push even if empty to maintain row indices if needed? 
                    // Use hasData check to be safe against empty trailing rows
                    data.push(rowData);
                }
            });

            sheets.push({
                name: worksheet.name,
                data,
                columns,
                rowCount: data.length,
                comments
            });
        } catch (err) {
            console.error(`[ExcelParser] Error processing sheet: ${worksheet.name}`, err);
        }

    }

    return {
        fileName: name,
        sheets,
        activeSheet: sheets.length > 0 ? sheets[0].name : '',
    };
}

// =============================================================================
// Helper: Helpers
// =============================================================================

export function getUniqueColumnValues(
    data: Record<string, unknown>[],
    columnName: string
): string[] {
    const values = new Set<string>();
    data.forEach((row) => {
        const val = row[columnName];
        if (val !== null && val !== undefined && val !== '') {
            values.add(String(val).trim());
        }
    });
    return Array.from(values).sort();
}

export function isValidPKColumn(
    data: Record<string, unknown>[],
    columnName: string
): { valid: boolean; uniqueCount: number; totalCount: number } {
    const values = data
        .map((row) => row[columnName])
        .filter((v) => v !== null && v !== undefined && v !== '')
        .map((v) => String(v).trim());

    const uniqueValues = new Set(values);

    return {
        valid: uniqueValues.size === values.length,
        uniqueCount: uniqueValues.size,
        totalCount: values.length,
    };
}


// =============================================================================
// Exporter
// =============================================================================

export interface ExportOptions {
    fileName: string;
    mainSheetName?: string;
    // Map of "SheetName" -> Rows
    changeSheets?: Record<string, Record<string, any>[]>;
    // Memos to inject: "integratedKey:colId" -> "text"
    memos?: Record<string, string>;
    refFile?: File | null;
    compFile?: File | null;
}

export async function exportAnalysisResult(
    rows: Record<string, any>[],
    columns: ExportColumn[],
    options: ExportOptions
) {
    const workbook = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet(options.mainSheetName || 'Analysis Result');

    // Helper: Copy sheets from a source file (Suspended by user request)
    /*
    const copySheetsFromFile = async (file: File, prefix: string) => {
        try {
            console.log(`[Export] Copying sheets from ${file.name} (${prefix})...`);
            const buffer = await file.arrayBuffer();
            const sourceWb = new ExcelJS.Workbook();
            await sourceWb.xlsx.load(buffer);

            console.log(`[Export] Loaded ${file.name}. Sheet count: ${sourceWb.worksheets.length}`);

            sourceWb.eachSheet((sourceSheet, id) => {
                const safeName = sourceSheet.name.replace(/[\\/*?:\[\]]/g, '_');
                let targetName = `${prefix}_${safeName}`.substring(0, 31);

                // Simple conflict resolution
                if (workbook.getWorksheet(targetName)) {
                    targetName = `${prefix}_${sourceSheet.name}_${id}`.substring(0, 31);
                }

                const targetSheet = workbook.addWorksheet(targetName);

                // Copy Rows & Styles
                sourceSheet.eachRow((row, rowNumber) => {
                    const targetRow = targetSheet.getRow(rowNumber);
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        const targetCell = targetRow.getCell(colNumber);
                        targetCell.value = cell.value;
                        // Safe Style Copy
                        if (cell.style) {
                            try {
                                targetCell.style = JSON.parse(JSON.stringify(cell.style));
                            } catch {
                                // Ignore style errors
                            }
                        }
                    });
                    targetRow.commit();
                });

                // Copy Column Properties (Width, Hidden)
                const colCount = sourceSheet.columnCount;
                for (let i = 1; i <= colCount; i++) {
                    const srcCol = sourceSheet.getColumn(i);
                    const tgtCol = targetSheet.getColumn(i);
                    if (srcCol.width) tgtCol.width = srcCol.width;
                    if (srcCol.hidden) tgtCol.hidden = srcCol.hidden;
                }
            });
        } catch (err) {
            console.error(`Error copying sheets from ${file.name}`, err);
        }
    };
    */

    // 1. Setup Main Sheet Columns
    mainSheet.columns = columns.map(col => ({
        header: col.title,
        key: col.id,
        width: 15, // Default width, will auto-fit later
    }));

    // Header Style
    const headerRow = mainSheet.getRow(1);
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD7E4BC' } // Light Green
        };
        cell.font = {
            bold: true,
            color: { argb: 'FF000000' }
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 2. Add Data Rows
    rows.forEach(row => {
        const rowData: Record<string, any> = {};
        columns.forEach(col => {
            rowData[col.id] = row[col.id];
        });
        const addedRow = mainSheet.addRow(rowData);

        // Conditional Formatting: "Exists" === "Both(M)" -> Red Text for PK
        if (row['exists'] === 'Both(M)') {
            // Highlight PK column (usually 1st or 2nd)
            // Assuming 1st column is Integrated Key
            addedRow.getCell(1).font = { color: { argb: 'FFFF0000' }, bold: true };
        }

        // Add Memos if mapped
        if (options.memos) {
            columns.forEach((col, idx) => {
                const key = `${row['integratedKey']}:${col.id}`;
                if (options.memos && options.memos[key]) {
                    addedRow.getCell(idx + 1).note = options.memos[key];
                }
            });
        }
    });

    // Auto-filter
    mainSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: columns.length }
    };

    // Auto-fit Logic
    mainSheet.columns.forEach(column => {
        let maxLength = 0;
        if (column.header) maxLength = column.header.length;
        if (column.eachCell) {
            column.eachCell({ includeEmpty: true }, (cell) => {
                const len = cell.value ? String(cell.value).length : 0;
                if (len > maxLength) maxLength = len;
            });
        }
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
    });

    // [New] Copy Original Sheets
    // User Request 2026-02-09: Original sheets are NOT needed.
    // if (options.refFile) await copySheetsFromFile(options.refFile, 'Ref');
    // if (options.compFile) await copySheetsFromFile(options.compFile, 'Comp');

    // 3. Create Change Sheets
    if (options.changeSheets) {
        Object.entries(options.changeSheets).forEach(([sheetName, changeRows]) => {
            if (changeRows.length === 0) return;

            const ws = workbook.addWorksheet(sheetName.substring(0, 31)); // Limit name length

            // Determine columns based on data keys
            const keys = Object.keys(changeRows[0]);
            ws.columns = keys.map(k => ({ header: k, key: k, width: 20 }));

            // Add rows
            changeRows.forEach(r => ws.addRow(r));

            // Style Header
            ws.getRow(1).eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD7E4BC' } };
                cell.font = { bold: true };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Auto-filter
            ws.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: changeRows.length + 1, column: keys.length }
            };

            // Auto-fit
            ws.columns.forEach(column => {
                let maxLength = 0;
                if (column.header) maxLength = column.header.length;
                if (column.eachCell) {
                    column.eachCell({ includeEmpty: true }, (cell) => {
                        const len = cell.value ? String(cell.value).length : 0;
                        if (len > maxLength) maxLength = len;
                    });
                }
                column.width = Math.min(Math.max(maxLength + 2, 10), 60);
            });
        });
    }

    // Write Buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Trigger Download
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = options.fileName;
    anchor.click();
    window.URL.revokeObjectURL(url);
}

// Deprecated alias for backward compatibility until refactor is complete
export { exportAnalysisResult as exportToExcel };

// =============================================================================
// Project Config Parser (Hidden Sheet)
// =============================================================================

export async function extractProjectConfig(file: File): Promise<any | null> {
    try {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // [INI Sheet] Priority Check
        const iniSheet = workbook.getWorksheet('INI');
        if (iniSheet) {
            console.log('[Parser] Found INI config sheet');
            const config: any = {};
            const memos: any = {};
            let columns: any[] = [];

            // Read rows starting from 2 (Header is 1)
            iniSheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header

                // Helper to safe extract string (duplicated from parseExcelFile for isolation)
                const getVal = (cell: ExcelJS.Cell): string => {
                    const val = cell.value;
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'object') {
                        if ('text' in val) return (val as any).text || '';
                        if ('result' in val) return String((val as any).result || '');
                    }
                    return String(val).trim();
                };

                const key = getVal(row.getCell(1));
                const valStr = getVal(row.getCell(2));

                if (!key) return;

                const lowerKey = key.toLowerCase();

                // Helper to parse JSON safely
                const parseVal = (s: string) => {
                    try { return JSON.parse(s); } catch { return s; }
                };

                // Map INI keys to ProjectState structure (Case Insensitive)
                if (lowerKey === 'pk_column') config.pkColumn = valStr;
                else if (lowerKey === 'sk_column') config.skColumn = valStr;
                else if (lowerKey === 'ref_sheet_index') config.refSheetIdx = parseInt(valStr) || 0;
                else if (lowerKey === 'comp_sheet_index') config.compSheetIdx = parseInt(valStr) || 0;
                else if (lowerKey === 'ref_sheet_name') config.refSheetName = valStr;
                else if (lowerKey === 'comp_sheet_name') config.compSheetName = valStr;
                else if (lowerKey === 'ref_header_row') config.refHeaderRow = parseInt(valStr) || 0;
                else if (lowerKey === 'comp_header_row') config.compHeaderRow = parseInt(valStr) || 0;
                else if (lowerKey === 'ref_file_path') config.refFilePath = valStr;
                else if (lowerKey === 'comp_file_path') config.compFilePath = valStr;
                else if (lowerKey === 'ref_file_name') config.refFileName = valStr;
                else if (lowerKey === 'comp_file_name') config.compFileName = valStr;
                else if (lowerKey === 'mappings') config.mappings = parseVal(valStr);
                else if (lowerKey === 'exclusion_rules') config.exclusionRules = parseVal(valStr);
                else if (lowerKey === 'column_exclusion') config.columnExclusion = parseVal(valStr);
                else if (lowerKey === 'pk_exclusion') config.pkExclusion = parseVal(valStr);
                else if (lowerKey === 'all_generated_columns') config.allGeneratedColumns = parseVal(valStr);
                else if (lowerKey === 'columns') columns = parseVal(valStr);
                else if (lowerKey === 'memos') Object.assign(memos, parseVal(valStr));
            });

            console.log('[Parser] INI Config loaded:', Object.keys(config));

            return {
                config,
                memos,
                columns
            };
        }

        // [Legacy Support] Hidden Config Sheet
        const configSheet = workbook.getWorksheet('_io_xl_config');
        if (!configSheet) {
            return null; // Not a project file
        }

        // Try to read JSON from A1 (and subsequent cells if chunked)
        let jsonString = '';
        const firstCell = configSheet.getCell(1, 1).value;

        if (firstCell && typeof firstCell === 'string') {
            jsonString = firstCell;

            // Check if chunked (if A2 has content, likely chunked)
            let row = 2;
            let nextCell = configSheet.getCell(row, 1).value;
            while (nextCell && typeof nextCell === 'string') {
                jsonString += nextCell;
                row++;
                nextCell = configSheet.getCell(row, 1).value;
            }
        }

        if (!jsonString) return null;

        return JSON.parse(jsonString);
    } catch (e) {
        console.warn('[ExcelParser] Failed to extract project config:', e);
        return null;
    }
}
