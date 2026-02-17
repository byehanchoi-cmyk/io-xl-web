import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';

import DataEditor, {
    GridCellKind,
} from '@glideapps/glide-data-grid';
import type {
    GridColumn,
    Item,
    GridCell,
    EditableGridCell,
    Theme,
    HeaderClickedEventArgs,
    GridSelection,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useGridStore, type GridColumn as StoreGridColumn } from '../store/gridStore';
import { isValuesMatch } from '../utils/comparisonEngine';
import { ConfirmModal } from './ConfirmModal';
import { ColumnFilterPopup } from './ColumnFilterPopup';

interface AntigravityGridProps {
    width?: number;
    height?: number;
}

type HistoryChange = {
    key: string;
    colId: string;
    from: string | number | boolean | undefined;
    to: string | number | boolean | undefined;
};

const antigravityTheme: Partial<Theme> = {
    accentColor: '#3b82f6',
    accentFg: '#ffffff',
    accentLight: 'rgba(59, 130, 246, 0.15)',

    bgCell: '#0f172a', // Darker blue-gray
    bgCellMedium: '#1e293b', // Slate blue
    bgHeader: '#1e293b',
    bgHeaderHasFocus: '#334155',
    bgHeaderHovered: '#334155',

    bgBubble: '#334155',
    bgBubbleSelected: '#3b82f6',

    bgSearchResult: 'rgba(59, 130, 246, 0.3)',

    borderColor: '#334155',
    horizontalBorderColor: '#1e293b',

    drilldownBorder: 'rgba(59, 130, 246, 0.5)',

    linkColor: '#60a5fa',

    headerFontStyle: 'bold 15px',
    baseFontStyle: '13px',
    fontFamily: '"Inter", system-ui, sans-serif',

    textBubble: '#94a3b8',
    textDark: '#ffffff', // Bright text for visibility
    textGroupHeader: '#3b82f6',
    textHeader: '#ffffff',
    textHeaderSelected: '#ffffff',
    textLight: '#94a3b8',
    textMedium: '#cbd5e1',

    cellHorizontalPadding: 10,
    cellVerticalPadding: 8,
    headerIconSize: 16,
};

