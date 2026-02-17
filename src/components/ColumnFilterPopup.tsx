import React, { useState, useMemo } from 'react';
import { useGridStore, type ColumnFilter } from '../store/gridStore';
import { Search, X, ArrowUpDown } from 'lucide-react';

interface ColumnFilterPopupProps {
    columnId: string;
    columnTitle: string;
    anchor: { x: number; y: number };
    onClose: () => void;
}

export const ColumnFilterPopup: React.FC<ColumnFilterPopupProps> = ({
    columnId,
    columnTitle,
    anchor,
    onClose
}) => {
    const { rows, filters, setColumnFilter, clearColumnFilter } = useGridStore();

    // Get existing filter for this column
    const existingFilter = filters.get(columnId);

    const [searchText, setSearchText] = useState(existingFilter?.searchText || '');
    const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set(existingFilter?.selectedValues));
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(existingFilter?.sortOrder || null);

    // Get unique values for this column
    const uniqueValues = useMemo(() => {
        const values = new Set<string>();
        rows.forEach(row => {
            const value = String(row[columnId] ?? '');
            if (value.trim()) {
                values.add(value);
            }
        });
        return Array.from(values).sort();
    }, [rows, columnId]);

    // Filter values based on search text
    const filteredValues = useMemo(() => {
        if (!searchText) return uniqueValues;
        const searchLower = searchText.toLowerCase();
        return uniqueValues.filter(v => v.toLowerCase().includes(searchLower));
    }, [uniqueValues, searchText]);

    const handleToggleValue = (value: string) => {
        const newSet = new Set(selectedValues);
        if (newSet.has(value)) {
            newSet.delete(value);
        } else {
            newSet.add(value);
        }
        setSelectedValues(newSet);
    };

    const handleSelectAll = () => {
        setSelectedValues(new Set(filteredValues));
    };

    const handleClearAll = () => {
        setSelectedValues(new Set());
    };

    const handleApply = () => {
        const filter: ColumnFilter = {
            columnId,
            searchText,
            selectedValues,
            sortOrder
        };
        setColumnFilter(columnId, filter);
        onClose();
    };

    const handleClear = () => {
        clearColumnFilter(columnId);
        onClose();
    };

    const toggleSort = () => {
        if (sortOrder === null) {
            setSortOrder('asc');
        } else if (sortOrder === 'asc') {
            setSortOrder('desc');
        } else {
            setSortOrder(null);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40"
                onClick={onClose}
            />

            {/* Popup */}
            <div
                className="fixed z-50 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-80"
                style={{
                    left: `${anchor.x}px`,
                    top: `${anchor.y}px`,
                    maxHeight: '400px'
                }}
            >
                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm">{columnTitle}</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-slate-700/50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleApply();
                            }}
                            placeholder="검색..."
                            className="w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-500"
                        />
                    </div>
                </div>

                {/* Sort & Select Controls */}
                <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between gap-2 bg-slate-800/50">
                    <button
                        onClick={toggleSort}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortOrder
                            ? 'bg-blue-600 shadow-lg shadow-blue-500/20 text-white'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-600/50'
                            }`}
                    >
                        <ArrowUpDown className={`w-3 h-3 ${sortOrder ? 'text-white' : 'text-slate-400'}`} />
                        {sortOrder === 'asc' ? '오름차순' : sortOrder === 'desc' ? '내림차순' : '정렬'}
                    </button>

                    <div className="flex gap-1.5">
                        <button
                            onClick={handleSelectAll}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-all border border-slate-600/50 active:scale-95"
                        >
                            전체 선택
                        </button>
                        <button
                            onClick={handleClearAll}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-all border border-slate-600/50 active:scale-95"
                        >
                            선택 해제
                        </button>
                    </div>
                </div>

                {/* Values List */}
                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredValues.map(value => (
                        <label
                            key={value}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={selectedValues.has(value)}
                                onChange={() => handleToggleValue(value)}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                            />
                            <span className="text-sm text-slate-200">{value}</span>
                        </label>
                    ))}
                    {filteredValues.length === 0 && (
                        <div className="p-4 text-center text-slate-400 text-sm">
                            검색 결과가 없습니다
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-slate-700/50 flex gap-2 bg-slate-800/80 backdrop-blur-md rounded-b-xl">
                    <button
                        onClick={handleClear}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all border border-slate-600/50 active:scale-95"
                    >
                        필터 제거
                    </button>
                    <button
                        onClick={handleApply}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        적용
                    </button>
                </div>
            </div>
        </>
    );
};
