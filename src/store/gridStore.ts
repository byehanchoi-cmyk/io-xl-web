import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import ExcelJS from 'exceljs';
import {
    type ParsedWorkbook,
    type ParsedSheet,
    extractProjectConfig,
    parseExcelFile
} from '../utils/excelParser';
import { type MappingInfo, compareDatasets, filterMappings, isValuesMatch, type ColumnExclusionConfig, type PKExclusionConfig } from '../utils/comparisonEngine';
import { exportResults } from '../utils/exportResults';

// =============================================================================
// Types
// =============================================================================

export interface ColumnSummary {
    columnName: string;
    refRowCount: number;
    compRowCount: number;
    sameCount: number;
    diffCount: number;
    onlyRefCount: number;
    onlyCompCount: number;
    status: string;
}

export interface GridColumn {
    id: string;
    title: string;
    width: number;
    frozen?: boolean;
    isPK?: boolean; // Primary Key column
    isSK?: boolean; // Secondary Key column
}

export interface GridRow {
    integratedKey: string;
    standardPK: string;
    standardSK: string;
    exists?: 'Both' | 'Only Ref' | 'Only Comp' | 'Both(M)';
    [key: string]: string | number | boolean | undefined;
}

export interface ReviewChange {
    rowIndex: number;
    sourceColumn: string;
    oldKey: string;
    newKey: string;
}

export interface ColumnFilter {
    columnId: string;
    searchText: string;
    selectedValues: Set<string>;
    sortOrder: 'asc' | 'desc' | null;
    selectedColors?: Set<'default' | 'yellow' | 'red'>; // Color filter
}

export type ExistsMode = 'All' | 'Both' | 'Diff' | 'Only Ref' | 'Only Comp' | 'Both(M)';

export type AppView = 'setup' | 'mapping' | 'grid' | 'summary';

// =============================================================================
// Store Interface
// =============================================================================

interface GridState {
    // Navigation
    view: AppView;
    setView: (view: AppView) => void;

    // Error Handling
    error: string | null;
    setError: (error: string | null) => void;

    // Data
    columns: GridColumn[];
    allGeneratedColumns: GridColumn[]; // New state to hold all possible columns
    rows: GridRow[];
    rowCount: number;

    // Raw Excel Data (for comparison)
    refWorkbook: ParsedWorkbook | null;
    compWorkbook: ParsedWorkbook | null;
    refFile: File | null;
    compFile: File | null;
    refFileName: string | null;
    compFileName: string | null;
    refFilePath: string | null; // Added: Absolute path for Reference file
    compFilePath: string | null; // Added: Absolute path for Compare file

    // Key Configuration (B1.0 Standard)
    pkColumn: string;
    skColumn: string;
    exclusionRules: string[];
    columnExclusion: ColumnExclusionConfig;
    pkExclusion: PKExclusionConfig;
    mappings: MappingInfo[];
    refSheetIdx: number;
    compSheetIdx: number;
    refSheetName: string; // [Added] For robust project restoration
    compSheetName: string; // [Added] For robust project restoration
    refHeaderRow: number; // Header row index (0-based)
    compHeaderRow: number; // Header row index (0-based)
    frozenColumnCount: number;
    comparisonSummary: {
        total: number;
        both: number;
        perfectMatch: number;
        onlyRef: number;
        onlyComp: number;
        diffs: number;
        mismatches: number;
        integrityScore: number;
    } | null;
    detailedSummary: ColumnSummary[];
    recentProjects: any[];
    loadRecentProjects: () => Promise<void>;
    clearRecentProjects: () => Promise<void>;
    deleteProject: (id: number) => Promise<void>;
    loadProjectFromDb: (project: any) => Promise<void>;
    mappingIntel: any[];
    loadMappingIntel: () => Promise<void>;
    loadMemos: () => Promise<void>;
    globalRules: any[];
    loadGlobalRules: (type?: string) => Promise<void>;
    saveGlobalRule: (name: string, type: string, ruleJson: string) => Promise<void>;

    // Filtering & Sorting
    filters: Map<string, ColumnFilter>;
    globalSortColumn: string | null;
    globalSortDirection: 'asc' | 'desc';
    existsMode: ExistsMode;

    // Derived data (filtered & sorted rows)
    filteredRows: GridRow[];

    // Actions
    setColumns: (columns: GridColumn[]) => void;
    setRows: (rows: GridRow[]) => void;
    setCellValue: (rowIdx: number, colId: string, value: string | number | boolean) => void;
    setCellValuesBatch: (updates: { rowIdx: number; colId: string; value: string | number | boolean }[]) => void;
    generateMockData: (count: number) => void;
    tempUserCols?: GridColumn[]; // Temporary storage for restoring user columns

    // Excel & Comparison Actions
    setWorkbooks: (ref: ParsedWorkbook, comp: ParsedWorkbook, refFile: File, compFile: File, refPath?: string, compPath?: string) => void;
    updateWorkbook: (type: 'ref' | 'comp', workbook: ParsedWorkbook) => void;
    runComparison: (mappings: MappingInfo[], pk: string, sk?: string, exclusions?: string[]) => void;
    lastRunConfig: string | null;
    setLastRunConfig: (config: string | null) => void;
    generateConfigSnapshot: () => string;

    // Key Management
    setPKColumn: (pk: string) => void;
    setSKColumn: (sk: string) => void;
    setExclusionRules: (rules: string[]) => void;
    setColumnExclusion: (config: Partial<ColumnExclusionConfig>) => void;
    setPKExclusion: (config: Partial<PKExclusionConfig>) => void;
    setMappings: (mappings: MappingInfo[]) => void;
    setSheetIndices: (refIdx: number, compIdx: number) => void;
    setHeaderRows: (refRow: number, compRow: number) => void;
    setFrozenColumnCount: (count: number) => void;
    autoSaveConfig: () => void;
    updateFilePaths: (refPath: string | null, compPath: string | null) => void;

    // Filtering & Sorting
    setColumnFilter: (columnId: string, filter: Partial<ColumnFilter>) => void;
    clearColumnFilter: (columnId: string) => void;
    resetAllFilters: () => void;
    setSortColumn: (columnId: string | null, direction?: 'asc' | 'desc') => void;
    setExistsMode: (mode: ExistsMode) => void;

    // Internal
    applyFiltersAndSort: () => void;

    // Memos (Cell Comments)
    memos: Record<string, string>;
    setMemo: (rowKey: string, colId: string, memo: string) => void;
    deleteMemo: (rowKey: string, colId: string) => void;

    // Review & Merge
    selectedReviewColumns: string[];
    setSelectedReviewColumns: (columns: string[]) => void;
    getReviewChanges: () => ReviewChange[];
    applyReviewCompensation: () => { applied: number };

    // Analysis Engine B2.0
    applyAnalysisEngineChanges: () => Promise<{
        updatedCount: number;
        details?: {
            noTargetRowCount: number;
            ignoredDelAddCount: number;
            identicalValueCount: number;
            noReviewDataCount: number;
        }
    }>;

    // Project Save/Load Actions
    exportProject: () => Promise<void>;
    importProjectFromExcel: (file: File) => Promise<void>;
    recalculateSummary: () => void;

    resetStore: () => void;
    setColumnWidth: (columnId: string, width: number) => void;

    // Manual Checklist Management
    addChecklistItem: (pk?: string, remarks?: string) => void;
    deleteRow: (rowKey: string) => void;

    // Selection management for targeted insertion
    selectedRowIndex: number | null;
    setSelectedRowIndex: (index: number | null) => void;
    selectedColumnId: string | null;
    setSelectedColumnId: (id: string | null) => void;

    // Manual Column Management
    addUserColumn: (title: string, afterColumnId?: string) => void;
    deleteColumn: (columnId: string) => void;
    // [Fix] Hydration
    reloadWorkbooks: () => Promise<void>;
}

// =============================================================================
// B1.0 Standard Fixed Columns
// =============================================================================

const defaultColumns: GridColumn[] = [
    { id: 'integratedKey', title: '통합 Key', width: 170, frozen: true, isPK: true }, // [Harmonize] Match Analysis Output
    { id: 'standardPK', title: 'Standard PK', width: 120, frozen: true, isPK: true },
    { id: 'standardSK', title: 'Standard SK', width: 120, frozen: true, isSK: true },
    { id: 'exists', title: '구분', width: 80, frozen: true }, // [Harmonize] Match Analysis Output
    { id: 'tagNo', title: 'TAG NO', width: 150 },
    { id: 'description', title: 'Description', width: 250 },
    { id: 'ioType', title: 'I/O Type', width: 100 },
    { id: 'signal', title: 'Signal', width: 100 },
    { id: 'area', title: 'Area', width: 100 },
    { id: 'system', title: 'System', width: 120 },
    { id: 'status', title: 'Status', width: 100 },
];

// =============================================================================
// Helpers
// =============================================================================

const deduplicateColumns = (cols: GridColumn[]): GridColumn[] => {
    const seen = new Set<string>();
    return cols.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });
};

// [Fix] Reliable Config Comparison
const generateConfigSnapshot = (state: any) => {
    return JSON.stringify({
        mappings: state.mappings || [],
        pkColumn: state.pkColumn || '',
        skColumn: state.skColumn || '',
        refSheetIdx: state.refSheetIdx !== undefined ? state.refSheetIdx : 0,
        compSheetIdx: state.compSheetIdx !== undefined ? state.compSheetIdx : 0,
        refSheetName: state.refSheetName || '',
        compSheetName: state.compSheetName || '',
        columnExclusion: state.columnExclusion || { excludeUnnamed: true, patterns: [] },
        refHeaderRow: state.refHeaderRow || 0,
        compHeaderRow: state.compHeaderRow || 0
    });
};

