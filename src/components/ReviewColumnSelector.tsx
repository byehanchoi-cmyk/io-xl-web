import React, { useState } from 'react';
import { useGridStore } from '../store/gridStore';
import { CheckSquare, Square, X, Trash2 } from 'lucide-react';

interface ReviewColumnSelectorProps {
    onClose: () => void;
}

export const ReviewColumnSelector: React.FC<ReviewColumnSelectorProps> = ({ onClose }) => {
    const {
        mappings, setMappings, runComparison, pkColumn, skColumn, exclusionRules,
        setSelectedReviewColumns, selectedReviewColumns,
        refSheetIdx, compSheetIdx, refHeaderRow, compHeaderRow, columnExclusion,
        setLastRunConfig, generateConfigSnapshot,
        allGeneratedColumns, deleteColumn
    } = useGridStore();
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
        new Set(mappings.filter(m => m.isTarget).map(m => m.refColumn))
    );
    const [showReviewRemarks, setShowReviewRemarks] = useState(selectedReviewColumns.includes('review_remarks'));

    const handleToggle = (refColumn: string) => {
        const newSet = new Set(selectedColumns);
        if (newSet.has(refColumn)) {
            newSet.delete(refColumn);
        } else {
            newSet.add(refColumn);
        }
        setSelectedColumns(newSet);
    };

    const toggleReviewRemarks = () => {
        setShowReviewRemarks(prev => !prev);
    };

    const handleSelectAll = () => {
        setSelectedColumns(new Set(mappings.map(m => m.refColumn)));
    };

    const handleClearAll = () => {
        setSelectedColumns(new Set());
    };

    const handleApply = () => {
        const updatedMappings = mappings.map(mapping => ({
            ...mapping,
            isTarget: selectedColumns.has(mapping.refColumn)
        }));

        // [Fix] Integrated Key Stability & Last Info Persistence
        // 1. Toggling review columns should only affect visibility and summary statistics.
        // Re-running 'runComparison' calculates keys from raw files, overwriting manual compensation.
        const selectedArray = Array.from(selectedColumns);
        if (showReviewRemarks) selectedArray.push('review_remarks');

        setMappings(updatedMappings);
        setSelectedReviewColumns(selectedArray);

        // 2. [Maintenance of Last Info] Update lastRunConfig snapshot to reflect current mappings
        // This prevents MappingScreen from showing "Configuration Changed" status unnecessarily.
        setLastRunConfig(generateConfigSnapshot());

        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-2xl mx-4">
                {/* Header */}
                <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">
                            검토 대상 컬럼 선택
                        </h3>
                        <p className="text-sm text-slate-400">
                            비교 분석에 포함할 컬럼을 선택하세요
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Controls */}
                <div className="p-4 border-b border-slate-700 space-y-3">
                    {/* Special Toggles */}
                    <div className="flex items-center gap-4 pb-3 border-b border-slate-700/50">
                        <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-700/50`}>
                            <input
                                type="checkbox"
                                checked={showReviewRemarks}
                                onChange={toggleReviewRemarks}
                                className="sr-only"
                            />
                            {showReviewRemarks ? (
                                <CheckSquare className="w-5 h-5 text-green-400 flex-shrink-0" />
                            ) : (
                                <Square className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="text-sm font-medium text-white">
                                검토의견 표시
                            </div>
                        </label>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleSelectAll}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                        >
                            전체 선택
                        </button>
                        <button
                            onClick={handleClearAll}
                            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
                        >
                            전체 해제
                        </button>
                        <div className="ml-auto text-sm text-slate-400 flex items-center">
                            {selectedColumns.size} / {mappings.length} 선택됨
                        </div>
                    </div>
                </div>

                {/* Column List */}
                <div className="p-4 max-h-96 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {mappings.map(mapping => {
                            const isSelected = selectedColumns.has(mapping.refColumn);
                            return (
                                <label
                                    key={mapping.refColumn}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isSelected
                                        ? 'bg-blue-600/20 border border-blue-500'
                                        : 'bg-slate-700/50 border border-slate-600 hover:bg-slate-700'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleToggle(mapping.refColumn)}
                                        className="sr-only"
                                    />
                                    {isSelected ? (
                                        <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                                    ) : (
                                        <Square className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">
                                            {mapping.refColumn}
                                        </div>
                                        {mapping.compColumn && mapping.compColumn !== mapping.refColumn && (
                                            <div className="text-xs text-slate-400 truncate">
                                                ↔ {mapping.compColumn}
                                            </div>
                                        )}
                                    </div>
                                </label>
                            );
                        })}

                        {/* User-added Columns */}
                        {allGeneratedColumns.filter(c => c.id.startsWith('user_')).map(col => {
                            const isSelected = selectedReviewColumns.includes(col.id);
                            return (
                                <div
                                    key={col.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isSelected
                                        ? 'bg-amber-600/10 border border-amber-500/50'
                                        : 'bg-slate-700/30 border border-slate-700/50'
                                        }`}
                                >
                                    <label className="flex items-center gap-3 flex-1 cursor-pointer min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {
                                                const newSelected = isSelected
                                                    ? selectedReviewColumns.filter(id => id !== col.id)
                                                    : [...selectedReviewColumns, col.id];
                                                setSelectedReviewColumns(newSelected);
                                            }}
                                            className="sr-only"
                                        />
                                        {isSelected ? (
                                            <CheckSquare className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                        ) : (
                                            <Square className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-white truncate">
                                                {col.title}
                                            </div>
                                            <div className="text-[10px] text-amber-500/70 font-bold uppercase tracking-tighter">
                                                사용자 추가 열
                                            </div>
                                        </div>
                                    </label>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`'${col.title}' 열을 삭제하시겠습니까?`)) {
                                                deleteColumn(col.id);
                                            }
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 rounded transition-all"
                                        title="열 삭제"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                    >
                        적용
                    </button>
                </div>
            </div>
        </div>
    );
};
