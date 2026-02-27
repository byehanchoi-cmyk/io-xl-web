import React, { useState, useEffect, useRef } from 'react';
import { useGridStore } from '../store/gridStore';
import {
    Settings,
    Save,
    FolderOpen,
    LayoutTemplate,
    Play,
    FileSpreadsheet,
    Columns,
    ArrowRight,
    Check,
    Download,
    X,
    Plus,
    AlertCircle
} from 'lucide-react';
import { filterMappings, type MappingInfo } from '../utils/comparisonEngine';
import { findBestMatch } from '../utils/textUtils';
import { SheetPreviewModal } from './SheetPreviewModal';
import { extractSheetPreview, getSheetPreview } from '../utils/sheetPreview';

export const MappingScreen: React.FC = () => {
    const {
        mappings,
        setMappings,
        pkColumn,
        setPKColumn: setPkColumn,
        skColumn,
        setSKColumn: setSkColumn,

        refWorkbook,
        compWorkbook,
        refFileName,
        compFileName,
        refFile,
        compFile,

        refFilePath,
        compFilePath,

        updateWorkbook,
        updateFilePaths,
        setView,
        setError,

        runComparison,

        columnExclusion,
        setColumnExclusion,
        pkExclusion,
        setPKExclusion,

        refSheetIdx,
        compSheetIdx,
        setSheetIndices,
        refHeaderRow,
        compHeaderRow,
        setHeaderRows,
        globalRules,
        loadGlobalRules,
        saveGlobalRule,
        generateConfigSnapshot,
        lastRunConfig,
        setLastRunConfig
    } = useGridStore();

    const [newColPattern, setNewColPattern] = useState('');
    const [newPKPattern, setNewPKPattern] = useState('');

    // [Fix] Local state for inputs to ensure immediate feedback
    const [localRefPath, setLocalRefPath] = useState(refFilePath || '');
    const [localCompPath, setLocalCompPath] = useState(compFilePath || '');

    // Sync local state with store when store changes
    useEffect(() => {
        if (refFilePath && refFilePath !== localRefPath) {
            setLocalRefPath(refFilePath);
        }
    }, [refFilePath]);

    useEffect(() => {
        if (compFilePath && compFilePath !== localCompPath) {
            setLocalCompPath(compFilePath);
        }
    }, [compFilePath]);

    const [refHasHeader, setRefHasHeader] = useState(true);
    const [compHasHeader, setCompHasHeader] = useState(true);
    const [isParsing, setIsParsing] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const mappingScrollRef = useRef<HTMLDivElement>(null);
    const hasCheckedBadMappings = useRef(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [tempRefPath, setTempRefPath] = useState('');
    const [tempCompPath, setTempCompPath] = useState('');

    // Sheet Preview Modal State
    const [previewModal, setPreviewModal] = useState<{
        isOpen: boolean;
        type: 'ref' | 'comp';
        data: string[][];
    }>({ isOpen: false, type: 'ref', data: [] });

    useEffect(() => {
        if (isSaveModalOpen) {
            setTempRefPath(refFilePath || '');
            setTempCompPath(compFilePath || '');
        }
    }, [isSaveModalOpen, refFilePath, compFilePath]);

    // [New] Snapshot to detect if configuration has changed since last analysis
    // const lastRunSnapshot = useRef<string | null>(null); // Replaced by store.lastRunConfig

    // Load Global Rules on Mount
    useEffect(() => {
        loadGlobalRules();
    }, [loadGlobalRules]);

    const handleSaveGlobalRule = async (type: string, data: any) => {
        const name = prompt(`${type === 'PK_EXCLUSION' ? 'PK 제외' : '컬럼 제외'} 규칙 이름을 입력하세요:`);
        if (!name) return;

        try {
            await saveGlobalRule(name, type, JSON.stringify(data));
            alert('규칙이 DB에 저장되었습니다.');
        } catch (e) {
            alert('저장 실패: ' + e);
        }
    };

    const handleApplyGlobalRule = (rule: any) => {
        try {
            const data = JSON.parse(rule.rule_json);
            if (rule.type === 'PK_EXCLUSION') {
                setPKExclusion(data);
            } else if (rule.type === 'COL_EXCLUSION') {
                setColumnExclusion(data);
            }
            alert(`[${rule.name}] 규칙이 적용되었습니다.`);
        } catch (e) {
            alert('규칙 적용 실패: ' + e);
        }
    };

    // Track last processed paths and mount state to prevent unwanted resets
    const lastProcessedPaths = useRef<{ ref: string | null, comp: string | null }>({ ref: null, comp: null });


    // [New] Auto-append filename to path for better visibility
    useEffect(() => {
        if (lastProcessedPaths.current.ref === refFilePath && lastProcessedPaths.current.comp === compFilePath) {
            return;
        }

        let newRefPath = refFilePath;
        let newCompPath = compFilePath;
        let changed = false;

        const normalize = (str: string) => str ? str.normalize('NFC') : '';

        if (refFilePath && refFileName) {
            const normPath = normalize(refFilePath);
            const normName = normalize(refFileName);
            if (!normPath.endsWith(normName) && !refFilePath.endsWith(refFileName)) {
                const separator = refFilePath.includes('\\') ? '\\' : '/';
                newRefPath = refFilePath.endsWith(separator) ? `${refFilePath}${refFileName}` : `${refFilePath}${separator}${refFileName}`;
                changed = true;
            }
        }

        if (compFilePath && compFileName) {
            const normPath = normalize(compFilePath);
            const normName = normalize(compFileName);
            if (!normPath.endsWith(normName) && !compFilePath.endsWith(compFileName)) {
                const separator = compFilePath.includes('\\') ? '\\' : '/';
                newCompPath = compFilePath.endsWith(separator) ? `${compFilePath}${compFileName}` : `${compFilePath}${separator}${compFileName}`;
                changed = true;
            }
        }

        if (changed) {
            lastProcessedPaths.current = { ref: newRefPath, comp: newCompPath };
            setTimeout(() => updateFilePaths(newRefPath, newCompPath), 0);
        } else {
            lastProcessedPaths.current = { ref: refFilePath, comp: compFilePath };
        }
    }, [refFilePath, compFilePath, refFileName, compFileName, updateFilePaths]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [dirHandle, setDirHandle] = useState<any>(null);
    interface SaveOptions {
        name: string;
        includeSheets: boolean;
        includeColEx: boolean;
        includePKEx: boolean;
        includeMappings: boolean;
    }

    const [saveOptions, setSaveOptions] = useState<SaveOptions>({
        name: `io_xl_config_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        includeSheets: true,
        includeColEx: true,
        includePKEx: true,
        includeMappings: true
    });

    const refSheet = refWorkbook?.sheets[refSheetIdx];
    const compSheet = compWorkbook?.sheets[compSheetIdx];

    const reparseSheet = async (type: 'ref' | 'comp', hasHeaderOverride?: boolean, headerRowOverride?: number) => {
        const file = type === 'ref' ? refFile : compFile;
        if (!file) return;

        const useHasHeader = hasHeaderOverride !== undefined
            ? hasHeaderOverride
            : (type === 'ref' ? refHasHeader : compHasHeader);

        const useHeaderRow = headerRowOverride !== undefined
            ? headerRowOverride
            : (type === 'ref' ? refHeaderRow : compHeaderRow);

        setIsParsing(true);
        try {
            const { parseExcelFile } = await import('../utils/excelParser');
            const parsed = await parseExcelFile(file, {
                hasHeader: useHasHeader,
                headerRow: useHeaderRow
            });
            updateWorkbook(type, parsed);
        } catch (err) {
            console.error('Re-parsing failed:', err);
        } finally {
            setIsParsing(false);
        }
    };

    const handleHeaderToggle = (type: 'ref' | 'comp') => {
        const current = type === 'ref' ? refHasHeader : compHasHeader;
        const next = !current;
        if (type === 'ref') setRefHasHeader(next);
        else setCompHasHeader(next);
        reparseSheet(type, next);
    };

    const handleMappingChange = (refCol: string, compCol: string) => {
        setMappings(mappings.map(m =>
            m.refColumn === refCol ? { ...m, compColumn: compCol } : m
        ));
    };

    const toggleTarget = (refCol: string) => {
        setMappings(mappings.map(m =>
            m.refColumn === refCol ? { ...m, isTarget: !m.isTarget } : m
        ));
    };

    const handleAutoMatch = () => {
        if (!refSheet || !compSheet) return;
        if (!refSheet.columns || !compSheet.columns) return;

        const validRefColumns = refSheet.columns.filter(col => col && typeof col === 'string' && col.trim().length > 0);
        const validCompColumns = compSheet.columns.filter(col => col && typeof col === 'string' && col.trim().length > 0);

        if (validRefColumns.length === 0 || validCompColumns.length === 0) return;

        const newMappings: MappingInfo[] = validRefColumns.map(col => {
            const matchedComp = findBestMatch(col, validCompColumns, 0.8);
            const isUnnamedGarbage = /^(unnamed:?\s*\d*|column\s*\d+)$/i.test(col.trim());
            const isMatch = matchedComp !== '';

            return {
                refColumn: col,
                compColumn: matchedComp,
                isTarget: isMatch && !isUnnamedGarbage,
                isPK: col.toLowerCase() === 'tag no' || col.toLowerCase().includes('tagno') || col.toLowerCase().includes('id'),
                isSK: false
            };
        });

        const foundPK = newMappings.find(m => m.isPK)?.refColumn || validRefColumns[0];
        setMappings(newMappings.map(m => ({ ...m, isPK: m.refColumn === foundPK })));
        setPkColumn(foundPK);
        setSkColumn('');
    };

    const prevIndices = useRef({ ref: refSheetIdx, comp: compSheetIdx });
    const isFirstMount = useRef(true);

    // Auto-match when sheet selection changes
    useEffect(() => {
        // Skip on first mount if mappings already exist (returning from Grid)
        if (isFirstMount.current) {
            isFirstMount.current = false;
            prevIndices.current = { ref: refSheetIdx, comp: compSheetIdx };
            // If we have mappings from a previous session (e.g. returning from Grid), keep them
            if (mappings.length > 0) return;
        }

        // Only auto-match if indices actually changed during this session
        const indicesChanged = prevIndices.current.ref !== refSheetIdx || prevIndices.current.comp !== compSheetIdx;

        if (indicesChanged) {
            if (isConfigLoaded || !refWorkbook || !compWorkbook || !refSheet || !compSheet) return;
            if (!refSheet.columns || refSheet.columns.length === 0 || !compSheet.columns || compSheet.columns.length === 0) return;

            const timer = setTimeout(() => {
                handleAutoMatch();
                prevIndices.current = { ref: refSheetIdx, comp: compSheetIdx };
            }, 100);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refSheetIdx, compSheetIdx, isConfigLoaded]);

    // Initial Auto-match / Bad mapping check
    useEffect(() => {
        if (isConfigLoaded) return;

        if (!hasCheckedBadMappings.current && mappings.length > 0) {
            const hasBadMappings = mappings.some(m =>
                m.isTarget && (
                    m.compColumn.includes('(숨길것)') || m.compColumn.includes('(hidden)') ||
                    m.refColumn.includes('(숨길것)') || m.refColumn.includes('(hidden)')
                )
            );
            if (hasBadMappings && refWorkbook && compWorkbook) {
                hasCheckedBadMappings.current = true;
                handleAutoMatch();
                return;
            }
            hasCheckedBadMappings.current = true;
        }

        if (mappings.length > 0 || pkColumn) return;

        if (refWorkbook && compWorkbook && mappings.length === 0) {
            handleAutoMatch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refWorkbook, compWorkbook, refHasHeader, compHasHeader, refSheetIdx, compSheetIdx, mappings.length, pkColumn, isConfigLoaded]);

    const handlePKChange = (col: string) => {
        setPkColumn(col);
        setMappings(mappings.map(m => ({
            ...m,
            isPK: m.refColumn === col,
            isSK: m.refColumn === col ? false : m.isSK
        })));
    };

    const handleSKChange = (col: string) => {
        setSkColumn(col);
        setMappings(mappings.map(m => ({
            ...m,
            isSK: m.refColumn === col,
            isPK: m.refColumn === col ? false : m.isPK
        })));
    };

    const addPKPattern = () => {
        if (newPKPattern.trim() && !pkExclusion.customPatterns.includes(newPKPattern.trim())) {
            setPKExclusion({ ...pkExclusion, customPatterns: [...pkExclusion.customPatterns, newPKPattern.trim()] });
            setNewPKPattern('');
        }
    };

    const removePKPattern = (pattern: string) => {
        setPKExclusion({ ...pkExclusion, customPatterns: pkExclusion.customPatterns.filter(p => p !== pattern) });
    };

    const addColPattern = () => {
        if (newColPattern.trim() && !columnExclusion.patterns.includes(newColPattern.trim())) {
            setColumnExclusion({ ...columnExclusion, patterns: [...columnExclusion.patterns, newColPattern.trim()] });
            setNewColPattern('');
        }
    };

    const removeColPattern = (pattern: string) => {
        setColumnExclusion({ ...columnExclusion, patterns: columnExclusion.patterns.filter(p => p !== pattern) });
    };

    const handleSelectFolder = async () => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handle = await (window as any).showDirectoryPicker();
            setDirHandle(handle);
        } catch (err) {
            console.error('Folder selection cancelled or failed:', err);
        }
    };

    const handleSaveConfig = async () => {
        const config: any = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            metadata: { name: saveOptions.name }
        };

        if (saveOptions.includeSheets) {
            config.sheetSelection = { refIdx: refSheetIdx, compIdx: compSheetIdx, refHasHeader, compHasHeader };
            config.files = {
                ref: { name: refFileName, path: tempRefPath || null },
                comp: { name: compFileName, path: tempCompPath || null }
            };
        }

        if (saveOptions.includeColEx) config.columnExclusion = columnExclusion;
        if (saveOptions.includePKEx) config.pkExclusion = pkExclusion;
        if (saveOptions.includeMappings) {
            // Bake exclusion into isTarget
            config.mappings = mappings.map(m => ({
                ...m,
                isTarget: filterMappings([m], columnExclusion).length === 0 ? false : m.isTarget
            }));
            config.pkColumn = pkColumn;
            config.skColumn = skColumn;
        }

        const fileName = `${saveOptions.name || 'config'}.json`;

        if (dirHandle) {
            try {
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const writable = await (fileHandle as any).createWritable();
                await writable.write(JSON.stringify(config, null, 2));
                await writable.close();
                alert(`파일이 선택하신[${dirHandle.name}] 폴더에 성공적으로 저장되었습니다.`);
                setIsSaveModalOpen(false);
                return;
            } catch (err) {
                console.error('Direct save failed:', err);
            }
        }

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setIsSaveModalOpen(false);
    };

    const validateMappingConfig = (configMappings: MappingInfo[]): { success: boolean; msg: string } => {
        if (!configMappings || configMappings.length === 0) return { success: false, msg: "매핑 설정이 비어 있습니다." };

        // [Resume Mode] Skip validation if raw workbooks are not loaded
        if (!refWorkbook || !compWorkbook) return { success: true, msg: "" };

        const normalize = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '').replace(/\s+/g, '');
        const refCols = new Set((refSheet?.columns || []).map(c => normalize(c)));
        const compCols = new Set((compSheet?.columns || []).map(c => normalize(c)));

        const missingRef: string[] = [];
        const missingComp: string[] = [];

        configMappings.forEach(m => {
            const r = normalize(m.refColumn);
            const c = normalize(m.compColumn);
            if (r && !refCols.has(r)) missingRef.push(m.refColumn);
            const isPlaceholder = c === "" || c === normalize("(미매칭)") || c === normalize("미매칭");
            if (c && !isPlaceholder && !compCols.has(c)) missingComp.push(m.compColumn);
        });

        if (missingRef.length > 0 || missingComp.length > 0) {
            let errorMsg = "⚠️ 설정된 컬럼 중 일부를 현재 파일에서 찾을 수 없습니다.\n\n";
            if (missingRef.length > 0) errorMsg += `[기준파일 누락]: ${missingRef.slice(0, 5).join(', ')}${missingRef.length > 5 ? '...' : ''} \n`;
            if (missingComp.length > 0) errorMsg += `[비교파일 누락]: ${missingComp.slice(0, 5).join(', ')}${missingComp.length > 5 ? '...' : ''} \n`;
            return { success: false, msg: errorMsg };
        }
        return { success: true, msg: "" };
    };

    const handleLoadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                // [Fix] Mark bad mappings as checked to prevent auto-match heuristic from overwriting loaded config
                hasCheckedBadMappings.current = true;
                setIsConfigLoaded(true);
                const config = JSON.parse(event.target?.result as string);

                if (config.columnExclusion) setColumnExclusion(config.columnExclusion);
                if (config.pkExclusion) setPKExclusion(config.pkExclusion);

                if (config.sheetSelection) {
                    const s = config.sheetSelection;
                    setRefHasHeader(s.refHasHeader);
                    setCompHasHeader(s.compHasHeader);
                    setSheetIndices(s.refIdx, s.compIdx);
                    // [Fix] Sync prevIndices immediately to prevent auto-match effect from resetting our loaded config
                    prevIndices.current = { ref: s.refIdx, comp: s.compIdx };
                }

                if (config.files) updateFilePaths(config.files.ref.path, config.files.comp.path);
                else if (config.filePaths) updateFilePaths(config.filePaths.ref, config.filePaths.comp);

                if (config.mappings) {
                    // Build a map of loaded mappings for easy merging
                    const loadedMappings = new Map(config.mappings.map((m: MappingInfo) => [m.refColumn, m]));

                    // Merge: Keep existing user choices if they aren't in the config,
                    // but prioritize config values for matched columns.
                    // This allows "building upon" a template.
                    const mergedMappings = mappings.map(m => {
                        const loaded = loadedMappings.get(m.refColumn);
                        return loaded && typeof loaded === 'object' ? { ...m, ...loaded } : m;
                    });

                    // Add any columns from config that might not be in the current files (validation will catch later)
                    const existingRefCols = new Set(mappings.map(m => m.refColumn));
                    config.mappings.forEach((m: MappingInfo) => {
                        if (!existingRefCols.has(m.refColumn)) {
                            mergedMappings.push(m);
                        }
                    });

                    setMappings(mergedMappings);
                }
                if (config.pkColumn) setPkColumn(config.pkColumn);
                if (config.skColumn) setSkColumn(config.skColumn);

            } catch (err) {
                setIsConfigLoaded(false);
                console.error('Failed to load config:', err);
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // Validation after config load
    useEffect(() => {
        if (isConfigLoaded && refSheet && compSheet) {
            const timer = setTimeout(() => {
                const validation = validateMappingConfig(mappings);
                if (validation.msg) alert(validation.msg);
                setIsConfigLoaded(false);
            }, 300);
            return () => clearTimeout(timer);
        } else if (isConfigLoaded && (!refWorkbook || !compWorkbook)) {
            const timer = setTimeout(() => setIsConfigLoaded(false), 1000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfigLoaded, refSheet, compSheet, mappings.length]);

    const filteredMappings = mappings.filter(m => {
        if (m.isPK || m.isSK) return true;
        return filterMappings([m], columnExclusion).length > 0;
    });

    const isCompColumnExcluded = (colName: string) => {
        const dummyMapping = { refColumn: colName, compColumn: '', isTarget: true, isPK: false, isSK: false };
        return filterMappings([dummyMapping], columnExclusion).length === 0;
    };

    // [Comp Columns Filtering]
    const finalFilteredCompColumns = compSheet?.columns.filter(col => !isCompColumnExcluded(col)) || [];

    const handleRunAnalysis = async () => {
        if (!pkColumn) return;
        setIsAnalyzing(true);

        try {
            const currentSnapshot = generateConfigSnapshot();

            // [Debug] Log snapshots for comparison when they don't match
            if (lastRunConfig !== currentSnapshot) {
                console.log('[MappingScreen] Configuration mismatch detected:');
                console.log(' - Last:', lastRunConfig);
                console.log(' - Curr:', currentSnapshot);
            }

            const isFirstRun = !lastRunConfig;
            const isConfigChanged = lastRunConfig !== currentSnapshot;

            if (isFirstRun || isConfigChanged) {
                console.log('[MappingScreen] Configuration changed or first run. Running analysis...');
                await runComparison(mappings, pkColumn, skColumn || undefined);
                setLastRunConfig(currentSnapshot);
            } else {
                console.log('[MappingScreen] Configuration unchanged. Navigating directly to grid...');
            }
            setView('grid');
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-xl font-extrabold text-white flex items-center gap-2 tracking-tight">
                        <Settings className="w-5 h-5 text-blue-400" />
                        분석 구성
                    </h1>
                    <p className="text-slate-500 text-[11px] font-medium">기준/비교 파일 열 매핑 및 분석 규칙 설정</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex gap-2 mr-4 border-r border-slate-800 pr-4">
                        <button
                            onClick={() => setIsSaveModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg text-xs font-semibold transition-colors border border-blue-500/30"
                        >
                            <Save className="w-3.5 h-3.5" />
                            설정 저장
                        </button>
                        <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors border border-slate-700 cursor-pointer">
                            <FolderOpen className="w-3.5 h-3.5" />
                            설정 불러오기
                            <input type="file" accept=".json" className="hidden" onChange={handleLoadConfig} />
                        </label>
                    </div>

                    <button
                        onClick={() => {
                            if (confirm('모든 매핑 정보를 초기화하시겠습니까?')) {
                                handleAutoMatch();
                            }
                        }}
                        className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
                    >
                        매핑 초기화
                    </button>
                    <button
                        onClick={() => setView('setup')}
                        className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800 text-sm font-medium"
                    >
                        이전
                    </button>
                    {(() => {
                        const currentSnapshot = generateConfigSnapshot();
                        const isConfigChanged = lastRunConfig !== currentSnapshot;

                        return (
                            <button
                                onClick={handleRunAnalysis}
                                disabled={!pkColumn || !refWorkbook || !compWorkbook}
                                title={(!refWorkbook || !compWorkbook) ? "Raw 파일이 로드되지 않아 분석을 재실행할 수 없습니다. (Resume Mode)" : ""}
                                className={`px-6 py-2 text-white rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg ${isConfigChanged
                                    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                                    } disabled:bg-slate-700`}
                            >
                                {isConfigChanged ? (
                                    <>
                                        <Play className="w-4 h-4 fill-current" />
                                        분석 실행
                                    </>
                                ) : (
                                    <>
                                        <LayoutTemplate className="w-4 h-4" />
                                        분석화면
                                    </>
                                )}
                            </button>
                        );
                    })()}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                <div className="lg:col-span-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar pb-10">
                        {/* File Path Configuration */}
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
                            <h2 className="text-sm font-bold text-slate-300 mb-2.5 flex items-center gap-2 uppercase tracking-wider">
                                <FolderOpen className="w-4 h-4 text-amber-400" />
                                파일 경로 설정
                            </h2>
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-medium text-slate-500 uppercase">기준 파일 (Reference)</label>
                                    <input
                                        type="text"
                                        placeholder="기준 파일 절대 경로"
                                        value={localRefPath}
                                        onChange={(e) => {
                                            setLocalRefPath(e.target.value);
                                            updateFilePaths(e.target.value, compFilePath);
                                        }}
                                        className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none font-mono transition-colors"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-medium text-slate-500 uppercase">비교 파일 (Compare)</label>
                                    <input
                                        type="text"
                                        placeholder="비교 파일 절대 경로"
                                        value={localCompPath}
                                        onChange={(e) => {
                                            setLocalCompPath(e.target.value);
                                            updateFilePaths(refFilePath, e.target.value);
                                        }}
                                        className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none font-mono transition-colors"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Sheet Selection Panel */}
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
                            <h2 className="text-[13px] font-bold text-slate-300 mb-2.5 flex items-center gap-2 uppercase tracking-wider">
                                <FileSpreadsheet className="w-5 h-5 text-green-400" />
                                시트 및 헤더 설정
                            </h2>

                            <div className="space-y-4">
                                <div className="p-2.5 bg-slate-950/30 rounded-lg border border-slate-800/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-tight">기준 파일 시트</label>
                                        <button
                                            onClick={() => handleHeaderToggle('ref')}
                                            disabled={isParsing}
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${refHasHeader ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                        >
                                            HEADER: {refHasHeader ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none mb-2"
                                        value={refSheetIdx}
                                        onChange={(e) => setSheetIndices(Number(e.target.value), compSheetIdx)}
                                    >
                                        {refWorkbook ? refWorkbook.sheets.map((s, i) => (
                                            <option key={i} value={i}>{s.name} ({s.rowCount} rows)</option>
                                        )) : <option>Raw File Not Loaded</option>}
                                    </select>
                                    <button
                                        onClick={async () => {
                                            if (!refFile) return;
                                            const data = await getSheetPreview(refFile, refSheetIdx, 15);
                                            setPreviewModal({ isOpen: true, type: 'ref', data });
                                        }}
                                        className="w-full py-1.5 bg-blue-600/5 hover:bg-blue-600/10 text-blue-400/80 rounded border border-blue-500/20 text-[10px] font-bold transition-colors"
                                    >
                                        📋 기준 헤더 행 선택 (현재: {refHeaderRow + 1})
                                    </button>
                                </div>

                                <div className="p-2.5 bg-slate-950/30 rounded-lg border border-slate-800/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-tight">비교 파일 시트</label>
                                        <button
                                            onClick={() => handleHeaderToggle('comp')}
                                            disabled={isParsing}
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${compHasHeader ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                        >
                                            HEADER: {compHasHeader ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none mb-2"
                                        value={compSheetIdx}
                                        onChange={(e) => setSheetIndices(refSheetIdx, Number(e.target.value))}
                                    >
                                        {compWorkbook ? compWorkbook.sheets.map((s, i) => (
                                            <option key={i} value={i}>{s.name} ({s.rowCount} rows)</option>
                                        )) : <option>Raw File Not Loaded</option>}
                                    </select>
                                    <button
                                        onClick={async () => {
                                            if (!compFile) return;
                                            const data = await getSheetPreview(compFile, compSheetIdx, 15);
                                            setPreviewModal({ isOpen: true, type: 'comp', data });
                                        }}
                                        className="w-full py-1.5 bg-blue-600/5 hover:bg-blue-600/10 text-blue-400/80 rounded border border-blue-500/20 text-[10px] font-bold transition-colors"
                                    >
                                        📋 비교 헤더 행 선택 (현재: {compHeaderRow + 1})
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Column Exclusion Panel */}
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[13px] font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                                    <X className="w-4 h-4 text-slate-400" />
                                    열 제외 설정
                                </h2>
                                <div className="flex gap-2">
                                    <select
                                        className="bg-slate-800 border border-slate-700 text-slate-400 rounded-md px-2 py-0.5 text-[10px] focus:outline-none"
                                        onChange={(e) => {
                                            const rule = globalRules.find(r => r.id === Number(e.target.value));
                                            if (rule) handleApplyGlobalRule(rule);
                                        }}
                                        value=""
                                    >
                                        <option value="" disabled>전역 규칙...</option>
                                        {globalRules.filter(r => r.type === 'COL_EXCLUSION').map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleSaveGlobalRule('COL_EXCLUSION', columnExclusion)}
                                        className="px-2 py-0.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded text-[10px] font-bold border border-blue-500/20"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center gap-3 group cursor-pointer p-2 hover:bg-slate-800/50 rounded-lg transition-colors">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="peer hidden"
                                            checked={columnExclusion.excludeUnnamed}
                                            onChange={(e) => setColumnExclusion({ ...columnExclusion, excludeUnnamed: e.target.checked })}
                                        />
                                        <div className="w-8 h-4 bg-slate-800 rounded-full border border-slate-700 peer-checked:bg-blue-600 peer-checked:border-blue-500 transition-all"></div>
                                        <div className="absolute top-1 left-1 w-2 h-2 bg-slate-500 rounded-full peer-checked:left-5 peer-checked:bg-white transition-all"></div>
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">이름 없는 컬럼 제외 (Unnamed)</span>
                                </label>

                                <div className="space-y-2 border-t border-slate-800/50 pt-2.5">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight">제외 패턴</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                                            placeholder="pattern..."
                                            value={newColPattern}
                                            onChange={(e) => setNewColPattern(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addColPattern()}
                                        />
                                        <button onClick={addColPattern} className="p-1 bg-blue-600/20 hover:bg-blue-600/40 rounded border border-blue-500/30 text-blue-400">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1 min-h-[16px]">
                                        {columnExclusion.patterns.map(p => (
                                            <span key={p} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[9px] rounded border border-slate-700 group">
                                                <span className="font-mono">{p}</span>
                                                <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400" onClick={() => removeColPattern(p)} />
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PK Exclusion Panel */}
                        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-[13px] font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                                    <AlertCircle className="w-4 h-4 text-amber-400" />
                                    PK 행 제외 설정
                                </h2>
                                <div className="flex gap-2">
                                    <select
                                        className="bg-slate-800 border border-slate-700 text-slate-400 rounded-md px-2 py-0.5 text-[10px] focus:outline-none"
                                        onChange={(e) => {
                                            const rule = globalRules.find(r => r.id === Number(e.target.value));
                                            if (rule) handleApplyGlobalRule(rule);
                                        }}
                                        value=""
                                    >
                                        <option value="" disabled>전역 규칙...</option>
                                        {globalRules.filter(r => r.type === 'PK_EXCLUSION').map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleSaveGlobalRule('PK_EXCLUSION', pkExclusion)}
                                        className="px-2 py-0.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded text-[10px] font-bold border border-blue-500/20"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center gap-2 group cursor-pointer p-2 bg-slate-950/20 hover:bg-slate-800/40 rounded-lg transition-colors border border-slate-800/40">
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
                                            checked={pkExclusion.excludeStartAlpha}
                                            onChange={(e) => setPKExclusion({ ...pkExclusion, excludeStartAlpha: e.target.checked })}
                                        />
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">ALPHABET</span>
                                    </label>
                                    <label className="flex items-center gap-2 group cursor-pointer p-2 bg-slate-950/20 hover:bg-slate-800/40 rounded-lg transition-colors border border-slate-800/40">
                                        <input
                                            type="checkbox"
                                            className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                                            checked={pkExclusion.excludeEmpty}
                                            onChange={(e) => setPKExclusion({ ...pkExclusion, excludeEmpty: e.target.checked })}
                                        />
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">EMPTY</span>
                                    </label>
                                </div>

                                <div className="space-y-2 border-t border-slate-800/50 pt-2.5">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight">제외 패턴</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-blue-500 font-mono"
                                            placeholder="pattern..."
                                            value={newPKPattern}
                                            onChange={(e) => setNewPKPattern(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addPKPattern()}
                                        />
                                        <button onClick={addPKPattern} className="p-1 bg-blue-600/20 hover:bg-blue-600/40 rounded border border-blue-500/30 text-blue-400">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1 min-h-[16px]">
                                        {pkExclusion.customPatterns.map(p => (
                                            <span key={p} className="flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[9px] rounded border border-slate-700 group">
                                                <span className="font-mono">{p}</span>
                                                <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-400" onClick={() => removePKPattern(p)} />
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Save Folder (Optional) */}
                        <div className="pt-4 border-t border-slate-800">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">저장 폴더 (선택 사항)</label>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSelectFolder}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                                >
                                    <FolderOpen className="w-4 h-4 text-amber-400" />
                                    {dirHandle ? '저장 폴더 변경' : '저장 폴더 선택'}
                                </button>
                                {dirHandle && (
                                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs overflow-hidden">
                                        <Check className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate font-medium">{dirHandle.name}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">폴더를 선택하면 설정 파일이 해당 위치에 바로 저장됩니다.</p>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 flex flex-col min-h-0">
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col h-full min-h-0">
                        <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/20">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2 tracking-wide uppercase">
                                <Columns className="w-4 h-4 text-blue-400" />
                                열 매핑 (Column Mapping)
                            </h2>
                            <div className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full font-bold border border-slate-700">
                                {filteredMappings.length} COLUMNS
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 custom-scrollbar outline-none" ref={mappingScrollRef} tabIndex={0}>
                            <table className="w-full text-left border-collapse table-fixed">
                                <thead className="sticky top-0 bg-slate-900 z-20 shadow-sm border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">PK</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">SK</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-2/5">기준 (Ref)</th>
                                        <th className="px-3 py-3 w-8"></th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-2/5">비교 (Comp)</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Target</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {(!refWorkbook && mappings.length === 0) ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-20 text-center">
                                                <div className="flex flex-col items-center gap-4 py-10 opacity-50">
                                                    <FileSpreadsheet className="w-12 h-12 text-slate-700" />
                                                    <p className="text-xs text-slate-500 font-medium">시트 데이터를 로드하는 중이거나 파일이 없습니다.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredMappings.map((m) => (
                                        <tr key={m.refColumn} className="hover:bg-blue-600/5 transition-colors group">
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="radio"
                                                    name="pk-select"
                                                    checked={pkColumn === m.refColumn}
                                                    onChange={() => handlePKChange(m.refColumn)}
                                                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="radio"
                                                    name="sk-select"
                                                    checked={skColumn === m.refColumn}
                                                    onChange={() => handleSKChange(m.refColumn)}
                                                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-300 truncate" title={m.refColumn}>
                                                {m.refColumn}
                                            </td>
                                            <td className="px-1 py-3 text-center">
                                                <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    className={`w-full bg-slate-800/50 border ${m.compColumn ? 'border-slate-700 text-slate-200' : 'border-red-500/30 text-red-400'} rounded px-2 py-1 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none`}
                                                    value={m.compColumn}
                                                    onChange={(e) => handleMappingChange(m.refColumn, e.target.value)}
                                                >
                                                    <option value="">(미매칭)</option>
                                                    {/* [Resume Mode] Ensure current value is shown even if columns are missing */}
                                                    {(!finalFilteredCompColumns.includes(m.compColumn) && m.compColumn) && (
                                                        <option value={m.compColumn}>{m.compColumn} (Saved)</option>
                                                    )}
                                                    {finalFilteredCompColumns.map(col => (
                                                        <option key={col} value={col}>{col}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => toggleTarget(m.refColumn)}
                                                    className={`p-1 rounded transition-colors ${m.isTarget ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-600 hover:text-slate-400'}`}
                                                >
                                                    {m.isTarget ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Save className="w-5 h-5 text-blue-400" />
                                설정 저장
                            </h2>
                            <button onClick={() => setIsSaveModalOpen(false)} className="text-slate-500 hover:text-white">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">설정 파일 이름</label>
                                <input
                                    type="text"
                                    value={saveOptions.name}
                                    onChange={(e) => setSaveOptions({ ...saveOptions, name: e.target.value })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { key: 'includeSheets' as const, label: '시트 선택' },
                                    { key: 'includeColEx' as const, label: '열 제외 규칙' },
                                    { key: 'includePKEx' as const, label: '행 제외 규칙' },
                                    { key: 'includeMappings' as const, label: '매핑 정보' }
                                ].map((opt) => (
                                    <label key={opt.key} className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                                            checked={saveOptions[opt.key]}
                                            onChange={(e) => setSaveOptions({ ...saveOptions, [opt.key]: e.target.checked })}
                                        />
                                        <span className="text-sm text-slate-300 font-medium">{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                            <button
                                onClick={handleSaveConfig}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/40 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Download className="w-5 h-5" />
                                설정 파일 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewModal.isOpen && (
                <SheetPreviewModal
                    isOpen={previewModal.isOpen}
                    onClose={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                    sheetName={previewModal.type === 'ref' ? refSheet?.name || '' : compSheet?.name || ''}
                    headers={[]}
                    previewData={previewModal.data}
                    selectedHeaderRow={previewModal.type === 'ref' ? refHeaderRow : compHeaderRow}
                    onHeaderRowSelect={(rowIdx) => {
                        setHeaderRows(
                            previewModal.type === 'ref' ? rowIdx : refHeaderRow,
                            previewModal.type === 'comp' ? rowIdx : compHeaderRow
                        );
                        reparseSheet(previewModal.type, undefined, rowIdx);
                        setPreviewModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    onConfirm={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}
                />
            )}
        </div>
    );
};
