/**
 * Sheet preview utilities for Excel file analysis
 */

export interface SheetInfo {
    name: string;
    rowCount: number;
    columnCount: number;
}

export interface SheetPreviewData {
    sheetName: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
    totalColumns: number;
}

/**
 * Extract preview data from Excel worksheet
 * @param worksheet Excel worksheet object
 * @param maxRows Maximum number of rows to preview (default: 10)
 * @returns Preview data object
 */
export function extractSheetPreview(
    worksheet: any,
    maxRows: number = 10
): SheetPreviewData {
    const rows: string[][] = [];
    const sheetName = worksheet.name || 'Unknown';

    // Get actual row count
    const totalRows = worksheet.rowCount || 0;
    const totalColumns = worksheet.columnCount || 0;

    // Extract preview rows
    const previewRowCount = Math.min(maxRows, totalRows);

    for (let i = 1; i <= previewRowCount; i++) {
        const row = worksheet.getRow(i);
        const rowData: string[] = [];

        // Extract cell values
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
            rowData[colNumber - 1] = String(cell.value || '');
        });

        // Fill empty cells if needed
        while (rowData.length < totalColumns) {
            rowData.push('');
        }

        rows.push(rowData);
    }

    // Extract headers from first row
    const headers = rows.length > 0 ? rows[0] : [];

    return {
        sheetName,
        headers,
        rows,
        totalRows,
        totalColumns
    };
}

/**
 * Detect header row by analyzing data patterns
 * @param rows Preview rows
 * @returns Detected header row index (0-based)
 */
export function detectHeaderRow(rows: string[][]): number {
    if (rows.length === 0) return 0;

    // Simple heuristic: first non-empty row is likely the header
    for (let i = 0; i < rows.length; i++) {
        const nonEmptyCells = rows[i].filter(cell => cell.trim() !== '').length;
        if (nonEmptyCells > 0) {
            return i;
        }
    }

    return 0;
}

/**
 * Validate if a row can be used as header
 * @param row Row data
 * @returns True if row is valid for header
 */
export function isValidHeaderRow(row: string[]): boolean {
    // Header should have at least one non-empty cell
    const nonEmptyCells = row.filter(cell => cell.trim() !== '').length;

    // Header should not be all numbers
    const allNumbers = row.every(cell => {
        const trimmed = cell.trim();
        return trimmed === '' || !isNaN(Number(trimmed));
    });

    return nonEmptyCells > 0 && !allNumbers;
}

/**
 * Get unique column names from header row
 * @param headers Header row data
 * @returns Array of unique column names
 */
export function getUniqueHeaders(headers: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    headers.forEach((header, index) => {
        let name = header.trim() || `Column_${index + 1}`;
        let counter = 1;

        // Make unique if duplicate
        while (seen.has(name)) {
            name = `${header.trim() || `Column_${index + 1}`}_${counter}`;
            counter++;
        }

        seen.add(name);
        unique.push(name);
    });

    return unique;
}

/**
 * Analyze sheet structure
 * @param worksheet Excel worksheet
 * @returns Sheet information
 */
export function analyzeSheetStructure(worksheet: any): SheetInfo {
    return {
        name: worksheet.name || 'Unknown',
        rowCount: worksheet.rowCount || 0,
        columnCount: worksheet.columnCount || 0
    };
}

/**
 * Check if sheet has data
 * @param worksheet Excel worksheet
 * @returns True if sheet has data
 */
export function hasData(worksheet: any): boolean {
    return (worksheet.rowCount || 0) > 0 && (worksheet.columnCount || 0) > 0;
}

/**
 * Get sheet preview data (wrapper for extractSheetPreview)
 * @param file Excel file
 * @param sheetIndex Sheet index
 * @param maxRows Maximum rows to preview
 * @returns Preview data as 2D array
 */
export async function getSheetPreview(file: File, sheetIndex: number, maxRows: number = 10): Promise<string[][]> {
    try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const arrayBuffer = await file.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[sheetIndex];
        if (!worksheet) return [];

        const preview = extractSheetPreview(worksheet, maxRows);
        return preview.rows;
    } catch (error) {
        console.error('Error getting sheet preview:', error);
        return [];
    }
}