export const AntigravityGrid = React.memo(function AntigravityGrid({ width, height }: AntigravityGridProps = {}) {
    const {
        columns,
        filteredRows,
        setCellValuesBatch,
        filters,
        setColumnWidth,

        applyReviewCompensation,
        memos,
        setMemo,
        deleteMemo,
        deleteRow,
        deleteColumn,
        setSelectedRowIndex,
        setSelectedColumnId,
        mappings
    } = useGridStore();

    // Memo & Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number; bounds?: { x: number; y: number; width: number; height: number } } | null>(null);
    const [isMemoEditOpen, setIsMemoEditOpen] = useState(false);
    const [memoEditText, setMemoEditText] = useState('');
    const [activeMemoCell, setActiveMemoCell] = useState<{ row: number; col: number; bounds?: { x: number; y: number; width: number; height: number } } | null>(null);
    const [copiedMemo, setCopiedMemo] = useState<string | null>(null);

    // Close context menu on click outside
    useEffect(() => {
        const closeMenu = (e: MouseEvent) => {
            // Don't interfere with browser dialogs (confirm, alert, etc.)
            // These don't propagate click events properly
            if (!contextMenu) return;

            // If clicking on the context menu itself, don't close
            const target = e.target as HTMLElement;
            if (target.closest('[data-context-menu]')) {
                return;
            }

            setContextMenu(null);
        };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [contextMenu]);



    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onCellContextMenu = useCallback((cell: Item, event: any) => {
        const nativeEvent = event.originalEvent;
        if (nativeEvent) {
            nativeEvent.preventDefault();
        } else {
            event.preventDefault?.();
        }

        const [col, row] = cell;
        if (col < 0) return; // Allow row < 0 for header context menu

        setContextMenu({
            x: nativeEvent?.clientX ?? event.clientX ?? 0,
            y: nativeEvent?.clientY ?? event.clientY ?? 0,
            row,
            col,
            bounds: event.bounds
        });
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onHeaderContextMenu = useCallback((col: number, event: any) => {
        event.preventDefault?.();
        setContextMenu({
            x: event.clientX ?? 0,
            y: event.clientY ?? 0,
            row: -1, // Header row indicator
            col,
            bounds: event.bounds
        });
    }, []);

    const handleEditMemo = () => {
        if (!contextMenu) return;
        const { row, col } = contextMenu;
        const targetRow = filteredRows[row];
        const targetCol = columns[col];
        if (!targetRow || !targetCol) return;

        const key = `${targetRow.integratedKey}:${targetCol.id}`;
        const existingMemo = memos[key] || '';

        setActiveMemoCell({ row, col, bounds: contextMenu.bounds });
        setMemoEditText(existingMemo);
        setIsMemoEditOpen(true);
        setContextMenu(null); // Close menu
    };

    const handleDeleteMemo = () => {
        if (!contextMenu) return;
        const { row, col } = contextMenu;
        const targetRow = filteredRows[row];
        const targetCol = columns[col];
        if (!targetRow || !targetCol) return;

        deleteMemo(targetRow.integratedKey, targetCol.id);
        setContextMenu(null);
    };

    const handleDeleteRow = () => {
        if (!contextMenu) return;
        const { row } = contextMenu;
        const targetRow = filteredRows[row];
        if (!targetRow) return;

        // [Safety] Only allow physical deletion of manually added rows
        if (!targetRow.integratedKey.startsWith('CHECK-')) {
            alert('원본 데이터는 물리적으로 삭제할 수 없습니다. 검토열에 "삭제"를 입력하여 마킹해 주세요.');
            return;
        }

        if (confirm(`'${targetRow.standardPK}' 행을 삭제하시겠습니까?`)) {
            deleteRow(targetRow.integratedKey);
        }
        setContextMenu(null);
    };

    const handleDeleteColumn = () => {
        if (!contextMenu) return;
        const { col } = contextMenu;
        const targetCol = columns[col];
        if (!targetCol) return;

        // [Safety] Only allow deletion of user-added columns or review_remarks
        if (!targetCol.id.startsWith('user_') && targetCol.id !== 'review_remarks') {
            alert('원본 데이터 열은 삭제할 수 없습니다.');
            return;
        }

        if (confirm(`'${targetCol.title}' 열을 삭제하시겠습니까?`)) {
            deleteColumn(targetCol.id);
        }
        setContextMenu(null);
    };

    const handleCopyMemo = () => {
        if (!contextMenu) return;
        const { row, col } = contextMenu;
        const targetRow = filteredRows[row];
        const targetCol = columns[col];
        if (!targetRow || !targetCol) return;

        const key = `${targetRow.integratedKey}:${targetCol.id}`;
        const existingMemo = memos[key];
        if (existingMemo) {
            setCopiedMemo(existingMemo);
            console.log(`[Memo] Copied memo from ${key}`);
        }
        setContextMenu(null);
    };

    const handlePasteMemo = () => {
        if (!contextMenu || copiedMemo === null) return;
        const { row, col } = contextMenu;
        const targetRow = filteredRows[row];
        const targetCol = columns[col];
        if (!targetRow || !targetCol) return;

        setMemo(targetRow.integratedKey, targetCol.id, copiedMemo);
        console.log(`[Memo] Pasted memo to ${targetRow.integratedKey}:${targetCol.id}`);
        setContextMenu(null);
    };

    const saveMemo = () => {
        if (!activeMemoCell) return;
        const { row, col } = activeMemoCell;
        const targetRow = filteredRows[row];
        const targetCol = columns[col];
        if (targetRow && targetCol) {
            if (memoEditText.trim()) {
                setMemo(targetRow.integratedKey, targetCol.id, memoEditText.trim());
            } else {
                deleteMemo(targetRow.integratedKey, targetCol.id);
            }
        }
        setIsMemoEditOpen(false);
        setActiveMemoCell(null);
    };

    const [reviewConfirmState, setReviewConfirmState] = useState<{
        isOpen: boolean;
        step: 'confirm' | 'success';
        count: number;
        appliedCount: number;
    }>({ isOpen: false, step: 'confirm', count: 0, appliedCount: 0 });

    const confirmReviewCompensation = () => {
        const { applied } = applyReviewCompensation();
        setReviewConfirmState(prev => ({
            ...prev,
            step: 'success',
            appliedCount: applied
        }));
    };

    const closeReviewModal = () => {
        setReviewConfirmState(prev => ({ ...prev, isOpen: false }));
    };

    // Debug: disabled for final state
    const DEBUG = false;

    // Calculate frozen column count based on frozen property
    const calculatedFrozenCount = useMemo(() => {
        let count = 0;
        for (const col of columns) {
            if (col.frozen === true) count++;
            else break;
        }
        return Math.max(1, count); // At least 1 frozen column
    }, [columns]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({
        width: width ?? window.innerWidth,
        height: height ?? window.innerHeight
    });
    const [gridSelection, setGridSelection] = useState<GridSelection | undefined>(undefined);
    const undoStack = useRef<HistoryChange[][]>([]);
    const redoStack = useRef<HistoryChange[][]>([]);

    // Reset selection when columns change to prevent out-of-bounds glitches
    useEffect(() => {
        setGridSelection(undefined);
    }, [columns.length]);

    // Measure container size on mount and window resize
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const newWidth = width ?? rect.width;
                const newHeight = height ?? rect.height;

                // Always update, even if size is 0
                const finalSize = {
                    width: Math.max(newWidth, 400),
                    height: Math.max(newHeight, 300)
                };
                setContainerSize(finalSize);
            } else {
                // Fallback if container ref not available
                const fallbackSize = {
                    width: width ?? window.innerWidth - 40,
                    height: height ?? window.innerHeight - 300
                };
                setContainerSize(fallbackSize);
            }
        };

        // Immediate update
        updateSize();

        // Additional updates with delay
        const timer1 = setTimeout(updateSize, 50);
        const timer2 = setTimeout(updateSize, 200);

        const resizeObserver = new ResizeObserver(() => {
            updateSize();
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        window.addEventListener('resize', updateSize);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            window.removeEventListener('resize', updateSize);
            resizeObserver.disconnect();
        };
    }, [width, height, DEBUG]);

    const [filterPopup, setFilterPopup] = useState<{
        columnId: string;
        columnTitle: string;
        anchor: { x: number; y: number };
    } | null>(null);

    const gridColumns: GridColumn[] = useMemo(() => {
        return columns.map((col: StoreGridColumn, idx: number) => {
            const hasFilter = filters.has(col.id);

            // Ensure minimum width
            const colWidth = Math.max(col.width || 120, 80);

            // Build theme override with only valid values
            const themeOverride: Partial<Theme> = {};
            if (idx < calculatedFrozenCount) {
                themeOverride.bgCell = '#1e293b';
            }
            if (hasFilter) {
                themeOverride.bgHeader = '#3b82f6';
                themeOverride.textHeader = '#ffffff';
            } else {
                themeOverride.bgHeader = '#1e293b';
            }

            const colDef: GridColumn = {
                id: col.id,
                title: col.title,
                width: colWidth,
                hasMenu: true,
                themeOverride,
            };

            return colDef;
        });
    }, [columns, calculatedFrozenCount, filters]);

    const getCellContent = useCallback(
        (cell: Item): GridCell => {
            const [colIdx, rowIdx] = cell;
            const row = filteredRows[rowIdx];
            const col = columns[colIdx];

            if (!row || !col) {
                return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
            }

            const value = row[col.id];
            const displayValue = value?.toString() ?? '';



            if (col.id === 'exists') {
                const statusMap: Record<string, { label: string; color: string; bgColor: string }> = {
                    'Both': { label: 'Both', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.06)' },
                    'Both(M)': { label: 'Both(M)', color: '#facc15', bgColor: 'rgba(250, 204, 21, 0.06)' },
                    'Only Ref': { label: 'Only Ref', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.06)' },
                    'Only Comp': { label: 'Only Comp', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.06)' }
                };
                const status = statusMap[displayValue] || { label: displayValue, color: '#94a3b8', bgColor: '#1e293b' };

                return {
                    kind: GridCellKind.Text,
                    data: status.label,
                    displayData: status.label,
                    allowOverlay: false,
                    themeOverride: {
                        textDark: status.color,
                        bgCell: status.bgColor,
                    }
                } as GridCell;
            }

            if (col.id === 'review_remarks') {
                return {
                    kind: GridCellKind.Text,
                    data: displayValue,
                    displayData: displayValue,
                    allowOverlay: true,
                    themeOverride: {
                        bgCell: 'rgba(5, 150, 105, 0.05)',
                        textDark: '#10b981',
                        baseFontStyle: 'italic 13px "Inter", sans-serif',
                    }
                };
            }

            let isDifferent = false;
            let reviewDiffersFromOriginal = false;
            let baseShouldBeRed = false;

            // Extract base key: remove side indicator and review suffix
            // e.g., "TagNo_기준" -> "TagNo", "TagNo_기준검토" -> "TagNo"
            const baseKey = col.id
                .replace('_기준검토', '')
                .replace('_비교검토', '')
                .replace('_기준', '')
                .replace('_비교', '');

            const isReviewColumn = col.id.endsWith('_기준검토') || col.id.endsWith('_비교검토');
            const isBaseColumn = (col.id.endsWith('_기준') || col.id.endsWith('_비교')) && !isReviewColumn;

            if (row.exists === 'Both') {
                // [Dynamic Calculation] Check Ref vs Comp Difference
                const refKey = `${baseKey}_기준`;
                const refReviewKey = `${baseKey}_기준검토`;
                const compKey = `${baseKey}_비교`;
                const compReviewKey = `${baseKey}_비교검토`;

                const effectiveRefVal = String(row[refReviewKey] || row[refKey] || '').trim();
                const effectiveCompVal = String(row[compReviewKey] || row[compKey] || '').trim();

                if (!isValuesMatch(effectiveRefVal, effectiveCompVal)) {
                    isDifferent = true;
                }
            }

            // [Dynamic Calculation] Check Base vs Review Difference (on the SAME side)
            if (isReviewColumn) {
                const baseColId = col.id.replace('검토', '');
                const originalValue = String(row[baseColId] || '').trim();
                const reviewValue = String(row[col.id] || '').trim();
                if (reviewValue !== '' && !isValuesMatch(reviewValue, originalValue)) {
                    reviewDiffersFromOriginal = true;
                }
            } else if (isBaseColumn) {
                const reviewColId = `${col.id}검토`;
                const reviewValue = String(row[reviewColId] || '').trim();
                const originalValue = String(row[col.id] || '').trim();
                if (reviewValue !== '' && !isValuesMatch(reviewValue, originalValue)) {
                    baseShouldBeRed = true;
                }
            }

            // [New] SK Match Indication
            const isSKMatch = row.skMatch === true;

            // [New] Strict Check: Only check PK Review Column for "Delete" / "Add" status
            let isDeleted = false;
            let isAdded = false;

            const pkColumn = useGridStore.getState().pkColumn;
            const refPKReviewCol = `${pkColumn}_기준검토`;
            const compPKReviewCol = `${pkColumn}_비교검토`;

            // Helper to check status
            const checkStatus = (val: any) => {
                const s = String(val || '').trim().toLowerCase();
                if (s === '삭제' || s === 'delete') return 'delete';
                if (s === '추가' || s === 'add') return 'add';
                return null;
            };

            const refStatus = checkStatus(row[refPKReviewCol]);
            const compStatus = checkStatus(row[compPKReviewCol]);

            const isRefCol = col.id.endsWith('_기준') || col.id.endsWith('_기준검토');
            const isCompCol = col.id.endsWith('_비교') || col.id.endsWith('_비교검토');

            if (isRefCol) {
                if (refStatus === 'delete') isDeleted = true;
                if (refStatus === 'add') isAdded = true;
            } else if (isCompCol) {
                if (compStatus === 'delete') isDeleted = true;
                if (compStatus === 'add') isAdded = true;
            } else {
                if (row.exists === 'Only Ref') {
                    if (refStatus === 'delete') isDeleted = true;
                    if (refStatus === 'add') isAdded = true;
                } else if (row.exists === 'Only Comp') {
                    if (compStatus === 'delete') isDeleted = true;
                    if (compStatus === 'add') isAdded = true;
                } else {
                    if (refStatus === 'delete' || compStatus === 'delete') isDeleted = true;
                    if (refStatus === 'add' || compStatus === 'add') isAdded = true;
                }
            }

            // [New] Standard PK/SK Styling
            if (col.id === 'standardPK' || col.id === 'standardSK' || col.id === 'integratedKey') {
                const isOnly = row.exists === 'Only Ref' || row.exists === 'Only Comp' || row.exists === 'Both(M)';

                // [Dynamic] Check if ANY target column in this row has a mismatch
                let rowHasDynamicDiff = false;
                if (row.exists === 'Both') {
                    rowHasDynamicDiff = mappings.some(m => {
                        if (!m.isTarget) return false;
                        const rK = `${m.refColumn}_기준`;
                        const rRK = `${m.refColumn}_기준검토`;
                        const cK = `${m.refColumn}_비교`;
                        const cRK = `${m.refColumn}_비교검토`;
                        const effRef = String(row[rRK] || row[rK] || '').trim();
                        const effComp = String(row[cRK] || row[cK] || '').trim();
                        return !isValuesMatch(effRef, effComp);
                    });
                }

                return {
                    kind: GridCellKind.Text,
                    data: displayValue,
                    displayData: displayValue,
                    allowOverlay: true,
                    themeOverride: {
                        baseFontStyle: (isDeleted || col.id === 'integratedKey') ? 'bold 12px "Inter", sans-serif' : 'bold 12px "Inter", sans-serif',
                        textDark: isDeleted ? '#9ca3af' : (isAdded ? '#16a34a' : (isOnly ? '#ef4444' : (rowHasDynamicDiff ? '#ef4444' : (isSKMatch ? '#f59e0b' : undefined)))),
                        bgCell: isDeleted ? '#374151' : (isAdded ? 'rgba(22, 163, 74, 0.1)' : (isOnly ? 'rgba(239, 68, 68, 0.05)' : (rowHasDynamicDiff ? 'rgba(254, 240, 138, 0.5)' : (isSKMatch ? 'rgba(245, 158, 11, 0.1)' : '#1e293b')))),
                    }
                };
            }

            // Apply styling based on conditions
            let textColor: string | undefined = undefined;
            let bgColor: string | undefined = undefined;
            let fontStyle: string | undefined = undefined;

            if (isDeleted) {
                textColor = '#9ca3af';
                bgColor = '#374151';
                fontStyle = 'italic 13px "Inter", sans-serif';
            } else if (isAdded) {
                bgColor = 'rgba(22, 163, 74, 0.1)';
            } else if (baseShouldBeRed || reviewDiffersFromOriginal) {
                // [Python Standard] Use Red text for modified review data or base that was modified
                textColor = '#ef4444'; // red-500
                bgColor = 'rgba(254, 202, 202, 0.2)';
                fontStyle = 'bold 13px "Inter", sans-serif';
            } else if (isDifferent) {
                // Different values between Ref and Comp -> RED text + Yellow background
                textColor = '#ef4444'; // Red text for actual difference
                bgColor = 'rgba(254, 240, 138, 0.5)'; // Yellow background
            } else if (isSKMatch && (col.id.includes('SK_기준') || col.id.includes('SK_비교') || col.id === 'standardSK')) {
                textColor = '#f59e0b'; // Amber-500 for SK match
                bgColor = 'rgba(245, 158, 11, 0.1)';
            } else if (colIdx < calculatedFrozenCount) {
                bgColor = '#1e293b';
            }

            return {
                kind: GridCellKind.Text,
                data: displayValue,
                displayData: displayValue,
                allowOverlay: true,
                themeOverride: (textColor || bgColor || fontStyle) ? {
                    ...(textColor ? { textDark: textColor } : {}),
                    ...(bgColor ? { bgCell: bgColor } : {}),
                    ...(fontStyle ? { baseFontStyle: fontStyle } : {}),
                } : undefined,
            };
        },
        [filteredRows, columns, calculatedFrozenCount, mappings]
    );

    const pushBatch = useCallback((changes: HistoryChange[]) => {
        const filtered = changes.filter(c => c.from !== c.to);
        if (filtered.length === 0) return;
        undoStack.current.push(filtered);
        redoStack.current = [];
    }, []);

    // Check if Both(M) data exists to conditionally show the filter button


    const onCellsEdited = useCallback(
        (newValues: readonly { readonly location: Item; readonly value: EditableGridCell }[]) => {
            const batch: HistoryChange[] = [];
            const storeUpdates: { rowIdx: number; colId: string; value: string | number | boolean }[] = [];
            const storeRows = useGridStore.getState().rows;

            // [Optimization] Create a map of integratedKey -> store index for O(1) lookup
            const keyToIndexMap = new Map<string, number>();
            storeRows.forEach((row, index) => {
                keyToIndexMap.set(row.integratedKey, index);
            });

            newValues.forEach(({ location, value }) => {
                const [colIdx, rowIdx] = location;
                const col = columns[colIdx];
                if (!col || colIdx < calculatedFrozenCount) return;

                if (value.kind === GridCellKind.Text) {
                    const originalRow = filteredRows[rowIdx];
                    if (originalRow) {
                        // [Fix] Use map for O(1) lookup instead of indexOf (O(N))
                        const originalIdx = keyToIndexMap.get(originalRow.integratedKey);
                        if (originalIdx !== undefined) {
                            const prevVal = storeRows[originalIdx][col.id];
                            batch.push({
                                key: originalRow.integratedKey,
                                colId: col.id,
                                from: prevVal,
                                to: value.data,
                            });
                            storeUpdates.push({
                                rowIdx: originalIdx,
                                colId: col.id,
                                value: value.data,
                            });
                        }
                    }
                }
            });

            if (storeUpdates.length > 0) {
                setCellValuesBatch(storeUpdates);
            }
            if (batch.length > 0) {
                pushBatch(batch);
            }
        },
        [columns, calculatedFrozenCount, filteredRows, setCellValuesBatch, pushBatch]
    );


    const onHeaderClicked = useCallback(
        (colIdx: number, event: HeaderClickedEventArgs) => {
            const col = columns[colIdx];
            if (!col) return;

            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!containerRect) return;

            const bounds = event.bounds;
            setFilterPopup({
                columnId: col.id,
                columnTitle: col.title,
                anchor: {
                    x: containerRect.left + bounds.x,
                    y: containerRect.top + bounds.y + bounds.height
                },
            });
        },
        [columns]
    );

    const closeFilterPopup = useCallback(() => setFilterPopup(null), []);

    const handlePaste = useCallback(
        (target: Item, values: readonly (readonly string[])[]) => {
            const [startCol, startRow] = target;
            const updates: HistoryChange[] = [];
            const storeRows = useGridStore.getState().rows;

            // [Optimization] Create a map of integratedKey -> store index for O(1) lookup
            const keyToIndexMap = new Map<string, number>();
            storeRows.forEach((row, index) => {
                keyToIndexMap.set(row.integratedKey, index);
            });

            values.forEach((rowValues, rIdx) => {
                rowValues.forEach((val, cIdx) => {
                    const colIdx = startCol + cIdx;
                    const rowIdx = startRow + rIdx;
                    const row = filteredRows[rowIdx];
                    const col = columns[colIdx];

                    // Basic bounds check
                    if (!row || !col || colIdx < calculatedFrozenCount) return;

                    // [Fix] Robust lookup using integratedKey
                    const originalIdx = keyToIndexMap.get(row.integratedKey);

                    if (originalIdx !== undefined) {
                        updates.push({
                            key: row.integratedKey,
                            colId: col.id,
                            from: storeRows[originalIdx][col.id],
                            to: val,
                        });
                    }
                });
            });

            const storeUpdates: { rowIdx: number; colId: string; value: string | number | boolean }[] = [];
            updates.forEach(u => {
                // We can re-use the map here if we wanted, but let's stick to the verified index
                // Actually, updates contain the key, so let's look it up again or just use the index if we stored it
                // For simplicity and safety against race conditions (unlikely here but still), let's look up
                const idx = keyToIndexMap.get(u.key);
                if (idx !== undefined) {
                    storeUpdates.push({
                        rowIdx: idx,
                        colId: u.colId,
                        value: u.to ?? '',
                    });
                }
            });

            if (storeUpdates.length > 0) {
                setCellValuesBatch(storeUpdates);
            }

            pushBatch(updates);

            // Return false so grid doesn't try to auto-paste again
            return false;
        },
        [columns, calculatedFrozenCount, filteredRows, pushBatch, setCellValuesBatch]
    );

    const applyHistory = useCallback((stackFrom: typeof undoStack, stackTo: typeof redoStack) => {
        const batch = stackFrom.current.pop();
        if (!batch) return;
        const storeRows = useGridStore.getState().rows;
        const inverse: HistoryChange[] = [];
        const storeUpdates: { rowIdx: number; colId: string; value: string | number | boolean }[] = [];

        batch.forEach(change => {
            const targetIdx = storeRows.findIndex(r => r.integratedKey === change.key);
            if (targetIdx === -1) return;
            const currentVal = storeRows[targetIdx][change.colId];
            inverse.push({ key: change.key, colId: change.colId, from: currentVal, to: change.from });
            storeUpdates.push({
                rowIdx: targetIdx,
                colId: change.colId,
                value: (change.from ?? '') as string | number | boolean
            });
        });

        if (storeUpdates.length > 0) {
            setCellValuesBatch(storeUpdates);
        }

        if (inverse.length > 0) {
            stackTo.current.push(inverse);
        }
    }, [setCellValuesBatch]);

    // Handle Copy (Ctrl+C / Cmd+C)
    const handleCopy = useCallback(async () => {
        if (!gridSelection || !gridSelection.current) return;

        const ranges = gridSelection.current.rangeStack && gridSelection.current.rangeStack.length > 0
            ? gridSelection.current.rangeStack
            : (gridSelection.current.range ? [gridSelection.current.range] : []);

        if (ranges.length === 0) return;

        // Calculate bounding box
        let minCol = Infinity, maxCol = -Infinity;
        let minRow = Infinity, maxRow = -Infinity;

        for (const range of ranges) {
            const rangeMinCol = range.x;
            const rangeMaxCol = range.x + range.width - 1;
            const rangeMinRow = range.y;
            const rangeMaxRow = range.y + range.height - 1;

            if (rangeMinCol < minCol) minCol = rangeMinCol;
            if (rangeMaxCol > maxCol) maxCol = rangeMaxCol;
            if (rangeMinRow < minRow) minRow = rangeMinRow;
            if (rangeMaxRow > maxRow) maxRow = rangeMaxRow;
        }

        if (minCol === Infinity) return;

        const width = maxCol - minCol + 1;
        const height = maxRow - minRow + 1;

        const matrix: string[][] = Array(height).fill(null).map(() => Array(width).fill(''));

        for (const range of ranges) {
            for (let r = 0; r < range.height; r++) {
                for (let c = 0; c < range.width; c++) {
                    const rowIdx = range.y + r;
                    const colIdx = range.x + c;

                    if (rowIdx < 0 || rowIdx >= filteredRows.length) continue;
                    if (colIdx < 0 || colIdx >= columns.length) continue;

                    const row = filteredRows[rowIdx];
                    const col = columns[colIdx];

                    let val = '';
                    if (col.id === 'exists') {
                        val = row.exists || '';
                    } else if (col.id === 'integratedKey' || col.id === 'standardPK' || col.id === 'standardSK') {
                        val = String(row[col.id] || '');
                    } else {
                        val = String(row[col.id] || '');

                    }

                    // Simple TSV escape: replace tabs/newlines with spaces or remove?
                    // Excel treats tabs as delimiters.
                    // If value has \n, wrap in quotes?
                    if (val.includes('\n') || val.includes('\t')) {
                        val = `"${val.replace(/"/g, '""')}"`;
                    }
                    matrix[rowIdx - minRow][colIdx - minCol] = val;
                }
            }
        }

        const text = matrix.map(row => row.join('\t')).join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [gridSelection, filteredRows, columns]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const platform = navigator.platform || (navigator as any).userAgentData?.platform || '';
            const isMac = platform.toUpperCase().indexOf('MAC') >= 0;
            const mod = isMac ? e.metaKey : e.ctrlKey;

            // Copy
            if (mod && e.key.toLowerCase() === 'c') {
                // Do not prevent default for copy? 
                // Creating a selection range usually allows browser copy.
                // But we want custom copy.
                // Let's prevent default.
                e.preventDefault();
                handleCopy();
                return;
            }

            if (!mod) return;

            // Undo/Redo
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    applyHistory(redoStack, undoStack);
                } else {
                    applyHistory(undoStack, redoStack);
                }
            } else if (e.key.toLowerCase() === 'y') {
                e.preventDefault();
                applyHistory(redoStack, undoStack);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [applyHistory, handleCopy]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawCell = (args: any) => {
        const { cell, ctx, rect, theme } = args;

        // Handle all text cells - draw them directly on canvas
        if (cell.kind === GridCellKind.Text) {
            ctx.save();

            // Background color
            const bgColor = (cell.themeOverride && cell.themeOverride.bgCell) || theme.bgCell || '#0f172a';
            ctx.fillStyle = bgColor;
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

            // Text color - prioritize themeOverride color, then textDark
            const textColor = (cell.themeOverride && cell.themeOverride.textDark) || theme.textDark || '#ffffff';
            const displayText = cell.displayData || '';

            ctx.fillStyle = textColor;
            ctx.font = '11px "Inter", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const padding = 8;
            const x = rect.x + padding;
            const y = rect.y + rect.height / 2;

            // Clip and draw text
            ctx.save();
            ctx.beginPath();
            ctx.rect(rect.x, rect.y, rect.width, rect.height);
            ctx.clip();
            ctx.fillText(displayText, x, y);
            ctx.restore();
            ctx.restore();

            // Draw Memo Marker if exists
            // Wait, args in drawCell is { ctx, cell, theme, rect, row, col, requestAnimationFrame }
            // Let's check signature. 
            // args: GridCell & { row: number, col: number }... no.
            // drawCell signature: (args: DrawHeaderEventArgs | DrawCellEventArgs) => boolean
            // DrawCellEventArgs has row, col.

            const rowIdx = args.row;
            const colIdx = args.col;
            if (rowIdx >= 0 && colIdx >= 0 && filteredRows[rowIdx]) {
                const rowKey = filteredRows[rowIdx].integratedKey;
                const colId = columns[colIdx].id;
                const memoKey = `${rowKey}:${colId}`;
                if (memos[memoKey]) {
                    ctx.save();
                    ctx.fillStyle = '#ef4444'; // Red-500
                    ctx.beginPath();
                    // Draw triangle at top-right
                    const size = 6;
                    ctx.moveTo(rect.x + rect.width - size, rect.y);
                    ctx.lineTo(rect.x + rect.width, rect.y);
                    ctx.lineTo(rect.x + rect.width, rect.y + size);
                    ctx.fill();
                    ctx.restore();
                }
            }

            return true; // We handled it
        }

        // Handle custom sparkle cells
        if (cell.kind !== GridCellKind.Custom || cell.data.kind !== 'sparkle-cell') {
            return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { label, color, bgColor } = cell.data as any;

        ctx.save();

        // Use a padded rounded box for visibility
        const pad = 4;
        const bx = rect.x + pad;
        const by = rect.y + pad;
        const bw = Math.max(0, rect.width - pad * 2);
        const bh = Math.max(0, rect.height - pad * 2);

        ctx.fillStyle = bgColor || '#1e293b';
        roundRect(ctx, bx, by, bw, bh, 6, true, false);

        // Strong border for contrast
        ctx.strokeStyle = color || '#94a3b8';
        ctx.lineWidth = 1.2;
        roundRect(ctx, bx, by, bw, bh, 6, false, true);

        // Draw centered label explicitly (ensure visible color)
        ctx.fillStyle = color || (theme && theme.textDark) || '#e2e8f0';
        ctx.font = '600 11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(label), rect.x + rect.width / 2, rect.y + rect.height / 2);

        ctx.restore();
        return true;
    };

    // Helper: rounded rect
    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    // Safely render DataEditor with fallback
    const renderGrid = () => {
        const w = containerSize.width || 600;
        const h = containerSize.height || 400;

        if (!gridColumns.length) {
            return (
                <div className="flex items-center justify-center w-full h-full text-slate-400">
                    <p>컬럼 데이터가 없습니다</p>
                </div>
            );
        }

        if (!filteredRows.length) {
            return (
                <div className="flex items-center justify-center w-full h-full text-slate-400">
                    <p>데이터가 없습니다</p>
                </div>
            );
        }

        return (
            <DataEditor
                getCellContent={getCellContent}
                columns={gridColumns}
                rows={filteredRows.length}
                onCellsEdited={onCellsEdited}
                onColumnResize={(colObj, newSize) => {
                    const columnId = colObj.id;
                    if (columnId) {
                        setColumnWidth(columnId, newSize);
                    }
                }}
                onHeaderClicked={onHeaderClicked}
                freezeColumns={calculatedFrozenCount}
                theme={antigravityTheme}
                headerHeight={48}
                rowHeight={34}
                smoothScrollX
                smoothScrollY
                rowMarkers="number"
                getCellsForSelection={true}
                gridSelection={gridSelection}
                onGridSelectionChange={(newSelection) => {
                    setGridSelection(newSelection);

                    // Update store with selected row index and column ID
                    if (newSelection.current) {
                        const row = newSelection.current.cell[1];
                        const col = newSelection.current.cell[0];
                        setSelectedRowIndex(row >= 0 ? row : null);

                        // Look up the column ID from the grid columns
                        const colId = columns[col]?.id || null;
                        setSelectedColumnId(colId);
                    } else if (newSelection.rows?.length && newSelection.rows.length > 0) {
                        const firstRow = [...newSelection.rows][0];
                        setSelectedRowIndex(firstRow);
                        setSelectedColumnId(null); // Row selection mode
                    } else if (newSelection.columns?.length && newSelection.columns.length > 0) {
                        const firstCol = [...newSelection.columns][0];
                        const colId = columns[firstCol]?.id || null;
                        setSelectedColumnId(colId);
                        setSelectedRowIndex(null); // Column selection mode
                    } else {
                        setSelectedRowIndex(null);
                        setSelectedColumnId(null);
                    }
                }}
                width={w}
                height={h}
                drawCell={drawCell}
                onCellContextMenu={onCellContextMenu}
                onHeaderContextMenu={onHeaderContextMenu}
                onPaste={handlePaste}
                verticalBorder={true}
                rightElement={undefined}
            />
        );
    };



    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-slate-950"
            style={{ display: 'flex', flexDirection: 'column' }}
        >
            {/* Memo Context Menu */}
            {contextMenu && (
                <div
                    data-context-menu
                    className="fixed z-[100] bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 w-40 animate-in fade-in zoom-in-95 duration-100"
                    style={{
                        left: contextMenu.x, // Fallback to raw coords if container check fails below
                        top: contextMenu.y,
                        // Use CSS variables for adjusted positions if we really need absolute pixel precision after render
                    }}
                    ref={(el) => {
                        if (el && containerRef.current && contextMenu?.bounds) {
                            const containerRect = containerRef.current.getBoundingClientRect();
                            const menuWidth = 160;
                            const cellRight = containerRect.left + contextMenu.bounds.x + contextMenu.bounds.width;
                            const cellLeft = containerRect.left + contextMenu.bounds.x;

                            let left = cellRight + 2;
                            if (cellRight + menuWidth + 4 > window.innerWidth) {
                                left = cellLeft - menuWidth - 2;
                            }
                            el.style.left = `${left}px`;

                            const menuHeight = el.offsetHeight || 160;
                            const cellTop = containerRect.top + contextMenu.bounds.y;
                            let top = cellTop;
                            if (cellTop + menuHeight > window.innerHeight) {
                                top = Math.max(10, window.innerHeight - menuHeight - 10);
                            }
                            el.style.top = `${top}px`;
                        }
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.row >= 0 && (
                        <>
                            <button
                                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                                onClick={handleEditMemo}
                            >
                                <span>✏️</span> 메모 편집
                            </button>
                            <button
                                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 flex items-center gap-2"
                                onClick={handleCopyMemo}
                            >
                                <span>📋</span> 메모 복사
                            </button>
                            <button
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${copiedMemo ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-500 cursor-not-allowed'}`}
                                onClick={handlePasteMemo}
                                disabled={!copiedMemo}
                            >
                                <span>📥</span> 메모 붙여넣기
                            </button>
                            <button
                                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700 mt-1"
                                onClick={handleDeleteMemo}
                            >
                                <span>🗑️</span> 메모 삭제
                            </button>
                        </>
                    )}

                    {contextMenu && contextMenu.row >= 0 && filteredRows[contextMenu.row]?.integratedKey.startsWith('CHECK-') && (
                        <button
                            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-700 flex items-center gap-2 border-t border-slate-700"
                            onClick={handleDeleteRow}
                        >
                            <span>❌</span> 행 삭제 (Delete Row)
                        </button>
                    )}

                    {contextMenu && (columns[contextMenu.col]?.id.startsWith('user_') || columns[contextMenu.col]?.id === 'review_remarks') && (
                        <button
                            className={`w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-700 flex items-center gap-2 ${contextMenu.row < 0 ? '' : 'border-t border-slate-700'}`}
                            onClick={handleDeleteColumn}
                        >
                            <span>🚫</span> 열 삭제 (Delete Column)
                        </button>
                    )}
                </div>
            )}

            {/* Memo Edit Dialog */}
            {isMemoEditOpen && activeMemoCell && (
                <div
                    className="fixed z-[101] flex flex-col"
                    style={{
                        top: activeMemoCell.bounds?.y || 0,
                        left: (activeMemoCell.bounds?.x || 0) + (activeMemoCell.bounds?.width || 0) + 2
                    }}
                    ref={(el) => {
                        if (el && containerRef.current && activeMemoCell.bounds) {
                            const bounds = activeMemoCell.bounds;
                            const containerRect = containerRef.current.getBoundingClientRect();
                            const dialogHeight = 220;
                            const dialogWidth = 260;
                            const cellTop = containerRect.top + bounds.y;
                            const cellRight = containerRect.left + bounds.x + bounds.width;
                            const cellLeft = containerRect.left + bounds.x;

                            let top = cellTop;
                            if (cellTop + dialogHeight > window.innerHeight) {
                                top = Math.max(10, window.innerHeight - dialogHeight - 10);
                            }

                            let left = cellRight + 2;
                            if (cellRight + dialogWidth + 4 > window.innerWidth) {
                                left = Math.max(10, cellLeft - dialogWidth - 2);
                            }

                            el.style.top = `${top}px`;
                            el.style.left = `${left}px`;
                        }
                    }}
                >
                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-2xl w-64 animate-in fade-in zoom-in-95 duration-200">
                        <h4 className="text-xs font-bold text-white mb-2">메모 편집</h4>
                        <textarea
                            className="w-full h-24 bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-2 resize-none"
                            value={memoEditText}
                            onChange={(e) => setMemoEditText(e.target.value)}
                            placeholder="메모 입력..."
                            autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                            <button
                                onClick={() => setIsMemoEditOpen(false)}
                                className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-white rounded hover:bg-slate-800"
                            >
                                취소
                            </button>
                            <button
                                onClick={saveMemo}
                                className="px-2 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 rounded"
                            >
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Toolbar */}
            {/* Toolbar removed - moved to App.tsx header */}

            {renderGrid()}

            {filterPopup && (
                <ColumnFilterPopup
                    key={filterPopup.columnId}
                    columnId={filterPopup.columnId}
                    columnTitle={filterPopup.columnTitle}
                    anchor={filterPopup.anchor}
                    onClose={closeFilterPopup}
                />
            )}

            <ConfirmModal
                isOpen={reviewConfirmState.isOpen}
                onCancel={closeReviewModal}
                onConfirm={reviewConfirmState.step === 'confirm' ? confirmReviewCompensation : closeReviewModal}
                title={reviewConfirmState.step === 'confirm' ? "검토보완 적용 확인" : "검토보완 완료"}
                message={
                    reviewConfirmState.step === 'confirm'
                        ? `검토보완 변경 ${reviewConfirmState.count}건을 적용할까요?`
                        : `검토보완 완료: ${reviewConfirmState.count}건의 변경이 반영되었습니다. (중복 행 ${reviewConfirmState.appliedCount}건 병합됨)`
                }
                confirmText={reviewConfirmState.step === 'confirm' ? "적용" : "확인"}
                cancelText={reviewConfirmState.step === 'confirm' ? "취소" : ""}
            />
        </div>
    );
});
