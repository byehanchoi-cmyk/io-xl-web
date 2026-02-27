import React, { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, Check, Type, ReplaceAll } from 'lucide-react';

export interface GridFindReplaceProps {
    isOpen: boolean;
    initialMode: 'find' | 'replace';
    onClose: () => void;
    onFindNext: (findText: string, options: FindOptions) => void;
    onFindPrev: (findText: string, options: FindOptions) => void;
    onReplace: (findText: string, replaceText: string, options: FindOptions) => void;
    onReplaceAll: (findText: string, replaceText: string, options: FindOptions) => void;
    onSearchChange?: (findText: string, options: FindOptions) => void;
    currentMatchIndex?: number;
    totalMatches?: number;
    initialInSelection?: boolean;
}

export interface FindOptions {
    matchCase: boolean;
    inSelection: boolean;
}

export const GridFindReplace: React.FC<GridFindReplaceProps> = ({
    isOpen,
    initialMode,
    onClose,
    onFindNext,
    onFindPrev,
    onReplace,
    onReplaceAll,
    onSearchChange,
    currentMatchIndex = 0,
    totalMatches = 0,
    initialInSelection = false,
}) => {
    const [mode, setMode] = useState<'find' | 'replace'>(initialMode);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matchCase, setMatchCase] = useState(false);
    const [inSelection, setInSelection] = useState(false);

    // Focus management
    const findInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (isOpen) {
            // Autofocus string on open
            setTimeout(() => {
                if (findInputRef.current) {
                    findInputRef.current.focus();
                    findInputRef.current.select();
                }
            }, 50);
        }
    }, [isOpen]);

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setMode(initialMode);
            setInSelection(initialInSelection);
        }
    }



    useEffect(() => {
        // Handle global Esc to close if open
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const options: FindOptions = { matchCase, inSelection };

    const handleFindNext = () => {
        if (!findText) return;
        onFindNext(findText, options);
    };

    const handleFindPrev = () => {
        if (!findText) return;
        onFindPrev(findText, options);
    };

    const handleReplace = () => {
        if (!findText) return;
        onReplace(findText, replaceText, options);
    };

    const handleReplaceAll = () => {
        if (!findText) return;
        onReplaceAll(findText, replaceText, options);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                handleFindPrev();
            } else {
                handleFindNext();
            }
        }
    };

    return (
        <div className="absolute top-4 right-4 z-50 bg-slate-800 border border-slate-700 shadow-2xl rounded-lg w-80 overflow-hidden text-sm flex flex-col font-sans">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700">
                <div className="flex bg-slate-800 border border-slate-600 rounded-md overflow-hidden text-xs">
                    <button
                        onClick={() => setMode('find')}
                        className={`px-3 py-1 ${mode === 'find' ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'}`}
                    >
                        찾기
                    </button>
                    <button
                        onClick={() => setMode('replace')}
                        className={`px-3 py-1 ${mode === 'replace' ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:bg-slate-700'}`}
                    >
                        바꾸기
                    </button>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="p-3 space-y-3">
                {/* Find Row */}
                <div className="flex items-center gap-2">
                    <div className="flex-1 relative flex items-center bg-slate-900 border border-slate-600 rounded overflow-hidden">
                        <Search size={14} className="ml-2 text-slate-400 shrink-0" />
                        <input
                            ref={findInputRef}
                            type="text"
                            placeholder="찾을 내용"
                            value={findText}
                            onChange={(e) => {
                                const newText = e.target.value;
                                setFindText(newText);
                                if (onSearchChange) {
                                    onSearchChange(newText, { matchCase, inSelection });
                                }
                            }}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent px-2 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none"
                        />
                        {totalMatches > 0 && (
                            <span className="text-xs text-slate-400 mr-2 whitespace-nowrap shrink-0">
                                {currentMatchIndex + 1} / {totalMatches}
                            </span>
                        )}
                        {totalMatches === 0 && findText && (
                            <span className="text-xs text-red-400 mr-2 whitespace-nowrap shrink-0">
                                결과 없음
                            </span>
                        )}
                    </div>
                    <div className="flex bg-slate-700 rounded border border-slate-600 shrink-0">
                        <button
                            onClick={handleFindPrev}
                            disabled={!findText}
                            className="p-1.5 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed border-r border-slate-600"
                            title="이전 찾기 (Shift+Enter)"
                        >
                            <ChevronUp size={16} />
                        </button>
                        <button
                            onClick={handleFindNext}
                            disabled={!findText}
                            className="p-1.5 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            title="다음 찾기 (Enter)"
                        >
                            <ChevronDown size={16} />
                        </button>
                    </div>
                </div>

                {/* Replace Row */}
                {mode === 'replace' && (
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative flex items-center bg-slate-900 border border-slate-600 rounded overflow-hidden">
                            <span className="ml-2 text-slate-400 font-serif italic text-xs shrink-0 px-1">ab</span>
                            <input
                                type="text"
                                placeholder="바꿀 내용"
                                value={replaceText}
                                onChange={(e) => setReplaceText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleReplace();
                                }}
                                className="w-full bg-transparent px-2 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <button
                                onClick={handleReplace}
                                disabled={!findText || totalMatches === 0}
                                className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center min-w-[50px]"
                                title="바꾸기"
                            >
                                바꾸기
                            </button>
                            <button
                                onClick={handleReplaceAll}
                                disabled={!findText || totalMatches === 0}
                                className="px-2 py-1.5 bg-blue-600 border border-blue-500 rounded text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center min-w-[50px]"
                                title="모두 바꾸기"
                            >
                                모두
                            </button>
                        </div>
                    </div>
                )}

                {/* Options Row */}
                <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer hover:text-white group">
                        <div className={`w-4 h-4 rounded border flex flex-col items-center justify-center transition-colors ${matchCase ? 'bg-blue-600 border-blue-600' : 'bg-slate-900 border-slate-500 group-hover:border-slate-400'}`}>
                            {matchCase && <Check size={12} className="text-white" />}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={matchCase}
                            onChange={(e) => {
                                const newMatchCase = e.target.checked;
                                setMatchCase(newMatchCase);
                                if (onSearchChange && findText) {
                                    onSearchChange(findText, { matchCase: newMatchCase, inSelection });
                                }
                            }}
                        />
                        <span className="flex items-center gap-1">
                            <Type size={12} />
                            대소문자 구분
                        </span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer hover:text-white group">
                        <div className={`w-4 h-4 rounded border flex flex-col items-center justify-center transition-colors ${inSelection ? 'bg-blue-600 border-blue-600' : 'bg-slate-900 border-slate-500 group-hover:border-slate-400'}`}>
                            {inSelection && <Check size={12} className="text-white" />}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={inSelection}
                            onChange={(e) => {
                                const newInSelection = e.target.checked;
                                setInSelection(newInSelection);
                                if (onSearchChange && findText) {
                                    onSearchChange(findText, { matchCase, inSelection: newInSelection });
                                }
                            }}
                        />
                        <span className="flex items-center gap-1">
                            <div className="w-[12px] h-[12px] border border-current border-dashed opacity-80" />
                            선택 영역
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
};