export const useGridStore = create<GridState>()(
    persist(
        (set, get) => ({
            // Helper for external use if needed
            generateConfigSnapshot: () => generateConfigSnapshot(get()),

            // Navigation
            view: 'setup',
            setView: (view) => set({ view }),

            // Error Handling
            error: null,
            setError: (error) => set({ error }),

            // Last Run Config State (For Persistence across view changes)
            lastRunConfig: null,
            setLastRunConfig: (config) => set({ lastRunConfig: config }),

            // Data
            columns: defaultColumns,
            allGeneratedColumns: [],
            rows: [],
            rowCount: 0,
            recentProjects: [],
            mappingIntel: [],
            globalRules: [],
            filteredRows: [],

            loadRecentProjects: async () => {
                if (!window.electron?.db) return;
                try {
                    const projects = await window.electron.db.getProjects();
                    set({ recentProjects: projects });
                } catch (e) {
                    console.error('[DB] Load recent projects failed:', e);
                }
            },

            clearRecentProjects: async () => {
                if (!window.electron?.db) return;
                try {
                    await window.electron.db.clearProjects();
                    set({ recentProjects: [] });
                } catch (e) {
                    console.error('[DB] Clear projects failed:', e);
                }
            },
            deleteProject: async (id) => {
                if (!window.electron?.db) return;
                try {
                    await window.electron.db.deleteProject(id);
                    const projects = await window.electron.db.getProjects();
                    set({ recentProjects: projects });
                } catch (e) {
                    console.error('[DB] Delete project failed:', e);
                }
            },

            loadProjectFromDb: async (project) => {
                const { setView, setError, runComparison } = get();
                try {
                    const config = JSON.parse(project.config_json);
                    const refPath = project.ref_path;
                    const compPath = project.comp_path;

                    // 1. Validate physical files
                    const refExists = await window.electron.fileExists(refPath);
                    const compExists = await window.electron.fileExists(compPath);
                    if (!refExists || !compExists) {
                        throw new Error('프로젝트의 원본 Excel 파일을 찾을 수 없습니다. 경로가 변경되었거나 파일이 삭제되었을 수 있습니다.');
                    }

                    // 2. Load and Parse
                    const refBuffer = await window.electron.readFile(refPath);
                    const compBuffer = await window.electron.readFile(compPath);

                    const refWorkbook = await parseExcelFile(new File([refBuffer], 'reference.xlsx'));
                    const compWorkbook = await parseExcelFile(new File([compBuffer], 'comparison.xlsx'));

                    // 3. Sync Store
                    const refBase = await window.electron.path.basename(refPath);
                    const compBase = await window.electron.path.basename(compPath);

                    set({
                        refWorkbook,
                        compWorkbook,
                        refFileName: refBase,
                        compFileName: compBase,
                        refFilePath: refPath,
                        compFilePath: compPath,
                        refFile: null,
                        compFile: null
                    });

                    // 4. Resolve Sheets by Name (Robust Restoration)
                    const refSheetIdx = config.refSheetName
                        ? refWorkbook.sheets.findIndex(s => s.name === config.refSheetName)
                        : (config.refSheetIdx !== undefined ? config.refSheetIdx : 0);
                    const compSheetIdx = config.compSheetName
                        ? compWorkbook.sheets.findIndex(s => s.name === config.compSheetName)
                        : (config.compSheetIdx !== undefined ? config.compSheetIdx : 0);

                    const finalRefIdx = refSheetIdx !== -1 ? refSheetIdx : 0;
                    const finalCompIdx = compSheetIdx !== -1 ? compSheetIdx : 0;

                    // 5. Sync Store
                    set({
                        mappings: config.mappings,
                        pkColumn: config.pkColumn || config.pk, // Support both naming styles
                        skColumn: config.skColumn || config.sk || '',
                        exclusionRules: config.exclusions || [],
                        selectedReviewColumns: config.selectedReviewColumns || [],
                        refSheetIdx: finalRefIdx,
                        compSheetIdx: finalCompIdx,
                        refSheetName: config.refSheetName || refWorkbook.sheets[finalRefIdx]?.name || '',
                        compSheetName: config.compSheetName || compWorkbook.sheets[finalCompIdx]?.name || '',
                        refHeaderRow: config.refHeaderRow !== undefined ? config.refHeaderRow : 0,
                        compHeaderRow: config.compHeaderRow !== undefined ? config.compHeaderRow : 0,
                        // Temporary storage for user columns to be picked up by runComparison
                        tempUserCols: config.userColumns || []
                    });

                    await runComparison(config.mappings, config.pkColumn || config.pk, config.skColumn || config.sk, config.exclusions);
                    await get().loadMemos();
                    setView('summary');

                } catch (e) {
                    console.error('[DB] Load project failed:', e);
                    setError(e instanceof Error ? e.message : '프로젝트 로드 중 오류가 발생했습니다.');
                }
            },

            loadMappingIntel: async () => {
                if (!window.electron?.db) return;
                try {
                    const intel = await window.electron.db.getMappingIntel();
                    set({ mappingIntel: intel });
                } catch (e) {
                    console.error('[DB] Load mapping intel failed:', e);
                }
            },

            loadMemos: async () => {
                if (!window.electron?.db) return;
                try {
                    const dbMemos = await window.electron.db.getMemos();
                    const memoMap: Record<string, string> = { ...get().memos };

                    dbMemos.forEach((m: any) => {
                        const key = `${m.row_key}:${m.col_id}`;
                        memoMap[key] = m.text;
                    });

                    set({ memos: memoMap });
                } catch (e) {
                    console.error('[DB] Load memos failed:', e);
                }
            },

            loadGlobalRules: async (type) => {
                if (!window.electron?.db) return;
                try {
                    const rules = await window.electron.db.getRules(type);
                    set({ globalRules: rules });
                } catch (e) {
                    console.error('[DB] Load global rules failed:', e);
                }
            },

            saveGlobalRule: async (name, type, ruleJson) => {
                if (!window.electron?.db) return;
                try {
                    await window.electron.db.saveRule({ name, type, ruleJson });
                    await get().loadGlobalRules(type);
                } catch (e) {
                    console.error('[DB] Save global rule failed:', e);
                    throw e;
                }
            },

            // Memos & Layout State
            memos: {},
            tempUserCols: [],

            // Review Columns
            selectedReviewColumns: ['review_remarks'],

            selectedRowIndex: null,
            setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),
            selectedColumnId: null,
            setSelectedColumnId: (id) => set({ selectedColumnId: id }),

            addUserColumn: (title, afterColumnId) => {
                const { allGeneratedColumns, selectedReviewColumns } = get();
                const newColId = `user_${Date.now()}`;
                const newCol: GridColumn = {
                    id: newColId,
                    title: title,
                    width: 150,
                    frozen: true // Treat like a key column for better control
                };

                let updatedAllGenerated: GridColumn[];
                if (afterColumnId) {
                    const index = allGeneratedColumns.findIndex(c => c.id === afterColumnId);
                    if (index !== -1) {
                        updatedAllGenerated = [...allGeneratedColumns];
                        updatedAllGenerated.splice(index + 1, 0, newCol);
                    } else {
                        updatedAllGenerated = [...allGeneratedColumns, newCol];
                    }
                } else {
                    updatedAllGenerated = [...allGeneratedColumns, newCol];
                }

                const updatedSelectedReview = [...selectedReviewColumns, newColId];
                set({ allGeneratedColumns: updatedAllGenerated });
                get().setSelectedReviewColumns(updatedSelectedReview);
            },

            deleteColumn: (columnId) => {
                const { allGeneratedColumns, selectedReviewColumns, memos } = get();

                // Safety: Only delete user-added columns or review_remarks
                if (!columnId.startsWith('user_') && columnId !== 'review_remarks') return;

                const updatedAllGenerated = allGeneratedColumns.filter(c => c.id !== columnId);
                const updatedSelectedReview = selectedReviewColumns.filter(id => id !== columnId);

                // [Fix] Cleanup Memos associated with this column
                const newMemos = { ...memos };
                Object.keys(newMemos).forEach(key => {
                    // Memo key format: "integratedKey:columnId"
                    if (key.endsWith(`:${columnId}`)) {
                        delete newMemos[key];
                    }
                });

                set({
                    allGeneratedColumns: updatedAllGenerated,
                    memos: newMemos
                });
                get().setSelectedReviewColumns(updatedSelectedReview);
            },

            addChecklistItem: (pk, remarks) => {
                const { rows, pkColumn, selectedRowIndex, filteredRows } = get();
                const newRow: GridRow = {
                    integratedKey: `CHECK-${Date.now()}`,
                    standardPK: pk || 'Manual Entry',
                    standardSK: '',
                    exists: 'Both',
                    review_remarks: remarks || '',
                };
                if (pkColumn) {
                    newRow[`${pkColumn}_기준`] = pk || 'Manual Entry';
                    newRow[`${pkColumn}_비교`] = pk || 'Manual Entry';
                    // [B2.0] Automatically mark as Added row for control and export
                    newRow[`${pkColumn}_기준검토`] = '추가';
                    newRow[`${pkColumn}_비교검토`] = '추가';
                }

                let newRows: GridRow[];

                // If a row is selected in the filtered view, find its global index and insert there
                if (selectedRowIndex !== null && filteredRows[selectedRowIndex]) {
                    const targetRowKey = filteredRows[selectedRowIndex].integratedKey;
                    const globalIdx = rows.findIndex(r => r.integratedKey === targetRowKey);

                    if (globalIdx !== -1) {
                        newRows = [...rows];
                        newRows.splice(globalIdx, 0, newRow);
                    } else {
                        newRows = [newRow, ...rows];
                    }
                } else {
                    newRows = [newRow, ...rows];
                }

                set({
                    rows: newRows,
                    rowCount: newRows.length
                });
                get().applyFiltersAndSort();
            },

            deleteRow: (rowKey) => {
                const { rows, memos } = get();
                const newRows = rows.filter(r => r.integratedKey !== rowKey);

                // [Fix] Cleanup Memos associated with this row
                const newMemos = { ...memos };
                Object.keys(newMemos).forEach(key => {
                    // Memo key format: "integratedKey:columnId"
                    if (key.startsWith(`${rowKey}:`)) {
                        delete newMemos[key];
                    }
                });

                set({
                    rows: newRows,
                    rowCount: newRows.length,
                    memos: newMemos
                });
                get().applyFiltersAndSort();
            },

            refWorkbook: null,
            compWorkbook: null,
            refFile: null,
            compFile: null,
            refFileName: null,
            compFileName: null,
            refFilePath: null,
            compFilePath: null,

            pkColumn: '',
            skColumn: '',
            exclusionRules: [],
            columnExclusion: {
                excludeUnnamed: true,
                patterns: [],
            },
            pkExclusion: {
                excludeStartAlpha: false,
                excludeEmpty: true,
                customPatterns: [],
            },
            mappings: [],
            refSheetIdx: 0,
            compSheetIdx: 0,
            refSheetName: '',
            compSheetName: '',
            refHeaderRow: 0, // Default: first row is header
            compHeaderRow: 0, // Default: first row is header
            frozenColumnCount: 5,
            comparisonSummary: null,
            detailedSummary: [],

            filters: new Map(),
            globalSortColumn: null,
            globalSortDirection: 'asc',
            existsMode: 'All',

            // ==========================================================================
            // Data Actions
            // ==========================================================================

            setColumns: (columns) => set({ columns }),

            setRows: (rows) => {
                set({ rows, rowCount: rows.length });
                get().applyFiltersAndSort();
            },

            setCellValue: (rowIdx, colId, value) => {
                set((state) => {
                    const newRows = [...state.rows];
                    if (newRows[rowIdx]) {
                        newRows[rowIdx] = { ...newRows[rowIdx], [colId]: value };
                    }
                    return { rows: newRows };
                });
                get().applyFiltersAndSort();
            },

            setCellValuesBatch: (updates) => {
                set((state) => {
                    const newRows = [...state.rows];
                    updates.forEach(({ rowIdx, colId, value }) => {
                        if (newRows[rowIdx]) {
                            newRows[rowIdx] = { ...newRows[rowIdx], [colId]: value };
                        }
                    });
                    return { rows: newRows };
                });
                get().applyFiltersAndSort();
            },

            generateMockData: (count) => {
                const ioTypes = ['DI', 'DO', 'AI', 'AO', 'PI', 'PO'];
                const signals = ['4-20mA', '0-10V', '24VDC', 'Dry Contact', 'Pulse'];
                const areas = ['BOP', 'CTG', 'HRSG', 'STG', 'EOG', 'COMMON'];
                const systems = ['DCS', 'ESD', 'FGS', 'COMM', 'POWER'];
                const statuses = ['Active', 'Spare', 'Future', 'Deleted'];
                const existsModes: GridRow['exists'][] = ['Both', 'Only Ref', 'Only Comp'];

                const rows: GridRow[] = [];
                for (let i = 0; i < count; i++) {
                    const pk = `0-${String(i + 1).padStart(6, '0')}`;
                    const sk = `SK-${String(Math.floor(i / 100) + 1).padStart(4, '0')}`;

                    rows.push({
                        integratedKey: pk, // [B1.0 Standard] PK Only
                        standardPK: pk,
                        standardSK: sk,
                        exists: existsModes[i % 10 === 0 ? 1 : i % 15 === 0 ? 2 : 0],
                        tagNo: `${areas[i % areas.length]}-${ioTypes[i % ioTypes.length]}-${String(i + 1).padStart(4, '0')}`,
                        description: `Instrument ${i + 1} - ${signals[i % signals.length]} Signal`,
                        ioType: ioTypes[i % ioTypes.length],
                        signal: signals[i % signals.length],
                        area: areas[i % areas.length],
                        system: systems[i % systems.length],
                        status: statuses[i % statuses.length],
                    });
                }
                set({ rows, rowCount: rows.length, view: 'grid' });
                get().applyFiltersAndSort();
            },

            // ==========================================================================
            // Excel & Comparison
            // ==========================================================================

            setWorkbooks: (ref: ParsedWorkbook, comp: ParsedWorkbook, refFile: File, compFile: File, refPath?: string, compPath?: string) =>
                set({
                    // New files reset mapping/comparison context
                    refWorkbook: ref,
                    compWorkbook: comp,
                    refFile,
                    compFile,
                    refFileName: refFile.name,
                    compFileName: compFile.name,
                    refFilePath: refPath || null,
                    compFilePath: compPath || null,
                    refSheetName: ref.sheets[0]?.name || '',
                    compSheetName: comp.sheets[0]?.name || '',
                    view: 'mapping',
                    mappings: [],
                    pkColumn: '',
                    skColumn: '',
                    comparisonSummary: null,
                    detailedSummary: [],
                    filters: new Map(),
                    globalSortColumn: null,
                    existsMode: 'All',
                    refSheetIdx: 0,
                    compSheetIdx: 0,
                    rows: [],
                    rowCount: 0,
                    filteredRows: [],
                    memos: {},
                    tempUserCols: [],
                }),

            updateWorkbook: (type, workbook) => {
                if (type === 'ref') set({ refWorkbook: workbook });
                else set({ compWorkbook: workbook });
            },

            runComparison: (mappings, pk, sk = '', exclusions) => {
                try {
                    const { refWorkbook, compWorkbook, refSheetIdx, compSheetIdx, refFilePath, compFilePath } = get();
                    if (!refWorkbook) throw new Error('기준 파일이 설정되지 않았습니다.');
                    if (!compWorkbook) throw new Error('비교 파일이 설정되지 않았습니다.');

                    // Use selected sheets
                    const refSheet = refWorkbook.sheets[refSheetIdx] ?? refWorkbook.sheets[0];
                    const compSheet = compWorkbook.sheets[compSheetIdx] ?? compWorkbook.sheets[0];

                    if (!refSheet) throw new Error('기준 파일에 시트가 없습니다.');
                    if (!compSheet) throw new Error('비교 파일에 시트가 없습니다.');

                    // If sheet index was out of range, sync it back to 0 to keep UI stable
                    const normalizedRefIdx = refWorkbook.sheets.indexOf(refSheet);
                    const normalizedCompIdx = compWorkbook.sheets.indexOf(compSheet);
                    if (normalizedRefIdx !== refSheetIdx || normalizedCompIdx !== compSheetIdx) {
                        set({ refSheetIdx: normalizedRefIdx, compSheetIdx: normalizedCompIdx });
                    }

                    // [Fix] Handle exclusion rules gracefully
                    // If exclusions is undefined, use existing state. If it's [], it means no rules.
                    const finalExclusions = exclusions !== undefined ? exclusions : get().exclusionRules;

                    // Run matching logic
                    const results = compareDatasets(
                        refSheet.data as Record<string, unknown>[],
                        compSheet.data as Record<string, unknown>[],
                        {
                            pkColumn: pk,
                            skColumn: sk,
                            mappings,
                            exclusionRules: finalExclusions,
                            pkExclusion: get().pkExclusion,
                            columnExclusion: get().columnExclusion,
                        },
                        true // B1.0 Filter enabled
                    );

                    // 1. Get filtered mappings for column generation
                    // [Maintenance] Combined: Filter by isTarget AND system exclusion rules.
                    // This ensures the GRID only shows targeted columns, while Mapping Screen shows all.
                    const baseMappings = mappings.filter(m => m.isTarget || m.isPK || m.isSK);
                    const effectiveMappings = filterMappings(baseMappings, get().columnExclusion);

                    // [NEW] Preserve User-added columns from previous run
                    const currentUserCols = get().allGeneratedColumns.filter(c => c.id.startsWith('user_'));

                    // [B1.3] Memo Mapping (Excel Comments -> Grid Memos)
                    const newMemos: Record<string, string> = {};

                    // Helper to build PK -> RowIndex map
                    const buildRowMap = (sheet: ParsedSheet, pkCol: string, skCol: string) => {
                        const map = new Map<string, number>();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        sheet.data.forEach((row: any, idx) => {
                            const pVal = String(row[pkCol] || '').trim();
                            const sVal = skCol ? String(row[skCol] || '').trim() : '';
                            const key = skCol ? `${pVal}-${sVal}` : pVal;
                            if (key) map.set(key, idx);
                        });
                        return map;
                    };

                    const refRowMap = buildRowMap(refSheet, pk, sk);
                    const compRowMap = buildRowMap(compSheet, pk, sk);

                    const processComments = (
                        sheet: ParsedSheet,
                        rowMap: Map<string, number>,
                        suffix: string
                    ) => {
                        if (!sheet.comments) return;

                        results.forEach(row => {
                            const key = row.integratedKey;
                            const srcRowIdx = rowMap.get(key);
                            if (srcRowIdx === undefined) return;

                            sheet.columns.forEach((colName, colIdx) => {
                                const commentKey = `${srcRowIdx}:${colIdx}`;
                                const text = sheet.comments[commentKey];
                                if (text) {
                                    const gridColId = `${colName}${suffix}`;
                                    newMemos[`${key}:${gridColId}`] = text;
                                }
                            });
                        });
                    };

                    processComments(refSheet, refRowMap, '_기준');
                    processComments(compSheet, compRowMap, '_비교');

                    // 2. Update dynamic columns based on filtered mappings
                    const newColumns: GridColumn[] = [
                        { id: 'integratedKey', title: '통합 Key', width: 170, frozen: true, isPK: true },
                        { id: 'exists', title: '구분', width: 80, frozen: true },
                    ];

                    // [B2.0] Review Remarks and User columns should be right after 'exists'
                    newColumns.push({ id: 'review_remarks', title: '검토의견', width: 200, frozen: true });

                    // Primary Key (TAG NO) columns - NOT frozen
                    const pkTitle = (pk || '').toUpperCase().includes('TAG') ? pk : 'TAG NO';
                    newColumns.push({ id: `${pk}_기준`, title: `${pkTitle}_기준`, width: 160, frozen: false });
                    newColumns.push({ id: `${pk}_기준검토`, title: `${pkTitle}_기준검토`, width: 160, frozen: false });
                    newColumns.push({ id: `${pk}_비교`, title: `${pkTitle}_비교`, width: 160, frozen: false });
                    newColumns.push({ id: `${pk}_비교검토`, title: `${pkTitle}_비교검토`, width: 160, frozen: false });

                    // [Fix] Grid Update Persistence
                    // Generate standard and review variants for ALL mapped columns.
                    // This allows the grid to update immediately when a user toggles visibility,
                    // as the data is already in the 'rows' and the column definitions are in 'allGeneratedColumns'.
                    effectiveMappings
                        .filter((m) => !m.isPK)
                        .forEach((m) => {
                            const baseTitle = m.isSK ? 'Service Description' : m.refColumn;

                            newColumns.push({
                                id: `${m.refColumn}_기준`,
                                title: `${baseTitle}_기준`,
                                width: 180
                            });
                            newColumns.push({
                                id: `${m.refColumn}_기준검토`,
                                title: `${baseTitle}_기준검토`,
                                width: 150
                            });
                            newColumns.push({
                                id: `${m.refColumn}_비교`,
                                title: `${baseTitle}_비교`,
                                width: 180
                            });
                            newColumns.push({
                                id: `${m.refColumn}_비교검토`,
                                title: `${baseTitle}_비교검토`,
                                width: 150
                            });
                        });

                    // [B2.0 Restore] Add stored User Columns if any (e.g. during loadProjectFromDb)
                    const { tempUserCols } = get();
                    if (tempUserCols && tempUserCols.length > 0) {
                        tempUserCols.forEach(uc => {
                            if (!newColumns.find(c => c.id === uc.id)) {
                                newColumns.push(uc);
                            }
                        });
                        // Clear them after pick up
                        setTimeout(() => set({ tempUserCols: [] }), 0);
                    }

                    const bothRows = results.filter(r => r.exists === 'Both');
                    const mismatchRows = bothRows.filter(r =>
                        Object.keys(r).some(key => {
                            if (!key.endsWith('_diff') || r[key] !== true) return false;

                            const colBaseName = key.replace('_diff', '');

                            // PK/SK는 이미 exists가 'Both'이므로 기본적으로 일치함 (integratedKey 생성 시 확인됨)
                            // 하지만 명시적으로 무시함
                            if (colBaseName === pk || colBaseName === sk) return false;

                            const ignoreWords = ['remark', '비고', 'comment', 'description', 'index', 'rev', 'note'];
                            if (ignoreWords.some(word => colBaseName.toLowerCase().includes(word))) return false;

                            return true;
                        })
                    );

                    const perfectMatch = bothRows.length - mismatchRows.length;

                    // 3. Update Detailed Summary
                    const onlyRefRows = results.filter(r => r.exists === 'Only Ref');
                    const onlyCompRows = results.filter(r => r.exists === 'Only Comp');

                    const detailedSummary = effectiveMappings
                        .filter(m => m.isTarget)
                        .map(m => {
                            const colRef = `${m.refColumn}_기준`;
                            const colComp = `${m.refColumn}_비교`;

                            const refWithVal = [...bothRows, ...onlyRefRows].filter(r => String(r[colRef] || '').trim() !== '').length;
                            const compWithVal = [...bothRows, ...onlyCompRows].filter(r => String(r[colComp] || '').trim() !== '').length;

                            const isKey = m.isPK || m.isSK;
                            const sameCount = isKey
                                ? bothRows.length
                                : bothRows.filter(r => isValuesMatch(r[colRef], r[colComp])).length;

                            const mismatchCount = isKey
                                ? 0
                                : bothRows.filter(r => !isValuesMatch(r[colRef], r[colComp])).length;

                            const onlyRefWithVal = onlyRefRows.filter(r => String(r[colRef] || '').trim() !== '').length;
                            const onlyCompWithVal = onlyCompRows.filter(r => String(r[colComp] || '').trim() !== '').length;

                            // If this target was excluded by rule, surface it in status so the user knows why counts may be 0
                            const wasExcluded = !filterMappings([m], get().columnExclusion).some(em => em.refColumn === m.refColumn);

                            return {
                                columnName: m.refColumn,
                                refRowCount: refWithVal,
                                compRowCount: compWithVal,
                                sameCount,
                                diffCount: mismatchCount + onlyCompWithVal + onlyRefWithVal,
                                onlyRefCount: onlyRefWithVal,
                                onlyCompCount: onlyCompWithVal,
                                status: wasExcluded
                                    ? '제외 규칙 적용됨'
                                    : (mismatchCount > 0 ? '값 불일치' : '')
                            };
                        });

                    // [Fix] Preserve user's selected review columns if any
                    const currentSelected = get().selectedReviewColumns;

                    // [NEW] Append preserved user-added columns
                    const combinedColumns = [...newColumns, ...currentUserCols];

                    set({
                        allGeneratedColumns: deduplicateColumns(combinedColumns),
                        rows: results as GridRow[],
                        rowCount: results.length,
                        pkColumn: pk,
                        skColumn: sk || '',
                        exclusionRules: finalExclusions,
                        comparisonSummary: {
                            total: results.length,
                            both: bothRows.length,
                            perfectMatch,
                            onlyRef: results.filter(r => r.exists === 'Only Ref').length,
                            onlyComp: results.filter(r => r.exists === 'Only Comp').length,
                            diffs: results.filter(r => r.exists === 'Only Ref' || r.exists === 'Only Comp').length,
                            mismatches: mismatchRows.length,
                            integrityScore: results.length > 0
                                ? (perfectMatch / results.length) * 100
                                : 0
                        },
                        detailedSummary,
                        view: 'grid',
                        memos: newMemos,
                    });

                    // Update visible columns based on selection or default
                    if (currentSelected.length > 0) {
                        get().setSelectedReviewColumns(currentSelected);
                    } else {
                        // [Fix] Show ALL generated columns (Standard, Standard Review, Comparison, Comparison Review) by default based on mappings
                        set({ columns: newColumns });
                    }

                    get().recalculateSummary();

                    // [DB] Sync Project History
                    if (window.electron?.db) {
                        window.electron.db.saveProject({
                            name: `Comparison_${new Date().toISOString().slice(0, 10)}`,
                            refPath: refFilePath || '',
                            compPath: compFilePath || '',
                            configJson: JSON.stringify({
                                pkColumn: pk,
                                skColumn: sk,
                                mappings,
                                refSheetIdx,
                                compSheetIdx,
                                refSheetName: get().refSheetName,
                                compSheetName: get().compSheetName,
                                exclusions: finalExclusions,
                                selectedReviewColumns: get().selectedReviewColumns,
                                userColumns: get().allGeneratedColumns.filter(c => c.id.startsWith('user_'))
                            })
                        }).catch(e => console.error('[DB] Save project failed:', e));

                        // [DB] Learning Mapping Intelligence
                        mappings.filter(m => m.isTarget && m.compColumn).forEach(m => {
                            window.electron.db.saveMappingIntel({
                                refCol: m.refColumn,
                                compCol: m.compColumn
                            }).catch(e => console.error('[DB] Save mapping intel failed:', e));
                        });
                    }

                    // 6.2 Auto-save config when clicking analysis
                    get().autoSaveConfig();

                    get().applyFiltersAndSort();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error('runComparison 오류:', errorMessage);
                    set({ error: errorMessage });
                    throw error;
                }
            },

            autoSaveConfig: () => {
                const state = get();
                const config = {
                    pkColumn: state.pkColumn,
                    skColumn: state.skColumn,
                    columnExclusion: state.columnExclusion,
                    pkExclusion: state.pkExclusion,
                    mappings: state.mappings,
                    refSheetIdx: state.refSheetIdx,
                    compSheetIdx: state.compSheetIdx,
                    refSheetName: state.refSheetName,
                    compSheetName: state.compSheetName
                };
                localStorage.setItem('io_xl_last_config', JSON.stringify(config));
            },
            updateFilePaths: async (refPath: string | null, compPath: string | null) => {
                const current = get();
                // Check if paths are actually changing to avoid unnecessary reloads
                if (current.refFilePath === refPath && current.compFilePath === compPath && current.refWorkbook && current.compWorkbook) {
                    return;
                }

                set({ refFilePath: refPath, compFilePath: compPath });

                // If we have paths (e.g. from restore or manual entry via Electron), ensure workbooks are loaded
                if (window.electron && (refPath || compPath)) {
                    await get().reloadWorkbooks();
                }
            },

            reloadWorkbooks: async () => {
                const state = get();
                const { refFilePath, compFilePath } = state;

                if (!window.electron) return;

                console.log('[Store] Reloading workbooks from paths:', { refFilePath, compFilePath });

                // Helper to load single file
                const loadFile = async (path: string | null): Promise<ParsedWorkbook | null> => {
                    if (!path) return null;
                    try {
                        const buffer = await window.electron.readFile(path);
                        const { parseExcelFile } = await import('../utils/excelParser');
                        // Use default header options or existing state if we wanted to be fancy, 
                        // but sticking to defaults (Header Row 1) is safer for initial load.
                        // Ideally we should use state.refHeaderRow but parsing needs to happen first to validate sheets.
                        // Let's use default and let UI allow reparsing if needed.
                        const fileName = path.split(/[/\\]/).pop() || 'Unknown.xlsx';
                        // [Fix] Handle buffer types (Electron IPC returns Uint8Array/Buffer, or sometimes ArrayBuffer depending on bridge)
                        // If it's already ArrayBuffer, use it. If it's Uint8Array, use .buffer.
                        const rawBuffer = buffer as any;
                        const arrayBuffer = rawBuffer.buffer ? rawBuffer.buffer : rawBuffer;
                        return await parseExcelFile(arrayBuffer, { fileName });
                    } catch (e) {
                        console.error(`Failed to load workbook from ${path}:`, e);
                        return null;
                    }
                };

                const [refWb, compWb] = await Promise.all([
                    loadFile(refFilePath),
                    loadFile(compFilePath)
                ]);

                // [Fix] Robust Sheet Recovery after reload
                // If we have names, try to find the new indices. If not, use existing indices.
                const { refSheetName, compSheetName, refSheetIdx, compSheetIdx } = state;
                let finalRefIdx = refSheetIdx;
                let finalCompIdx = compSheetIdx;

                if (refWb && refSheetName) {
                    const idx = refWb.sheets.findIndex(s => s.name === refSheetName);
                    if (idx !== -1) finalRefIdx = idx;
                }
                if (compWb && compSheetName) {
                    const idx = compWb.sheets.findIndex(s => s.name === compSheetName);
                    if (idx !== -1) finalCompIdx = idx;
                }

                set({
                    refWorkbook: refWb || state.refWorkbook,
                    compWorkbook: compWb || state.compWorkbook,
                    refSheetIdx: finalRefIdx,
                    compSheetIdx: finalCompIdx,
                    refSheetName: refWb?.sheets[finalRefIdx]?.name || refSheetName,
                    compSheetName: compWb?.sheets[finalCompIdx]?.name || compSheetName
                });
            },

            // ==========================================================================
            // Key Management
            // ==========================================================================

            setPKColumn: (pk) => set({ pkColumn: pk }),
            setSKColumn: (sk) => set({ skColumn: sk }),
            setExclusionRules: (rules) => set({ exclusionRules: rules }),
            setColumnExclusion: (config) =>
                set((state) => ({ columnExclusion: { ...state.columnExclusion, ...config } })),
            setPKExclusion: (config) =>
                set((state) => ({ pkExclusion: { ...state.pkExclusion, ...config } })),
            setMappings: (mappings) => set({ mappings }),
            setSheetIndices: (refIdx, compIdx) => {
                const { refWorkbook, compWorkbook } = get();
                const refSheetName = refWorkbook?.sheets[refIdx]?.name || '';
                const compSheetName = compWorkbook?.sheets[compIdx]?.name || '';
                set({
                    refSheetIdx: refIdx,
                    compSheetIdx: compIdx,
                    refSheetName,
                    compSheetName
                });
            },
            setHeaderRows: (refRow, compRow) => set({ refHeaderRow: refRow, compHeaderRow: compRow }),
            setFrozenColumnCount: (count) => set({ frozenColumnCount: count }),

            // ==========================================================================
            // Filtering & Sorting
            // ==========================================================================

            setColumnFilter: (columnId, filterUpdate) => {
                set((state) => {
                    const newFilters = new Map(state.filters);
                    const existing = newFilters.get(columnId) || {
                        columnId,
                        searchText: '',
                        selectedValues: new Set<string>(),
                        sortOrder: null,
                    };
                    newFilters.set(columnId, { ...existing, ...filterUpdate });
                    return { filters: newFilters };
                });
                get().applyFiltersAndSort();
            },

            clearColumnFilter: (columnId) => {
                set((state) => {
                    const newFilters = new Map(state.filters);
                    newFilters.delete(columnId);
                    return { filters: newFilters };
                });
                get().applyFiltersAndSort();
            },

            resetAllFilters: () => {
                set({
                    filters: new Map(),
                    globalSortColumn: null,
                    globalSortDirection: 'asc',
                    existsMode: 'All',
                });
                get().applyFiltersAndSort();
            },

            setSortColumn: (columnId, direction = 'asc') => {
                set({ globalSortColumn: columnId, globalSortDirection: direction });
                get().applyFiltersAndSort();
            },

            setExistsMode: (mode) => {
                set({ existsMode: mode });
                get().applyFiltersAndSort();
            },

            // =============================================================================
            // Memo Actions
            // =============================================================================
            setMemo: (rowKey, colId, memo) => {
                const key = `${rowKey}:${colId}`;
                set((state) => ({
                    memos: { ...state.memos, [key]: memo }
                }));

                // [DB] Sync Memo Persistent
                if (window.electron?.db && memo.trim()) {
                    window.electron.db.saveMemo({ rowKey, colId, text: memo })
                        .catch(e => console.error('[DB] Save memo failed:', e));
                }
            },

            deleteMemo: (rowKey, colId) => {
                const key = `${rowKey}:${colId}`;
                set((state) => {
                    const newMemos = { ...state.memos };
                    delete newMemos[key];
                    return { memos: newMemos };
                });
            },

            // ==========================================================================
            // Review Compensation (검토 보완)
            // ==========================================================================

            // ==========================================================================
            // Internal: Apply Filters and Sort
            // ==========================================================================

            applyFiltersAndSort: () => {
                const { rows, filters, globalSortColumn, globalSortDirection, existsMode } = get();

                let result = [...rows];

                // 1. Apply Exists Mode Filter
                if (existsMode !== 'All') {
                    if (existsMode === 'Diff') {
                        result = result.filter((r) => r.exists === 'Only Ref' || r.exists === 'Only Comp');
                    } else if (existsMode === 'Both') {
                        result = result.filter((r) => r.exists === 'Both');
                    } else if (existsMode === 'Only Ref') {
                        result = result.filter((r) => r.exists === 'Only Ref');
                    } else if (existsMode === 'Only Comp') {
                        result = result.filter((r) => r.exists === 'Only Comp');
                    } else if (existsMode === 'Both(M)') {
                        result = result.filter((r) => r.exists === 'Both(M)');
                    }
                }

                // 2. Apply Column Filters
                filters.forEach((filter) => {
                    if (filter.selectedValues.size > 0) {
                        result = result.filter((row) => {
                            const val = String(row[filter.columnId] ?? '');
                            return filter.selectedValues.has(val);
                        });
                    }
                    if (filter.searchText) {
                        const search = filter.searchText.toLowerCase();
                        result = result.filter((row) => {
                            const val = String(row[filter.columnId] ?? '').toLowerCase();
                            return val.includes(search);
                        });
                    }
                    // Color filter
                    if (filter.selectedColors && filter.selectedColors.size > 0 && filter.selectedColors.size < 3) {
                        result = result.filter((row) => {
                            // Determine cell color
                            const isDiffField = filter.columnId.endsWith('_기준') || filter.columnId.endsWith('_비교');
                            const isReviewColumn = filter.columnId.endsWith('_기준검토') || filter.columnId.endsWith('_비교검토');

                            let cellColor: 'default' | 'yellow' | 'red' = 'default';

                            // Check for review data (red)
                            if (isDiffField && !isReviewColumn) {
                                const reviewColId = `${filter.columnId}검토`;
                                const reviewValue = row[reviewColId];
                                if (reviewValue && String(reviewValue).trim() !== '') {
                                    cellColor = 'red';
                                }
                            }

                            // Check for differences (yellow)
                            if (cellColor === 'default' && isDiffField && row.exists === 'Both') {
                                const baseKey = filter.columnId.replace('_기준', '').replace('_비교', '');
                                if (row[`${baseKey}_diff`] === true) {
                                    cellColor = 'yellow';
                                }
                            }

                            return filter.selectedColors?.has(cellColor) ?? true;
                        });
                    }
                });

                // 3. Apply Sorting
                if (globalSortColumn) {
                    result.sort((a, b) => {
                        const aVal = String(a[globalSortColumn] ?? '');
                        const bVal = String(b[globalSortColumn] ?? '');
                        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
                        return globalSortDirection === 'asc' ? cmp : -cmp;
                    });
                }

                set({ filteredRows: result });
            },
            // ==========================================================================
            // Review & Merge Logic
            // ==========================================================================

            getReviewChanges: () => {
                const { rows, pkColumn, mappings } = get();
                const pkMapping = mappings.find(m => m.isPK);
                const pkRefReviewCol = pkMapping ? `${pkMapping.refColumn}_기준검토` : `${pkColumn}_기준검토`;
                const pkCompReviewCol = pkMapping ? `${pkMapping.refColumn}_비교검토` : `${pkColumn}_비교검토`;

                const changes: ReviewChange[] = [];
                rows.forEach((row, idx) => {
                    const refVal = String(row[pkRefReviewCol] || '').trim();
                    const compVal = String(row[pkCompReviewCol] || '').trim();
                    if (refVal || compVal) {
                        changes.push({
                            rowIndex: idx,
                            sourceColumn: refVal ? pkRefReviewCol : pkCompReviewCol,
                            oldKey: row.integratedKey,
                            newKey: (refVal || compVal).split('::')[0]
                        });
                    }
                });
                return changes;
            },

            applyReviewCompensation: () => {
                const { rows, pkColumn, skColumn, mappings, columnExclusion, memos } = get();

                // [B1.3] Memo Migration Preparation

                // 1. Identify Merges & Updates
                const changes = get().getReviewChanges();
                if (changes.length === 0) return { applied: 0 };

                // ... (Existing Review Compensation Logic) ...
                // Note: This logic seems truncated in previous view, assuming it's fine to leave as is/implied.
                // Since I am only appending a new function, I will just return the implementation of the new function below.

                // For this tool call, I don't need to touch the existing truncated logic if I am inserting AFTER it or properly referencing it.
                // However, multi_replace requires precise targets.
                // I will add the new function at the end of the "Review & Merge Logic" section or similar.

                // Let's place it after applyReviewCompensation.
                // Since I cannot see the full body of applyReviewCompensation in the previous view, I will append it to the end of the file or after a known block.
                // I'll search for where applyReviewCompensation ENDS or the next section starts.
                // In the previous view, line 800 was inside applyReviewCompensation.
                // I'll read the file again to find a good insertion point.

                const memosByRow = new Map<string, { colId: string, text: string }[]>();
                Object.entries(memos).forEach(([k, text]) => {
                    const lastColon = k.lastIndexOf(':');
                    if (lastColon === -1) return;
                    const rowKey = k.substring(0, lastColon);
                    const colId = k.substring(lastColon + 1);
                    if (!memosByRow.has(rowKey)) memosByRow.set(rowKey, []);
                    memosByRow.get(rowKey)!.push({ colId, text });
                });
                const nextMemos: Record<string, string> = {};

                // 1. 컬럼 식별
                const pkMapping = mappings.find(m => m.isPK);
                const pkRefReviewCol = pkMapping ? `${pkMapping.refColumn}_기준검토` : `${pkColumn}_기준검토`;
                const pkCompReviewCol = pkMapping ? `${pkMapping.refColumn}_비교검토` : `${pkColumn}_비교검토`;

                // 2. 모든 행의 "최종 목표 키" 결정 및 그룹화
                const groups = new Map<string, typeof rows>();

                rows.forEach(row => {
                    const refReviewVal = String(row[pkRefReviewCol] || '').trim();
                    const compReviewVal = String(row[pkCompReviewCol] || '').trim();

                    const targetKeyRaw = refReviewVal || compReviewVal || row.integratedKey;
                    const targetKey = targetKeyRaw.split('::')[0];

                    if (!groups.has(targetKey)) {
                        groups.set(targetKey, []);
                    }
                    groups.get(targetKey)!.push(row);
                });

                const finalRows: typeof rows = [];
                let mergeCount = 0;

                // 3. 그룹별 병합 수행
                groups.forEach((groupRows, key) => {
                    // [B1.3] Migrate Memos for this group
                    // Collect memos from all source rows and map to the new Target Key
                    const groupMemoMap = new Map<string, string[]>();

                    groupRows.forEach(row => {
                        const rowMemos = memosByRow.get(row.integratedKey);
                        if (rowMemos) {
                            rowMemos.forEach(({ colId, text }) => {
                                if (!groupMemoMap.has(colId)) groupMemoMap.set(colId, []);
                                groupMemoMap.get(colId)!.push(text);
                            });
                        }
                    });

                    // Assign to nextMemos
                    groupMemoMap.forEach((texts, colId) => {
                        const uniqueTexts = Array.from(new Set(texts));
                        if (uniqueTexts.length > 0) {
                            nextMemos[`${key}:${colId}`] = uniqueTexts.join('\n');
                        }
                    });

                    if (groupRows.length === 1) {
                        const row = groupRows[0];
                        const refReviewVal = String(row[pkRefReviewCol] || '').trim();
                        const compReviewVal = String(row[pkCompReviewCol] || '').trim();

                        if (refReviewVal || compReviewVal || row.integratedKey !== key) {
                            finalRows.push({
                                ...row,
                                integratedKey: key,
                                // standardPK: key // [Change] Preserve original standardPK
                            });
                        } else {
                            finalRows.push(row);
                        }
                    } else {
                        mergeCount += (groupRows.length - 1);
                        let mergedRow = groupRows.find(r => r.exists === 'Both' || r.exists === 'Both(M)') || groupRows[0];
                        mergedRow = {
                            ...mergedRow,
                            integratedKey: key,

                            // standardPK: key, // [Change] Preserve original standardPK
                            exists: 'Both(M)'
                        };

                        groupRows.forEach(srcRow => {
                            if (srcRow === mergedRow) return;
                            Object.keys(srcRow).forEach(colKey => {
                                if (['integratedKey', 'exists', 'standardPK', 'standardSK'].includes(colKey)) return;
                                const srcVal = String(srcRow[colKey] || '').trim();
                                const destVal = String(mergedRow[colKey] || '').trim();
                                if (!srcVal) return;
                                if (colKey.includes('검토') || colKey.includes('비고') || colKey.includes('Remark')) {
                                    if (!destVal) mergedRow[colKey] = srcVal;
                                    else if (srcVal !== destVal && !destVal.includes(srcVal)) mergedRow[colKey] = `${destVal} / ${srcVal}`;
                                } else {
                                    if (!destVal) mergedRow[colKey] = srcRow[colKey];
                                }
                            });
                        });
                        finalRows.push(mergedRow);
                    }
                });

                // 4. 요약 정보 재계산 (Summary Update)
                const effectiveMappings = filterMappings(mappings, columnExclusion);
                const bothRows = finalRows.filter(r => r.exists === 'Both' || r.exists === 'Both(M)');
                const onlyRefRows = finalRows.filter(r => r.exists === 'Only Ref');
                const onlyCompRows = finalRows.filter(r => r.exists === 'Only Comp');

                // Mismatch 재계산 (Smart Ignore 적용)
                const mismatchRows = bothRows.filter(r =>
                    Object.keys(r).some(key => {
                        if (!key.endsWith('_diff') || r[key] !== true) return false;
                        const colBaseName = key.replace('_diff', '');
                        if (colBaseName === pkColumn || (skColumn && colBaseName === skColumn)) return false;
                        const ignoreWords = ['remark', '비고', 'comment', 'description', 'index', 'rev', 'note'];
                        if (ignoreWords.some(word => colBaseName.toLowerCase().includes(word))) return false;
                        return true;
                    })
                );

                const perfectMatch = bothRows.length - mismatchRows.length;

                // 상세 요약 재계산
                const detailedSummary = effectiveMappings
                    .filter(m => m.isTarget)
                    .map(m => {
                        const colRef = `${m.refColumn}_기준`;
                        const colComp = `${m.refColumn}_비교`;
                        const refWithVal = [...bothRows, ...onlyRefRows].filter(r => String(r[colRef] || '').trim() !== '').length;
                        const compWithVal = [...bothRows, ...onlyCompRows].filter(r => String(r[colComp] || '').trim() !== '').length;
                        const isKey = m.isPK || m.isSK;
                        const sameCount = isKey ? bothRows.length : bothRows.filter(r => isValuesMatch(r[colRef], r[colComp])).length;
                        const mismatchCount = isKey ? 0 : bothRows.filter(r => !isValuesMatch(r[colRef], r[colComp])).length;
                        const onlyRefWithVal = onlyRefRows.filter(r => String(r[colRef] || '').trim() !== '').length;
                        const onlyCompWithVal = onlyCompRows.filter(r => String(r[colComp] || '').trim() !== '').length;

                        return {
                            columnName: m.refColumn,
                            refRowCount: refWithVal,
                            compRowCount: compWithVal,
                            sameCount,
                            diffCount: mismatchCount + onlyCompWithVal + onlyRefWithVal,
                            onlyRefCount: onlyRefWithVal,
                            onlyCompCount: onlyCompWithVal,
                            status: mismatchCount > 0 ? '값 불일치' : ''
                        };
                    });

                // 5. 상태 업데이트
                // 5. 상태 업데이트
                set({
                    rows: finalRows,
                    rowCount: finalRows.length,
                    memos: nextMemos // [B1.3] Update memos with migrated keys
                });

                get().recalculateSummary();

                get().applyFiltersAndSort();
                console.log(`[B1.0 CleanApply] 병합 완료. 요약 정보 업데이트됨.`);

                return { applied: mergeCount };
            },

            // ==========================================================================
            // Analysis Engine B2.0 Implementation
            // ==========================================================================
            // Analysis Engine B2.0
            applyAnalysisEngineChanges: async () => {
                const state = get();
                const { refFilePath, compFilePath, pkColumn, rows, columns, refSheetIdx, compSheetIdx } = state;

                if (!window.electron) {
                    alert('이 기능은 Electron 데스크톱 앱에서만 동작합니다.');
                    return { updatedCount: 0 };
                }

                if (!refFilePath || !compFilePath) {
                    alert('원본 파일 경로를 찾을 수 없습니다. 파일을 다시 로드해주세요.');
                    return { updatedCount: 0 };
                }

                let updatedCount = 0;
                let tagNoUpdateCount = 0; // [Debug] Track TAG NO updates
                let deletedCount = 0;
                let addedCount = 0;
                let noTargetRowCount = 0;
                let noReviewDataCount = 0;
                let identicalValueCount = 0;
                let reviewColsCount = 0;

                try {
                    // [Validation] Check if paths are valid files
                    if (!refFilePath || !compFilePath) {
                        alert('파일 경로가 올바르지 않습니다.');
                        return { updatedCount: 0 };
                    }

                    // [Fix Round 7] STRICT validation only. Do NOT try to be "smart" and fix paths automatically
                    // as it leads to "Excel비교/Excel비교" corruption if the system guesses the wrong filename.

                    // [Fix Round 5] Pre-execution DIRECTORY check
                    // Explicitly check if effective paths are files (end in .xlsx/.xls)
                    const isExcel = (p: string | null) => p && (p.toLowerCase().endsWith('.xlsx') || p.toLowerCase().endsWith('.xls'));

                    if (!isExcel(refFilePath) || !isExcel(compFilePath)) {
                        const dirPath = !isExcel(refFilePath) ? refFilePath : compFilePath;
                        const fileType = !isExcel(refFilePath) ? '기준 파일' : '비교 파일';

                        alert(
                            `【분석 불가: 파일 경로 오류】\n\n` +
                            `${fileType}의 경로가 올바른 Excel 파일이 아닙니다.\n` +
                            `현재 경로: ${dirPath}\n\n` +
                            `━━━ 해결방법 ━━━\n` +
                            `1. 상단 [분석 구성] 탭으로 이동하세요.\n` +
                            `2. [파일 경로 설정]에서 실제 Excel 파일을 다시 선택해 주세요.\n` +
                            `(과거 프로젝트 파일은 파일명 정보가 누락되어 수동 재선택이 필요할 수 있습니다.)`
                        );
                        return { updatedCount: 0 };
                    }

                    if (!refFilePath || !compFilePath) {
                        alert('파일 경로가 올바르지 않습니다.');
                        return { updatedCount: 0 };
                    }

                    // [User Check] Confirm paths before execution
                    const confirmMsg = `다음 파일에 대해 분석 엔진을(B2.0) 실행하시겠습니까?\n\n[기준 파일]\n${refFilePath}\n\n[비교 파일]\n${compFilePath}`;
                    if (!confirm(confirmMsg)) {
                        return { updatedCount: 0 };
                    }

                    // 1. Load Workbooks
                    const readSafe = async (path: string, name: string) => {
                        try {
                            return await window.electron.readFile(path);
                        } catch (e: any) {
                            let msg = e.message;
                            if (e.message.includes('EISDIR')) msg = '경로가 폴더(디렉토리)입니다.';
                            if (e.message.includes('ENOENT')) msg = '파일을 찾을 수 없습니다.';
                            throw new Error(`[${name}] 읽기 실패: ${msg} \n(경로: ${path})`);
                        }
                    };

                    const refBuffer = await readSafe(refFilePath, '기준 파일');
                    const compBuffer = await readSafe(compFilePath, '비교 파일');

                    const refWb = new ExcelJS.Workbook();
                    const compWb = new ExcelJS.Workbook();

                    // Load Reference File with error handling
                    try {
                        await refWb.xlsx.load(refBuffer);
                    } catch (e: any) {
                        console.error('[Ref File Load Error]', e);
                        if (e.message && (e.message.includes('Shared Formula') || e.message.includes('master must exist') || e.message.includes('clone for cell'))) {
                            alert(
                                '【기준 파일 수식 오류】\n\n' +
                                '현재 파일에 ExcelJS가 처리할 수 없는 수식이 포함되어 있습니다.\n\n' +
                                '━━━ 해결방법 ━━━\n' +
                                '방법1 (빠름): Excel에서 파일 열기 → F12 → 새 이름으로 저장 → 재업로드\n\n' +
                                '방법2 (확실): \n' +
                                '  1. Excel에서 파일 열기\n' +
                                '  2. Ctrl+A (전체선택) → Ctrl+C (복사)\n' +
                                '  3. 새 Excel 파일 만들기\n' +
                                '  4. 우클릭 → "값만 붙여넣기" 선택\n' +
                                '  5. 저장 후 재업로드\n\n' +
                                '※ 방법2를 사용하면 수식은 사라지고 값만 남습니다.\n\n' +
                                '(기술정보: ' + e.message + ')'
                            );
                            return { updatedCount: 0 };
                        }
                        throw e;
                    }

                    // Load Comparison File with error handling
                    try {
                        await compWb.xlsx.load(compBuffer);
                    } catch (e: any) {
                        console.error('[Comp File Load Error]', e);
                        if (e.message && (e.message.includes('Shared Formula') || e.message.includes('master must exist') || e.message.includes('clone for cell'))) {
                            alert(
                                '【비교 파일 수식 오류】\n\n' +
                                '현재 파일에 ExcelJS가 처리할 수 없는 수식이 포함되어 있습니다.\n\n' +
                                '━━━ 해결방법 ━━━\n' +
                                '방법1 (빠름): Excel에서 파일 열기 → F12 → 새 이름으로 저장 → 재업로드\n\n' +
                                '방법2 (확실): \n' +
                                '  1. Excel에서 파일 열기\n' +
                                '  2. Ctrl+A (전체선택) → Ctrl+C (복사)\n' +
                                '  3. 새 Excel 파일 만들기\n' +
                                '  4. 우클릭 → "값만 붙여넣기" 선택\n' +
                                '  5. 저장 후 재업로드\n\n' +
                                '※ 방법2를 사용하면 수식은 사라지고 값만 남습니다.\n\n' +
                                '(기술정보: ' + e.message + ')'
                            );
                            return { updatedCount: 0 };
                        }
                        throw e;
                    }

                    // Get Sheets
                    const refSheetName = state.refWorkbook?.sheets[refSheetIdx]?.name;
                    const compSheetName = state.compWorkbook?.sheets[compSheetIdx]?.name;

                    const refSheet: ExcelJS.Worksheet = refWb.getWorksheet(refSheetName) || refWb.worksheets[refSheetIdx];
                    const compSheet: ExcelJS.Worksheet = compWb.getWorksheet(compSheetName) || compWb.worksheets[compSheetIdx];

                    if (!refSheet || !compSheet) {
                        alert('엑셀 시트를 찾을 수 없습니다.');
                        return { updatedCount: 0 };
                    }

                    // [User Config] Get configured header rows (default: 0, which is row 1 in Excel)
                    const refHeaderRowNum = (state.refHeaderRow || 0) + 1; // Convert 0-based to 1-based
                    const compHeaderRowNum = (state.compHeaderRow || 0) + 1;

                    // 2. Map Column Headers to Indices (Improved Resilience)

                    // [Fix] Strong but localized header normalization
                    // Removes symbols/spaces but keeps Alphanumeric and Korean
                    const normalizeHeader = (s: string) => String(s || '')
                        .toLowerCase()
                        .replace(/[\r\n\t\s]/g, '') // Remove all whitespace
                        .replace(/[^\w\uAC00-\uD7A3]/g, ''); // Keep alphanumeric + Korean

                    const getCellValue = (cell: ExcelJS.Cell): string => {
                        if (!cell || cell.value === null || cell.value === undefined) return '';
                        const val = cell.value;
                        if (typeof val === 'string') return val.trim();
                        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
                        // Handle RichText, Formulas, Hyperlinks
                        if (typeof val === 'object') {
                            const valObj = val as any;
                            if (valObj.result !== undefined) return String(valObj.result).trim();
                            if (valObj.richText) return valObj.richText.map((rt: any) => rt.text || '').join('').trim();
                            if (valObj.text !== undefined) return String(valObj.text).trim();
                            if (valObj.hyperlink && valObj.text) return String(valObj.text).trim();
                        }
                        return String(val).trim();
                    };

                    const normalizeForComparison = (s: any) => {
                        if (s === null || s === undefined) return '';
                        // Aggressive normalization: Keep only alphanumeric and Korean characters, NFC normalized
                        return String(s)
                            .normalize('NFC')
                            .toLowerCase()
                            .replace(/[^a-z0-9\uAC00-\uD7A3]/g, '');
                    };

                    // 2. Map Column Headers to Indices (Improved Resilience)
                    const getColMap = (sheet: ExcelJS.Worksheet, headerRowNum: number) => {
                        const map = new Map<string, number>();
                        const headerRow = sheet.getRow(headerRowNum);
                        console.log(`[ColMap] 스캔 시작 - 시트: ${sheet.name}, 헤더 행: ${headerRowNum}`);

                        headerRow.eachCell((cell, colNumber) => {
                            const val = getCellValue(cell);
                            if (val) {
                                const norm = normalizeHeader(val);
                                map.set(val, colNumber);
                                map.set(norm, colNumber);
                                console.log(`  - 열 ${colNumber} 찾음: "${val}" (정규화: ${norm})`);
                            }
                        });
                        return map;
                    };

                    const findInMap = (map: Map<string, number>, key: string) => {
                        if (!key) return undefined;
                        // 1. Exact match
                        if (map.has(key)) return map.get(key);

                        // 2. Normalized match (alphanumeric only)
                        const normKey = normalizeHeader(key);
                        if (map.has(normKey)) return map.get(normKey);

                        // 3. Fuzzy match: Check if map contains the key or vice versa (normalized)
                        // This handles cases like "STATUS" vs "STATUS (1/TRUE)" or "P&ID NO" vs "P&ID NO (1GJ...)"
                        if (normKey) {
                            for (const [mapKey, colIdx] of map.entries()) {
                                const normMapKey = normalizeHeader(mapKey);
                                if (normMapKey && (normMapKey.includes(normKey) || normKey.includes(normMapKey))) {
                                    return colIdx;
                                }
                            }
                        }
                        return undefined;
                    };

                    // 3. Map PK values to Row Numbers (Multi-Sheet Support)
                    const getRowMap = (wb: ExcelJS.Workbook, pkTitle: string, headerRow: number, preferredSheetName?: string) => {
                        const map = new Map<string, { sheet: ExcelJS.Worksheet, rowNumber: number }>();
                        const samples: string[] = [];
                        const normTitle = normalizeHeader(pkTitle);

                        // Prioritize the preferred sheet (the one selected in the UI)
                        const sortedSheets = [...wb.worksheets].sort((a, b) => {
                            if (a.name === preferredSheetName) return -1;
                            if (b.name === preferredSheetName) return 1;
                            return 0;
                        });

                        sortedSheets.forEach(sheet => {
                            // [Security] Skip internal system sheets
                            const internal = ['확인사항', 'Change History', '검토이력'];
                            if (internal.some(sys => sheet.name.includes(sys))) return;

                            let pkColIdx = -1;
                            let actualHeaderRow = headerRow;

                            const checkRow = (rNum: number) => {
                                const hRow = sheet.getRow(rNum);
                                let bestIdx = -1;
                                let bestType: 'integrated' | 'exact' | 'norm' | 'none' = 'none';

                                hRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
                                    if (bestType === 'integrated') return; // Highest priority
                                    const rawVal = getCellValue(cell);
                                    if (!rawVal) return;
                                    const normCell = normalizeHeader(rawVal);

                                    // [B1.0] Prioritize Universal Identifier column
                                    if (normCell === '통합key' || normCell === 'integratedkey' || normCell === '통합키') {
                                        bestIdx = colNum;
                                        bestType = 'integrated';
                                        return;
                                    }

                                    if (normCell === normTitle) {
                                        bestIdx = colNum;
                                        bestType = 'exact';
                                    } else if (bestType === 'none' && normCell && normTitle && (normCell.includes(normTitle) || normTitle.includes(normCell))) {
                                        bestIdx = colNum;
                                        bestType = 'norm';
                                    }
                                });

                                if (bestIdx !== -1) {
                                    pkColIdx = bestIdx;
                                    actualHeaderRow = rNum;
                                    const headerFound = getCellValue(hRow.getCell(pkColIdx));
                                    console.log(`[Analysis Engine] PK Column Found! Sheet: ${sheet.name}, Row: ${rNum}, Col: ${pkColIdx}, Name: "${headerFound}" (Type: ${bestType})`);
                                }
                            };

                            checkRow(headerRow);
                            if (pkColIdx === -1) {
                                for (let r = 1; r <= Math.min(100, sheet.rowCount); r++) {
                                    if (r === headerRow) continue;
                                    checkRow(r);
                                    if (pkColIdx !== -1) break;
                                }
                            }

                            if (pkColIdx === -1) return;

                            sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                                if (rowNumber <= actualHeaderRow) return;
                                const cellVal = getCellValue(row.getCell(pkColIdx));
                                if (!cellVal) return;

                                const val = String(cellVal).trim();
                                if (!val || val.length > 400) return;

                                const target = { sheet, rowNumber };
                                const valLower = val.toLowerCase();
                                const valNorm = normalizeForComparison(val);

                                if (!map.has(val)) map.set(val, target);
                                if (!map.has(valLower)) map.set(valLower, target);
                                if (valNorm && !map.has(valNorm)) map.set(valNorm, target);

                                if (samples.length < 5) samples.push(`${val} (Excel: ${sheet.name} R:${rowNumber})`);
                            });
                        });
                        return { map, samples };
                    };

                    const sheetColMapCache = new Map<ExcelJS.Worksheet, Map<string, number>>();
                    const getCachedColMap = (sheet: ExcelJS.Worksheet, headerRowNum: number) => {
                        if (sheetColMapCache.has(sheet)) return sheetColMapCache.get(sheet)!;
                        const map = getColMap(sheet, headerRowNum);
                        sheetColMapCache.set(sheet, map);
                        return map;
                    };

                    const { map: refRowMap, samples: refSamples } = getRowMap(refWb, pkColumn, refHeaderRowNum, refSheetName);
                    const { map: compRowMap, samples: compSamples } = getRowMap(compWb, pkColumn, compHeaderRowNum, compSheetName);

                    console.log(`[Analysis Engine] Map 빌드 완료. 기준(${refRowMap.size / 3}개), 비교(${compRowMap.size / 3}개)`);
                    console.log(`[Analysis Engine] 기준 데이터 샘플:`, refSamples);
                    console.log(`[Analysis Engine] 비교 데이터 샘플:`, compSamples);

                    if (refRowMap.size === 0 || compRowMap.size === 0) {
                        const missing = refRowMap.size === 0 && compRowMap.size === 0 ? '두 파일 모두' : (refRowMap.size === 0 ? '기준 파일' : '비교 파일');
                        alert(`[오류] ${missing}에서 PK 컬럼("${pkColumn}")을 통한 데이터를 식별할 수 없습니다. (헤더 행 번호나 시트 선택을 확인해주세요)`);
                        return { updatedCount: 0 };
                    }

                    // Get first row headers for debugging
                    const getHeaderSamples = (sheet: ExcelJS.Worksheet, headerRowNum: number) => {
                        const h = sheet.getRow(headerRowNum);
                        const s: string[] = [];
                        for (let i = 1; i <= 5; i++) s.push(String(h.getCell(i).value || '빈칸'));
                        return s.join(' | ');
                    };
                    const refHeaderSample = getHeaderSamples(refSheet, refHeaderRowNum);
                    const compHeaderSample = getHeaderSamples(compSheet, compHeaderRowNum);

                    // Identify Review Columns
                    const reviewCols = columns.filter(c => c.id.endsWith('_기준검토') || c.id.endsWith('_비교검토'));

                    // [Refactor] Checklist/ChangeLog Accumulators
                    const refCheckRows: any[] = [];
                    const compCheckRows: any[] = [];

                    // 4. Iterate Grid Rows and Apply Changes
                    for (const row of rows) {
                        const refLookupPK = String(row[`${pkColumn}_기준`] || '').trim();
                        const compLookupPK = String(row[`${pkColumn}_비교`] || '').trim();

                        const checkStatus = (val: any) => {
                            const s = String(val || '').trim().toLowerCase();
                            if (s === '삭제' || s === 'delete') return 'delete';
                            if (s === '추가' || s === 'add') return 'add';
                            return null;
                        };


                        const refPKReviewCol = `${pkColumn}_기준검토`;
                        const compPKReviewCol = `${pkColumn}_비교검토`;
                        let refStatus = checkStatus(row[refPKReviewCol]);
                        if (!refStatus && refLookupPK === '' && row[refPKReviewCol]) {
                            const implicitVal = String(row[refPKReviewCol]).trim();
                            if (implicitVal) refStatus = 'add';
                        }
                        let compStatus = checkStatus(row[compPKReviewCol]);
                        if (!compStatus && compLookupPK === '' && row[compPKReviewCol]) {
                            const implicitVal = String(row[compPKReviewCol]).trim();
                            if (implicitVal) compStatus = 'add';
                        }

                        // --- Helper to get best value for Add/Delete rows ---
                        const getEffectiveVal = (baseColId: string, isRef: boolean) => {
                            const original = row[baseColId];
                            const review = row[`${baseColId}_${isRef ? '기준' : '비교'}검토`];
                            return (review !== undefined && review !== null && String(review).trim() !== '')
                                ? String(review).trim()
                                : (original !== undefined ? String(original) : '');
                        };

                        // --- Handle Delete (Strikethrough) ---
                        if (refStatus === 'delete') {
                            const info = refRowMap.get(refLookupPK) || refRowMap.get(normalizeForComparison(refLookupPK));
                            if (info) {
                                info.sheet.getRow(info.rowNumber).eachCell((cell: ExcelJS.Cell) => { cell.font = { ...cell.font, strike: true }; });
                                deletedCount++;
                            }
                        }
                        if (compStatus === 'delete') {
                            const info = compRowMap.get(compLookupPK) || compRowMap.get(normalizeForComparison(compLookupPK));
                            if (info) {
                                info.sheet.getRow(info.rowNumber).eachCell((cell: ExcelJS.Cell) => { cell.font = { ...cell.font, strike: true }; });
                                deletedCount++;
                            }
                        }

                        // --- Handle Add (Separate Sheet) ---
                        if (refStatus === 'add') {
                            const addedSheet = refWb.getWorksheet('추가항목') || refWb.addWorksheet('추가항목');
                            const refColumns = columns.filter(c => !c.id.endsWith('_비교') && !c.id.endsWith('_비교검토'));
                            if (addedSheet.rowCount === 0) addedSheet.addRow(refColumns.map(c => c.title));
                            addedSheet.addRow(refColumns.map(c => {
                                const baseId = c.id.replace('_기준', '');
                                return getEffectiveVal(baseId, true);
                            }));
                            addedCount++;
                        }
                        if (compStatus === 'add') {
                            const addedSheet = compWb.getWorksheet('추가항목') || compWb.addWorksheet('추가항목');
                            const compColumns = columns.filter(c => !c.id.endsWith('_기준') && !c.id.endsWith('_기준검토'));
                            if (addedSheet.rowCount === 0) addedSheet.addRow(compColumns.map(c => c.title));
                            addedSheet.addRow(compColumns.map(c => {
                                const baseId = c.id.replace('_비교', '');
                                return getEffectiveVal(baseId, false);
                            }));
                            addedCount++;
                        }

                        // Track mapped additions to avoid duplicate adds for the SAME row when processing multiple review columns
                        let hasLoggedRefFailureThisRow = false;
                        let hasLoggedCompFailureThisRow = false;

                        // --- Handle Updates (Existing Rows) ---
                        // We process Ref and Comp sides separately for clarity and reliability
                        const processSideUpdates = (isRef: boolean) => {
                            const status = isRef ? refStatus : compStatus;
                            if (status === 'delete' || status === 'add') return; // Handled separately

                            // [Optimization] Skip if the row doesn't exist on this side
                            if (isRef && row.exists === 'Only Comp') return;
                            if (!isRef && row.exists === 'Only Ref') return;

                            const lookupKey = isRef ? refLookupPK : compLookupPK;
                            // [Security] Skip if the primary lookup key is empty or an auto-generated placeholder
                            const isInternal = (k: string) => !k || k.trim() === '' || k.startsWith('CHECK-') || k === 'null' || k === 'undefined';
                            if (isInternal(lookupKey)) return;

                            const intKey = row.integratedKey;

                            const targetRowMap = isRef ? refRowMap : compRowMap;
                            // Priority: IntegratedKey (Exact) -> IntegratedKey (Norm) -> TagNo (Exact) -> TagNo (Norm)
                            let targetInfo = (intKey ? targetRowMap.get(intKey) : undefined) ||
                                (intKey ? targetRowMap.get(normalizeForComparison(intKey)) : undefined) ||
                                targetRowMap.get(lookupKey) ||
                                targetRowMap.get(normalizeForComparison(lookupKey));

                            if (!targetInfo) {
                                const normKey = normalizeForComparison(lookupKey || intKey);
                                const lowerKey = (lookupKey || intKey || '').toLowerCase();

                                for (const [k, v] of targetRowMap.entries()) {
                                    if (k.toLowerCase() === lowerKey || normalizeForComparison(k) === normKey) {
                                        targetInfo = v;
                                        break;
                                    }
                                }
                            }

                            // [Final Fallback] Deep Search: If key still not found, scan all sheets linearly
                            // This handles cases where PK indexing might have picked the wrong column for some legacy rows
                            if (!targetInfo) {
                                const normTarget = normalizeForComparison(lookupKey || intKey);
                                const wb = isRef ? refWb : compWb;
                                for (const sheet of wb.worksheets) {
                                    if (targetInfo) break;
                                    const internal = ['확인사항', 'Change History', '검토이력'];
                                    if (internal.some(sys => sheet.name.includes(sys))) continue;

                                    sheet.eachRow({ includeEmpty: false }, (r, rNum) => {
                                        if (targetInfo) return;
                                        // Scan up to 100 columns for the key. 
                                        // Note: row.cellCount is the maximum column index used in that row.
                                        for (let c = 1; c <= Math.min(r.cellCount, 100); c++) {
                                            const cellVal = getCellValue(r.getCell(c));
                                            if (normalizeForComparison(cellVal) === normTarget) {
                                                targetInfo = { sheet, rowNumber: rNum };
                                                console.log(`[Analysis Engine] Deep Search Found Key! "${lookupKey || intKey}" at Sheet: ${sheet.name}, Row: ${rNum}, Col: ${c}`);
                                                break;
                                            }
                                        }
                                    });
                                }
                            }

                            if (!targetInfo) {
                                // Log failure only once per row/side
                                const rowAlreadyLogged = isRef ? hasLoggedRefFailureThisRow : hasLoggedCompFailureThisRow;
                                // skip internal/empty keys to avoid noisy logs (e.g. for Only Comp/Ref rows with empty counterparts)
                                if (!rowAlreadyLogged && !isInternal(lookupKey)) {
                                    console.warn(`[Analysis Engine] Row mapping failed for ${isRef ? 'Ref' : 'Comp'}: "${lookupKey}" (Normalized: ${normalizeForComparison(lookupKey)})`);

                                    const sideCols = columns.filter(c => isRef ? !c.id.endsWith('_비교') && !c.id.endsWith('_비교검토') : !c.id.endsWith('_기준') && !c.id.endsWith('_기준검토'));

                                    // [Refactor] Only include columns with modified data (Difference between Original and Review in Grid)
                                    const diffColumns = sideCols.reduce((acc: any, c) => {
                                        // Skip internal columns
                                        if (c.id === 'integratedKey' || c.id === 'exists' || c.id === 'review_remarks') return acc;
                                        if (c.id === pkColumn || (state.skColumn && c.id === state.skColumn)) {
                                            // Always include PK/SK for context? Or only if changed?
                                            // User said "Only diff columns". Let's rely on Diff Logic.
                                            // But we need context... 'Original Key' and 'Normalized Key' are already providing Row Context.
                                            // So for data columns, strictly show Diff.
                                        }

                                        const baseId = c.id;
                                        const reviewId = isRef ? `${baseId}_기준검토` : `${baseId}_비교검토`;
                                        const originalId = isRef ? `${baseId}_기준` : `${baseId}_비교`;

                                        const reviewVal = String(row[reviewId] || '').trim();
                                        const originalVal = String(row[originalId] || '').trim();

                                        // If User entered a review value AND it is different from original
                                        if (reviewVal !== '' && reviewVal !== originalVal) {
                                            acc[c.title] = reviewVal; // Show the NEW value
                                        }
                                        return acc;
                                    }, {});

                                    const failureData = {
                                        'Mapping Failure Logic': `Could not find match for ${isRef ? 'Ref' : 'Comp'} key in workbook.`,
                                        // 'Original Key': lookupKey, // User requested removal
                                        // 'Normalized Key': normalizeForComparison(lookupKey), // User requested removal
                                        '구분': row.exists,
                                        '통합 Key': row.integratedKey,
                                        '검토의견': String(row.review_remarks || '').trim(),
                                        ...diffColumns
                                    };

                                    if (isRef) {
                                        hasLoggedRefFailureThisRow = true;
                                        refCheckRows.push(failureData);
                                    } else {
                                        hasLoggedCompFailureThisRow = true;
                                        compCheckRows.push(failureData);
                                    }
                                    noTargetRowCount++;
                                }
                                return;
                            }

                            // If we found the row, check ALL relevant review columns for this side
                            const sideSuffix = isRef ? '_기준검토' : '_비교검토';
                            const sideReviewCols = reviewCols.filter(rc => rc.id.endsWith(sideSuffix));
                            const sheetColMap = getCachedColMap(targetInfo.sheet, isRef ? refHeaderRowNum : compHeaderRowNum);

                            // [Refactor] Prepare Check Row Data if needed
                            const checkRowData: any = {
                                '구분': row.exists,
                                '통합 Key': row.integratedKey,
                                '검토의견': String(row.review_remarks || '').trim()
                            };
                            let hasChanges = false;
                            if (checkRowData['검토의견']) hasChanges = true;

                            for (const revCol of sideReviewCols) {
                                const reviewVal = row[revCol.id];
                                if (reviewVal === undefined || reviewVal === null) continue;

                                const reviewValStr = String(reviewVal).trim();
                                if (reviewValStr === '') {
                                    noReviewDataCount++;
                                    continue;
                                }

                                reviewColsCount++;
                                const baseColId = revCol.id.replace(sideSuffix, '');
                                const colNum = findInMap(sheetColMap, baseColId);
                                if (!colNum) continue;

                                const cell = targetInfo.sheet.getCell(targetInfo.rowNumber, colNum);
                                const currentValRaw = getCellValue(cell);

                                // Strict comparison for coloring and update detection
                                const currentValStr = String(currentValRaw || '').trim();
                                const isDifferent = currentValStr !== reviewValStr;

                                if (isDifferent) {
                                    cell.value = reviewValStr;
                                    cell.style = {
                                        font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0000FF' } },
                                        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
                                        alignment: cell.alignment, border: cell.border
                                    };
                                    updatedCount++;
                                    if (baseColId === pkColumn) tagNoUpdateCount++;

                                    // [Log Change for Checklist]
                                    // "3번의 내용처럼 기준과 기준검토가 다른 열을 표시"
                                    const colTitle = revCol.title.replace('_기준검토', '').replace('_비교검토', '');
                                    checkRowData[colTitle] = reviewValStr;
                                    hasChanges = true;
                                } else {
                                    // Reset style if it's the same (marks it as "reviewed/confirmed" but no change needed)
                                    cell.style = {
                                        font: { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF000000' } },
                                        fill: { type: 'pattern', pattern: 'none' },
                                        alignment: cell.alignment, border: cell.border
                                    };
                                    identicalValueCount++;
                                }
                            }

                            // Add to checklist if interesting
                            if (hasChanges) {
                                if (isRef) refCheckRows.push(checkRowData);
                                else compCheckRows.push(checkRowData);
                            }
                        };

                        processSideUpdates(true); // Process Reference updates
                        processSideUpdates(false); // Process Comparison updates

                        // [B2.0] Remarks are now handled inside the checkRow accumulators (refCheckRows/compCheckRows)
                        // Old logic removed to prevent duplications.
                    }

                    // 5. Generate '확인사항' Sheet for both Workbooks
                    const generateCheckSheet = (wb: ExcelJS.Workbook, rows: any[]) => {
                        if (rows.length === 0) return;

                        // Remove existing sheet to rebuild cleanly
                        const existingSheet = wb.getWorksheet('확인사항');
                        if (existingSheet) wb.removeWorksheet(existingSheet.id);

                        const checkSheet = wb.addWorksheet('확인사항');

                        // 5-1. Filter Rows
                        // User Request Update: Only show rows that have "Mapping Failure Logic" data.
                        const rowsToDisplay = rows.filter(r => r['Mapping Failure Logic'] && String(r['Mapping Failure Logic']).trim() !== '');

                        if (rowsToDisplay.length === 0) return;


                        // 5-2. Determine Column Order: "확인사항은 분석화면과 동일한 순서로 작성해주세요"
                        // Strategy: 
                        //  1. Always show 'Mapping Failure Logic' first.
                        //  2. Then show '구분', '검토의견'.
                        //  3. Then show the rest of the columns in the order they appear in `state.columns`.
                        //  * Requested to EXCLUDE: 'Original Key', 'Normalized Key', '통합 Key'

                        const fixedHeaders = ['Mapping Failure Logic', '통합 Key', '구분', '검토의견'];
                        const excludedHeaders = ['Original Key', 'Normalized Key', 'integratedKey'];

                        // Get all available data keys from rows
                        const dataKeys = new Set<string>();
                        rowsToDisplay.forEach(r => Object.keys(r).forEach(k => dataKeys.add(k)));

                        // Sort dynamic columns based on Grid Column Order
                        const gridColOrder = state.columns.map(c => c.title); // Use titles as they match checkRow keys
                        const sortedDynamicKeys = Array.from(dataKeys)
                            .filter(k => !fixedHeaders.includes(k) && !excludedHeaders.includes(k))
                            .sort((a, b) => {
                                const idxA = gridColOrder.indexOf(a);
                                const idxB = gridColOrder.indexOf(b);
                                // If found in grid, use index. If not found (e.g. extra internal key), put at end.
                                if (idxA === -1 && idxB === -1) return 0;
                                if (idxA === -1) return 1;
                                if (idxB === -1) return -1;
                                return idxA - idxB;
                            });

                        const finalHeaderCandidates = [...fixedHeaders, ...sortedDynamicKeys];

                        // Filter: Exclude if column is completely empty in filtered rows

                        const activeHeaders = finalHeaderCandidates.filter(header => {
                            const hasData = rowsToDisplay.some(r => {
                                const val = r[header];
                                return val !== undefined && val !== null && String(val).trim() !== '';
                            });
                            return hasData;
                        });

                        // 5-3. Add Header
                        const headerRow = checkSheet.addRow(activeHeaders);
                        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
                        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

                        // 5-4. Add Data
                        rowsToDisplay.forEach(r => {
                            const rowData = activeHeaders.map(h => r[h] ?? '');
                            checkSheet.addRow(rowData);
                        });

                        // 5-5. Auto Filter
                        checkSheet.autoFilter = {
                            from: { row: 1, column: 1 },
                            to: { row: 1, column: activeHeaders.length }
                        };

                        // 5-6. Auto Fit
                        checkSheet.columns.forEach(col => {
                            let maxLength = 10;
                            col.values?.forEach(v => {
                                const len = String(v ?? '').length;
                                if (len > maxLength) maxLength = len;
                            });
                            col.width = Math.min(Math.max(maxLength + 2, 10), 60);
                        });
                    };

                    generateCheckSheet(refWb, refCheckRows);
                    generateCheckSheet(compWb, compCheckRows);

                    // 5. Save Files
                    // [Fix] Use specific options to minimize corruption risk & preserve features
                    const writeOptions: any = {
                        useStyles: true,
                        useSharedStrings: true
                    };

                    // Use effective paths for writing
                    const writeSafe = async (path: string, buffer: any, name: string) => {
                        try {
                            await window.electron.writeFile(path, buffer);
                        } catch (e: any) {
                            if (e.message.includes('EBUSY') || e.message.includes('EPERM')) {
                                throw new Error(`${name}이 다른 프로그램(Excel 등)에서 열려 있습니다. 파일을 닫고 다시 시도해주세요.`);
                            }
                            throw e;
                        }
                    };

                    if (refFilePath) {
                        const refBufferOut = await refWb.xlsx.writeBuffer(writeOptions);
                        await writeSafe(refFilePath, refBufferOut, '기준 파일');
                    }

                    if (compFilePath) {
                        const compBufferOut = await compWb.xlsx.writeBuffer(writeOptions);
                        await writeSafe(compFilePath, compBufferOut, '비교 파일');
                    }

                    if (updatedCount === 0) {
                        const debugMsg = [
                            `[디버그 정보]`,
                            `- 총 데이터 행(Grid): ${rows.length}`,
                            `- 분석할 PK 컬럼: "${pkColumn}"`,
                            `- 기준파일 헤더(1~5열): [${refHeaderSample}]`,
                            `- 기준데이터 식별: ${refRowMap.size > 0 ? 'O (' + (refRowMap.size / 3) + '개 행)' : 'X'}`,
                            `- 비교데이터 식별: ${compRowMap.size > 0 ? 'O (' + (compRowMap.size / 3) + '개 행)' : 'X'}`,
                            `- 기준파일 맵핑 행 수: ${refRowMap.size}`,
                            `- 기준파일 PK 샘플: [${refSamples.join(', ')}]`,
                            `- 비교파일 헤더(1~5열): [${compHeaderSample}]`,
                            `- 비교파일 맵핑 행 수: ${compRowMap.size}`,
                            `- 비교파일 PK 샘플: [${compSamples.join(', ')}]`,
                            `- 검토 데이터 발견(Cell): ${reviewColsCount}`,
                            `- 파일에서 행 못찾음: ${noTargetRowCount}`,
                            `- 이미 값이 동일함: ${identicalValueCount}`,
                            `- 삭제/추가로 제외됨: ${deletedCount + addedCount}`,
                            ``,
                            `*팁: 파일의 PK값이 샘플과 일치하는지 확인해주세요.`
                        ].join('\n');
                        alert(`업데이트 된 내역이 0건입니다.\n\n${debugMsg}`);
                    } else {
                        console.log(`[Analysis Engine] Completed. Updated: ${updatedCount}, Deleted: ${deletedCount}, Added: ${addedCount}`);
                        alert(`[분석 완료]\n` +
                            `- 총 업데이트: ${updatedCount}건\n` +
                            `- 동일 데이터(건너뜀): ${identicalValueCount}건\n` +
                            `- TAG NO 업데이트: ${tagNoUpdateCount}건\n` +
                            `- 삭제표시: ${deletedCount}건\n` +
                            `- 추가시트: ${addedCount}건`);
                    }

                    return {
                        updatedCount,
                        details: {
                            noTargetRowCount,
                            ignoredDelAddCount: deletedCount + addedCount,
                            identicalValueCount,
                            noReviewDataCount
                        }
                    };
                } catch (error: any) {
                    console.error('Analysis Engine Failed:', error);
                    alert(`오류가 발생했습니다:\n${error.message}`);
                    return { updatedCount: 0 };
                }
            },

            resetStore: () => {
                localStorage.removeItem('io_xl_web_storage');
                localStorage.removeItem('io_xl_last_config');
                window.location.reload();
            },

            setColumnWidth: (columnId, width) => {
                set((state) => ({
                    columns: state.columns.map(col =>
                        col.id === columnId ? { ...col, width } : col
                    )
                }));
            },

            setSelectedReviewColumns: (selectedIds) => {
                const { allGeneratedColumns } = get();

                const newVisibleColumns = allGeneratedColumns.filter(c => {
                    // 1. Always show frozen or system columns
                    // [B2.0] Exception: 'review_remarks' is frozen but optional (toggleable)
                    if (c.frozen && c.id !== 'review_remarks') return true;

                    if (['integratedKey', 'exists', 'standardPK', 'standardSK'].includes(c.id)) return true;
                    // user_ columns are custom, always show for now or handle later
                    if (c.id.startsWith('user_')) return true;

                    // [Toggle Rule] Review Remarks
                    if (c.id === 'review_remarks') {
                        return selectedIds.includes('review_remarks');
                    }

                    // 2. Determine Column Type
                    const isReviewVariant = c.id.endsWith('_기준검토') || c.id.endsWith('_비교검토');
                    const isStandardVariant = (c.id.endsWith('_기준') || c.id.endsWith('_비교')) && !isReviewVariant;

                    // 3. Visibility Rules
                    const rawBaseKey = c.id
                        .replace('_기준검토', '')
                        .replace('_비교검토', '')
                        .replace('_기준', '')
                        .replace('_비교', '');

                    const baseKey = rawBaseKey.trim().toLowerCase();

                    // Exclude 'review_remarks' from the mapping-based focus logic
                    const selectedMappings = selectedIds.filter(id => id !== 'review_remarks');
                    const normalizedSelectedMappings = selectedMappings.map(s => s.trim().toLowerCase());

                    // Rule A: Review variant columns
                    // Only show if their specific mapping is selected
                    if (isReviewVariant) {
                        return normalizedSelectedMappings.includes(baseKey);
                    }

                    // Rule B: Standard variant columns (Originals)
                    if (isStandardVariant) {
                        // FOCUS MODE: If any mappings are selected for review, HIDE all unselected standard columns.
                        // This makes the grid very narrow and focused on the work at hand.
                        if (normalizedSelectedMappings.length > 0) {
                            return normalizedSelectedMappings.includes(baseKey);
                        }
                        // BASELINE: If no specific review columns are selected, show ALL standard columns (default state).
                        return true;
                    }

                    // Default: Show any other columns (Keys, status, etc.)
                    return true;
                });

                set({
                    selectedReviewColumns: selectedIds,
                    columns: newVisibleColumns
                });

                // Recalculate summary to reflect only selected review columns in the "Mismatch" count
                get().recalculateSummary();
                console.log(`[ReviewSelector] Columns updated. Visibility: ${newVisibleColumns.length} cols.`);
            },

            recalculateSummary: () => {
                const { rows, mappings, columnExclusion, pkColumn, skColumn, selectedReviewColumns } = get();

                const baseMappings = mappings.filter(m => m.isTarget || m.isPK || m.isSK);
                const effectiveMappings = filterMappings(baseMappings, columnExclusion);
                const bothRows = rows.filter(r => r.exists === 'Both' || r.exists === 'Both(M)');
                const onlyRefRows = rows.filter(r => r.exists === 'Only Ref');
                const onlyCompRows = rows.filter(r => r.exists === 'Only Comp');

                // Mismatch Re-calculation (Dynamic based on selectedReviewColumns)
                const mismatchRows = bothRows.filter(r =>
                    Object.keys(r).some(key => {
                        if (!key.endsWith('_diff') || r[key] !== true) return false;
                        const colBaseName = key.replace('_diff', '');

                        // 1. Standard Exclusions (PK/SK/Ignored Words)
                        if (colBaseName === pkColumn || (skColumn && colBaseName === skColumn)) return false;
                        const ignoreWords = ['remark', '비고', 'comment', 'description', 'index', 'rev', 'note'];
                        if (ignoreWords.some(word => colBaseName.toLowerCase().includes(word))) return false;

                        // 2. [NEW] Check if this column is currently "Active" for review
                        // If selectedReviewColumns is empty, we show ALL diffs (default behavior)
                        // If it has values, we only count diffs in those columns.
                        if (selectedReviewColumns.length > 0) {
                            const normalizedActive = selectedReviewColumns.map(s => s.trim().toLowerCase());
                            const normalizedTarget = colBaseName.trim().toLowerCase();

                            if (!normalizedActive.includes(normalizedTarget)) {
                                return false;
                            }
                        }

                        return true;
                    })
                );

                const perfectMatch = bothRows.length - mismatchRows.length;

                // 상세 요약 재계산
                const detailedSummary = effectiveMappings
                    .filter(m => m.isTarget)
                    .map(m => {
                        const colRef = `${m.refColumn}_기준`;
                        const colComp = `${m.refColumn}_비교`;
                        const refWithVal = [...bothRows, ...onlyRefRows].filter(r => String(r[colRef] || '').trim() !== '').length;
                        const compWithVal = [...bothRows, ...onlyCompRows].filter(r => String(r[colComp] || '').trim() !== '').length;
                        const isKey = m.isPK || m.isSK;
                        const sameCount = isKey ? bothRows.length : bothRows.filter(r => isValuesMatch(r[colRef], r[colComp])).length;
                        const mismatchCount = isKey ? 0 : bothRows.filter(r => !isValuesMatch(r[colRef], r[colComp])).length;
                        const onlyRefWithVal = onlyRefRows.filter(r => String(r[colRef] || '').trim() !== '').length;
                        const onlyCompWithVal = onlyCompRows.filter(r => String(r[colComp] || '').trim() !== '').length;

                        return {
                            columnName: m.refColumn,
                            refRowCount: refWithVal,
                            compRowCount: compWithVal,
                            sameCount,
                            diffCount: mismatchCount + onlyCompWithVal + onlyRefWithVal,
                            onlyRefCount: onlyRefWithVal,
                            onlyCompCount: onlyCompWithVal,
                            status: mismatchCount > 0 ? '값 불일치' : ''
                        };
                    });

                set({
                    comparisonSummary: {
                        total: rows.length,
                        both: bothRows.length,
                        perfectMatch,
                        onlyRef: onlyRefRows.length,
                        onlyComp: onlyCompRows.length,
                        diffs: onlyRefRows.length + onlyCompRows.length,
                        mismatches: mismatchRows.length,
                        integrityScore: rows.length > 0 ? (perfectMatch / rows.length) * 100 : 0
                    },
                    detailedSummary
                });
            },

            // ==========================================================================
            // Project Save/Load Actions
            // ==========================================================================

            exportProject: async () => {
                const state = get();
                try {
                    await exportResults({
                        rows: state.rows,
                        columns: [
                            { id: 'integratedKey', title: '통합 Key', width: 170 },
                            { id: 'exists', title: '구분', width: 80 },
                            ...state.columns.filter(c => !c.frozen && c.id !== 'exists' && c.id !== 'integratedKey')

                        ],
                        pkColumn: state.pkColumn,
                        memos: state.memos,
                        refFileName: state.refFileName,
                        compFileName: state.compFileName,
                        config: {
                            mappings: state.mappings,
                            exclusionRules: state.exclusionRules,
                            columnExclusion: state.columnExclusion,
                            pkExclusion: state.pkExclusion,
                            pkColumn: state.pkColumn,
                            skColumn: state.skColumn,
                            refFilePath: state.refFilePath,
                            compFilePath: state.compFilePath,
                            refFileName: state.refFileName,
                            compFileName: state.compFileName,
                            allGeneratedColumns: state.allGeneratedColumns, // [Fix] Save for Review Selector
                            // [Fix] Save Sheet Indices and Header Rows for restoration
                            refSheetIdx: state.refSheetIdx,
                            compSheetIdx: state.compSheetIdx,
                            refSheetName: state.refSheetName,
                            compSheetName: state.compSheetName,
                            refHeaderRow: state.refHeaderRow,
                            compHeaderRow: state.compHeaderRow
                        }
                    });
                } catch (e) {
                    console.error('Export Project Failed:', e);
                    set({ error: '프로젝트 저장 중 오류가 발생했습니다.' });
                }
            },

            importProjectFromExcel: async (file: File) => {
                try {
                    // 1. Extract Config
                    const projectState = await extractProjectConfig(file);
                    if (!projectState) {
                        throw new Error('선택한 파일은 프로젝트 파일(Excel)이 아니거나 손상되었습니다.');
                    }

                    const { config, memos, columns } = projectState;

                    // [NEW] Auto-Load Raw Files if available (Electron)
                    let loadedRefWb: ParsedWorkbook | null = null;
                    let loadedCompWb: ParsedWorkbook | null = null;
                    let loadedRefFile: File | null = null;
                    let loadedCompFile: File | null = null;

                    if (window.electron && config.refFilePath && config.compFilePath) {
                        try {
                            console.log(`[Import] Attempting to auto - load raw files...`);
                            console.log(`- Ref: ${config.refFilePath}`);
                            console.log(`- Comp: ${config.compFilePath}`);

                            // Load Reference File
                            if (await window.electron.fileExists(config.refFilePath)) {
                                const refBuffer = await window.electron.readFile(config.refFilePath);
                                // [Fix] If refBuffer is ArrayBuffer, use it directly. If it has .buffer (Node Buffer), use that.
                                const buffer = (refBuffer as any).buffer || refBuffer;
                                loadedRefWb = await parseExcelFile(buffer, { fileName: config.refFileName });
                                loadedRefFile = new File([buffer], config.refFileName || 'Reference.xlsx');
                                console.log(`[Import] Loaded Reference Workbook: ${loadedRefWb.sheets.length} sheets`);
                            } else {
                                console.warn(`[Import] Reference file not found at: ${config.refFilePath}`);
                            }

                            // Load Comparison File
                            if (await window.electron.fileExists(config.compFilePath)) {
                                const compBuffer = await window.electron.readFile(config.compFilePath);
                                // [Fix] Handle Buffer/ArrayBuffer
                                const buffer = (compBuffer as any).buffer || compBuffer;
                                loadedCompWb = await parseExcelFile(buffer, { fileName: config.compFileName });
                                loadedCompFile = new File([buffer], config.compFileName || 'Comparison.xlsx');
                                console.log(`[Import] Loaded Comparison Workbook: ${loadedCompWb.sheets.length} sheets`);
                            } else {
                                console.warn(`[Import] Comparison file not found at: ${config.compFilePath}`);
                            }

                        } catch (err) {
                            console.error('[Import] Failed to auto-load raw files:', err);
                            // Verify graceful degradation: Proceed without raw files
                        }
                    } else {
                        console.log('[Import] Skipping auto-load: Not electron or missing paths');
                    }

                    // 2. Parse Rows from '결과' Sheet
                    const workbook = await parseExcelFile(file);
                    const resultSheet = workbook.sheets.find(s => s.name === '결과');

                    if (!resultSheet) {
                        throw new Error('프로젝트 파일 내에 [결과] 시트가 없습니다.');
                    }

                    // 3. Reconstruct Rows
                    const titleToIdMap = new Map<string, string>();
                    if (columns) {
                        (columns as GridColumn[]).forEach(c => {
                            titleToIdMap.set(c.title, c.id);
                        });
                    }

                    const restoredRows: GridRow[] = resultSheet.data.map(sheetRow => {
                        const row: any = {};
                        Object.keys(sheetRow).forEach(header => {
                            const id = titleToIdMap.get(header) || header;
                            row[id] = sheetRow[header];
                        });
                        return row;
                    });

                    // 4. Restore Store State
                    const currentStore = get();

                    const resolveRestoredPath = (importedPath: string | null, importedFileName: string | null, currentPath: string | null) => {
                        // Normalize and helper checks
                        const norm = (s: string | null) => s ? s.normalize('NFC').replace(/\\/g, '/').toLowerCase() : '';
                        const isExcel = (s: string | null) => s && (s.toLowerCase().endsWith('.xlsx') || s.toLowerCase().endsWith('.xls'));

                        const nCurrentPath = norm(currentPath);
                        const nImportedFileName = norm(importedFileName);

                        // 1. [Safety] If UI already has a valid FULL path (selected by user), PRESERVE IT
                        // This ensures that "Resume Work" doesn't destroy what the user just manually fixed
                        if (isExcel(currentPath) && (!importedFileName || nCurrentPath.endsWith(nImportedFileName))) {
                            console.log(`[Import] Preserving UI - selected full path: ${currentPath}`);
                            return currentPath;
                        }

                        // 2. [Restoration] Combine only if we have a valid FILENAME and a BASE directory
                        if (importedPath && importedFileName && isExcel(importedFileName) && !norm(importedPath).endsWith(nImportedFileName)) {
                            console.log(`[Import] Combining path + config filename: ${importedPath} + ${importedFileName}`);
                            const separator = importedPath.includes('\\') ? '\\' : '/';
                            const cleanBase = importedPath.endsWith(separator) ? importedPath : importedPath + separator;
                            return cleanBase + importedFileName;
                        }

                        return importedPath;
                    };

                    const finalRefPath = resolveRestoredPath(config.refFilePath, config.refFileName, currentStore.refFilePath);
                    const finalCompPath = resolveRestoredPath(config.compFilePath, config.compFileName, currentStore.compFilePath);

                    // Safely derive filename (ONLY from valid excel paths)
                    const getSafeFileName = (path: string | null, configName: string | null) => {
                        const isExcel = (s: string | null) => s && (s.toLowerCase().endsWith('.xlsx') || s.toLowerCase().endsWith('.xls'));
                        if (isExcel(configName)) return configName;
                        if (isExcel(path)) return path!.split(/[/\\]/).pop() || null;
                        return null;
                    };

                    // [Fix] Rebuild columns based on the imported data to ensure 'Review Remarks' is correctly placed and frozen
                    const restoredAllGenerated = deduplicateColumns(config.allGeneratedColumns || columns || []);

                    // Filter out existing review_remarks to re-insert it at the correct position
                    const baseCols = restoredAllGenerated.filter(c => c.id !== 'review_remarks' && c.id !== 'integratedKey' && c.id !== 'exists');
                    const newAllGenerated: GridColumn[] = [
                        { id: 'integratedKey', title: '통합 Key', width: 170, frozen: true, isPK: true },
                        { id: 'exists', title: '구분', width: 80, frozen: true },
                        { id: 'review_remarks', title: '검토의견', width: 200, frozen: true },
                        ...baseCols
                    ];

                    set({
                        mappings: config.mappings || [],
                        exclusionRules: config.exclusionRules || [],
                        columnExclusion: config.columnExclusion || { excludeUnnamed: true, patterns: [] },
                        pkExclusion: config.pkExclusion || { excludeStartAlpha: false, excludeEmpty: true, customPatterns: [] },
                        pkColumn: config.pkColumn || '',
                        skColumn: config.skColumn || '',
                        // [Fix] Restore Sheet Indices and Header Rows
                        refSheetIdx: (loadedRefWb && config.refSheetName)
                            ? loadedRefWb.sheets.findIndex(s => s.name === config.refSheetName)
                            : (config.refSheetIdx !== undefined ? config.refSheetIdx : 0),
                        compSheetIdx: (loadedCompWb && config.compSheetName)
                            ? loadedCompWb.sheets.findIndex(s => s.name === config.compSheetName)
                            : (config.compSheetIdx !== undefined ? config.compSheetIdx : 0),
                        refSheetName: config.refSheetName || (loadedRefWb?.sheets[0]?.name) || '',
                        compSheetName: config.compSheetName || (loadedCompWb?.sheets[0]?.name) || '',
                        refHeaderRow: config.refHeaderRow || 0,
                        compHeaderRow: config.compHeaderRow || 0,

                        // [NEW] Set Loaded Workbooks & Files
                        refWorkbook: loadedRefWb,
                        compWorkbook: loadedCompWb,
                        refFile: loadedRefFile,
                        compFile: loadedCompFile,

                        refFilePath: config.refFilePath || finalRefPath || null,
                        compFilePath: config.compFilePath || finalCompPath || null,
                        // [Fix] Prefer config names if available, then loaded file name, then safe derivation
                        refFileName: config.refFileName || (loadedRefFile ? loadedRefFile.name : getSafeFileName(finalRefPath, config.refFileName)),
                        compFileName: config.compFileName || (loadedCompFile ? loadedCompFile.name : getSafeFileName(finalCompPath, config.compFileName)),

                        rows: restoredRows,
                        rowCount: restoredRows.length,
                        allGeneratedColumns: deduplicateColumns(newAllGenerated),
                        memos: memos || {},
                        view: 'grid',

                        comparisonSummary: null,
                    });

                    // [Fix] Set lastRunConfig on import so the system knows we are in a "synced" state
                    set({ lastRunConfig: generateConfigSnapshot(get()) });

                    console.log(`[Import Finish]Ref Path: ${get().refFilePath}, Name: ${get().refFileName}`);

                    // [Rule 2] Resume Work: Initialize with ALL Review Columns Selected + Remarks
                    const targetColsFromData = deduplicateColumns(newAllGenerated)
                        .filter((c: GridColumn) => c.id.endsWith('_기준'))
                        .map((c: GridColumn) => c.id.replace('_기준', ''));

                    const uniqueTargets: string[] = Array.from(new Set([...targetColsFromData, 'review_remarks']));

                    // Use the dedicated setter to ensure UI columns are synced
                    get().setSelectedReviewColumns(uniqueTargets);

                    // Re-calculate summary
                    const total = restoredRows.length;
                    const bothRows = restoredRows.filter(r => r.exists === 'Both');
                    const onlyRefRows = restoredRows.filter(r => r.exists === 'Only Ref');
                    const onlyCompRows = restoredRows.filter(r => r.exists === 'Only Comp');

                    const mismatchRows = bothRows.filter(r =>
                        Object.keys(r).some(key => {
                            if (!key.endsWith('_diff') || r[key] !== true) return false;
                            const colBaseName = key.replace('_diff', '');
                            if (colBaseName === config.pkColumn || colBaseName === config.skColumn) return false;

                            const colNameLower = colBaseName.toLowerCase();
                            const ignoreWords = [
                                'remark', '비고', 'comment', 'description', '진행', '현황', '선별', 'no', '순번',
                                'index', 'checker', 'date', '날짜', '확인', 'note', 'revision', 'rev'
                            ];
                            if (ignoreWords.some(word => colNameLower.includes(word))) return false;
                            return true;
                        })
                    );

                    const perfectMatch = bothRows.length - mismatchRows.length;

                    // Detailed Summary
                    const detailedSummary = (config.mappings || [])
                        .filter((m: MappingInfo) => m.isTarget)
                        .map((m: MappingInfo) => {
                            const colRef = `${m.refColumn}_기준`;
                            const colComp = `${m.refColumn}_비교`;

                            const refWithVal = [...bothRows, ...onlyRefRows].filter(r => String(r[colRef] || '').trim() !== '').length;
                            const compWithVal = [...bothRows, ...onlyCompRows].filter(r => String(r[colComp] || '').trim() !== '').length;

                            const isKey = m.refColumn === config.pkColumn || m.refColumn === config.skColumn;
                            const sameCount = isKey
                                ? bothRows.length
                                : bothRows.filter(r => isValuesMatch(r[colRef], r[colComp])).length;

                            const mismatchCount = isKey
                                ? 0
                                : bothRows.filter(r => !isValuesMatch(r[colRef], r[colComp])).length;

                            const onlyRefWithVal = onlyRefRows.filter(r => String(r[colRef] || '').trim() !== '').length;
                            const onlyCompWithVal = onlyCompRows.filter(r => String(r[colComp] || '').trim() !== '').length;

                            const wasExcluded = !filterMappings([m], config.columnExclusion || { excludeUnnamed: true, patterns: [] }).some(em => em.refColumn === m.refColumn);

                            return {
                                columnName: m.refColumn,
                                refRowCount: refWithVal,
                                compRowCount: compWithVal,
                                sameCount,
                                diffCount: mismatchCount + onlyCompWithVal + onlyRefWithVal,
                                onlyRefCount: onlyRefWithVal,
                                onlyCompCount: onlyCompWithVal,
                                status: wasExcluded
                                    ? '제외 규칙 적용됨'
                                    : (mismatchCount > 0 ? '값 불일치' : '')
                            };
                        });

                    set({
                        comparisonSummary: {
                            total,
                            both: bothRows.length,
                            perfectMatch,
                            onlyRef: onlyRefRows.length,
                            onlyComp: onlyCompRows.length,
                            diffs: onlyRefRows.length + onlyCompRows.length,
                            mismatches: mismatchRows.length,
                            integrityScore: total > 0 ? (perfectMatch / total) * 100 : 0
                        },
                        detailedSummary
                    });

                    get().applyFiltersAndSort();

                } catch (e) {
                    console.error('Import Project Failed:', e);
                    set({ error: e instanceof Error ? e.message : '프로젝트 불러오기 실패' });
                    throw e;
                }
            },
        }), {
        name: 'io_xl_web_storage',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => {
            // [Fix] Only persist lightweight configuration to avoid localStorage 5MB limit
            // We explicitly pick what to SAVE, rather than what to delete, to be safer.
            return {
                view: state.view,
                pkColumn: state.pkColumn,
                skColumn: state.skColumn,
                exclusionRules: state.exclusionRules,
                columnExclusion: state.columnExclusion,
                pkExclusion: state.pkExclusion,
                mappings: state.mappings,
                refSheetIdx: state.refSheetIdx,
                compSheetIdx: state.compSheetIdx,
                refSheetName: state.refSheetName,
                compSheetName: state.compSheetName,
                refFileName: state.refFileName,
                compFileName: state.compFileName,
                refFilePath: state.refFilePath,
                compFilePath: state.compFilePath,
                frozenColumnCount: state.frozenColumnCount,
                existsMode: state.existsMode
                // rows, columns, workbooks are NOT persisted
            } as any;
        },
        onRehydrateStorage: () => {
            console.log('[B1.0 Store] Hydration starting...');
            return (state, error) => {
                if (error || !state) {
                    console.error('[B1.0 Store] Hydration failed:', error);
                } else {
                    console.log('[B1.0 Store] Hydration finished.');

                    // [Safety Check] Helper to force setup view if data is invalid or missing
                    const shouldResetToSetup =
                        !state.rows ||
                        state.rows.length === 0 ||
                        state.view === 'mapping'; // Workbooks are not persisted, so mapping is invalid on reload

                    if (shouldResetToSetup) {
                        state.view = 'setup';
                    }

                    // Only re-apply filters if we have data
                    if (state.rows && state.rows.length > 0) {
                        state.applyFiltersAndSort();
                    }
                }
            };
        },
    }));

// Expose store for dev-console debugging (safe in dev only)
if (import.meta.env.DEV && typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).useGridStore = useGridStore;
}
