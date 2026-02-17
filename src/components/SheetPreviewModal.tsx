import React from 'react';
import { X } from 'lucide-react';

interface SheetPreviewModalProps {
    isOpen: boolean;
    sheetName: string;
    headers: string[];
    previewData: string[][];
    selectedHeaderRow: number;
    onHeaderRowSelect: (rowIndex: number) => void;
    onClose: () => void;
    onConfirm: () => void;
}

export const SheetPreviewModal: React.FC<SheetPreviewModalProps> = ({
    isOpen,
    sheetName,
    headers,
    previewData,
    selectedHeaderRow,
    onHeaderRowSelect,
    onClose,
    onConfirm
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">
                            시트 미리보기: {sheetName}
                        </h3>
                        <p className="text-sm text-slate-400">
                            헤더 행을 선택하세요
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Preview Table */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <tbody>
                                {previewData.map((row, rowIndex) => (
                                    <tr
                                        key={rowIndex}
                                        onClick={() => onHeaderRowSelect(rowIndex)}
                                        className={`cursor-pointer transition-colors ${selectedHeaderRow === rowIndex
                                                ? 'bg-blue-600/30 border-2 border-blue-500'
                                                : 'hover:bg-slate-700/50 border border-slate-700'
                                            }`}
                                    >
                                        <td className="px-3 py-2 text-xs font-mono text-slate-400 border-r border-slate-700 text-center w-12">
                                            {rowIndex + 1}
                                        </td>
                                        {row.map((cell, cellIndex) => (
                                            <td
                                                key={cellIndex}
                                                className="px-3 py-2 text-sm text-white border-r border-slate-700 min-w-[100px] max-w-[200px] truncate"
                                                title={cell}
                                            >
                                                {cell || <span className="text-slate-500 italic">빈 셀</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-700 flex items-center justify-between flex-shrink-0">
                    <div className="text-sm text-slate-400">
                        선택된 헤더 행: <span className="text-white font-medium">{selectedHeaderRow + 1}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={onConfirm}
                            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
