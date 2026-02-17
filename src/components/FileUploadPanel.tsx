import { useState, useCallback, useRef, useEffect } from 'react';
import { parseExcelFile, type ParsedWorkbook } from '../utils/excelParser';
import { useGridStore } from '../store/gridStore';
import {
    Upload,
    FileSpreadsheet,
    ArrowRightLeft,
    CheckCircle2,
    Calendar,
    Clock,
    History,
    FileCode,
    Trash2,
    X
} from 'lucide-react';

interface FileUploadPanelProps {
    onError?: (message: string) => void;
}

type UploadState = 'idle' | 'loading' | 'loaded';

interface RecentProject {
    id: number;
    name: string;
    ref_path: string;
    comp_path: string;
    config_json: string;
    last_modified: string;
}

export function FileUploadPanel({ onError }: FileUploadPanelProps) {
    const {
        setWorkbooks,
        setView,
        updateFilePaths,
        importProjectFromExcel,
        loadProjectFromDb,
        recentProjects,
        clearRecentProjects,
        deleteProject
    } = useGridStore();

    // Original Files
    // Original Files
    const [rawRefFile, setRawRefFile] = useState<File | null>(null);
    const [rawCompFile, setRawCompFile] = useState<File | null>(null);

    // Parsed Workbooks
    const [refWb, setRefWb] = useState<ParsedWorkbook | null>(null);
    const [compWb, setCompWb] = useState<ParsedWorkbook | null>(null);

    const [refState, setRefState] = useState<UploadState>('idle');
    const [compState, setCompState] = useState<UploadState>('idle');

    const refInputRef = useRef<HTMLInputElement>(null);
    const compInputRef = useRef<HTMLInputElement>(null);
    const resumeInputRef = useRef<HTMLInputElement>(null);
    const [isParsing, setIsParsing] = useState(false);

    // File Paths
    // Initialize with empty strings for a clean start
    const [refPath, setRefPath] = useState<string>('');
    const [compPath, setCompPath] = useState<string>('');

    // Recent Projects

    // Clear paths on mount (Clean Slate)
    useEffect(() => {
        setRefPath('');
        setCompPath('');
        updateFilePaths('', '');
    }, [updateFilePaths]);

    // Regular update of store when local paths change (if user types)
    useEffect(() => {
        if (refPath || compPath) {
            updateFilePaths(refPath, compPath);
        }
    }, [refPath, compPath, updateFilePaths]);

    // Fetch Recent Projects & DB Sync
    useEffect(() => {
        const fetchDBData = async () => {
            if (window.electron?.db) {
                try {
                    await Promise.all([
                        useGridStore.getState().loadRecentProjects(),
                        useGridStore.getState().loadMappingIntel(),
                        useGridStore.getState().loadMemos()
                    ]);
                } catch (e) {
                    console.error('Failed to fetch DB data:', e);
                }
            }
        };
        fetchDBData();
    }, []);

    const handleRefPathChange = (val: string) => {
        setRefPath(val);
        if (val && !compPath && rawCompFile) {
            const lastSlash = Math.max(val.lastIndexOf('/'), val.lastIndexOf('\\'));
            if (lastSlash !== -1) {
                const dir = val.substring(0, lastSlash + 1);
                setCompPath(dir + rawCompFile.name);
            }
        }
    };

    const handleCompPathChange = (val: string) => {
        setCompPath(val);
        if (val && !refPath && rawRefFile) {
            const lastSlash = Math.max(val.lastIndexOf('/'), val.lastIndexOf('\\'));
            if (lastSlash !== -1) {
                const dir = val.substring(0, lastSlash + 1);
                setRefPath(dir + rawRefFile.name);
            }
        }
    };

    const handleFileSelect = useCallback(
        async (file: File, type: 'ref' | 'comp') => {
            const setState = type === 'ref' ? setRefState : setCompState;
            const setRaw = type === 'ref' ? setRawRefFile : setRawCompFile;
            const setWb = type === 'ref' ? setRefWb : setCompWb;

            setState('loading');

            try {
                if (!file.name.match(/\.(xlsx|xls)$/i)) {
                    throw new Error('엑셀 파일(.xlsx, .xls)만 지원합니다.');
                }

                const parsed = await parseExcelFile(file);
                let filePath = '';
                if (window.electron?.getPathForFile) {
                    try {
                        filePath = window.electron.getPathForFile(file);
                    } catch (e) {
                        filePath = (file as any).path;
                    }
                } else {
                    filePath = (file as any).path;
                }

                if (filePath && filePath.match(/\.(xlsx|xls)$/i)) {
                    if (type === 'ref') setRefPath(filePath);
                    else setCompPath(filePath);
                }

                setRaw(file);
                setWb(parsed);
                setState('loaded');
            } catch (err) {
                setState('idle');
                onError?.(`파일 로드 실패: ${err}`);
            }
        },
        [onError]
    );

    const handleResumeWork = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsing(true);
        try {
            await importProjectFromExcel(file);
        } catch (error) {
            onError?.(error instanceof Error ? error.message : '작업 불러오기 실패');
            setIsParsing(false);
        } finally {
            if (resumeInputRef.current) resumeInputRef.current.value = '';
        }
    };

    const handleRecentProjectClick = async (project: RecentProject) => {
        setIsParsing(true);
        try {
            await loadProjectFromDb(project);
        } catch (error) {
            onError?.(error instanceof Error ? error.message : '최근 분석 로드 실패');
            setIsParsing(false);
        } finally {
            setIsParsing(false);
        }
    };

    useEffect(() => {
        if (refWb && compWb && rawRefFile && rawCompFile && refState === 'loaded' && compState === 'loaded') {
            setWorkbooks(refWb, compWb, rawRefFile, rawCompFile, refPath, compPath);
            const timer = setTimeout(() => setView('mapping'), 800);
            return () => clearTimeout(timer);
        }
    }, [refWb, compWb, rawRefFile, rawCompFile, refPath, compPath, refState, compState, setWorkbooks, setView]);

    const handleDrop = useCallback(
        (e: React.DragEvent, type: 'ref' | 'comp') => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.name.match(/\.(xlsx|xls)$/i)) {
                handleFileSelect(file, type);
            } else {
                onError?.('Excel 파일(.xlsx, .xls)만 지원합니다.');
            }
        },
        [handleFileSelect, onError]
    );

    const renderDropZone = (
        type: 'ref' | 'comp',
        label: string,
        state: UploadState,
        wb: ParsedWorkbook | null,
        inputRef: React.RefObject<HTMLInputElement | null>,
        pathValue: string,
        onPathChange: (val: string) => void
    ) => {
        const isLoading = state === 'loading';
        const isLoaded = state === 'loaded';

        return (
            <div className="flex flex-col gap-4 flex-1">
                <div
                    className={`relative p-8 md:p-10 border-2 border-dashed rounded-[2rem] transition-all cursor-pointer group flex-1 flex flex-col items-center justify-center min-h-[200px] md:min-h-[220px] ${isLoaded
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-slate-800 bg-slate-900/40 hover:border-blue-500/40 hover:bg-blue-500/5'
                        }`}
                    onDrop={(e) => handleDrop(e, type)}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => inputRef.current?.click()}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file, type);
                        }}
                    />

                    <div className="flex flex-col items-center gap-5 text-center">
                        {isLoading ? (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Parsing...</span>
                            </div>
                        ) : isLoaded && wb ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-0.5 shadow-inner">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <span className="text-lg font-black text-emerald-400 line-clamp-1 px-6">{wb.fileName}</span>
                                <span className="text-[12px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                    {wb.sheets[0].rowCount.toLocaleString()} Rows
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-slate-800/40 rounded-2xl flex items-center justify-center group-hover:bg-blue-500/10 group-hover:scale-110 transition-all duration-300">
                                    {type === 'ref' ? (
                                        <FileSpreadsheet className="w-8 h-8 text-slate-400 group-hover:text-blue-400" />
                                    ) : (
                                        <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-400" />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-slate-100 uppercase tracking-wide">{label}</h3>
                                    <p className="text-sm text-slate-500 font-bold opacity-70">드래그 앤 드롭 또는 클릭</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative group mx-2">
                    <input
                        type="text"
                        placeholder="파일 절대 경로 (선택)"
                        className="w-full bg-slate-900/50 border border-slate-800/60 rounded-xl px-4 py-3 text-xs text-slate-400 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-700 font-mono shadow-inner"
                        value={pathValue}
                        onChange={(e) => onPathChange(e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-10 w-full max-w-6xl mx-auto">
            {/* Main Upload Section */}
            <div className="flex items-center gap-6 md:gap-10 w-full animate-in fade-in slide-in-from-bottom-6 duration-1000">
                {renderDropZone('ref', '기준 파일', refState, refWb, refInputRef, refPath, handleRefPathChange)}

                <div className="flex items-center justify-center text-slate-800 pt-6">
                    <ArrowRightLeft className="w-8 h-8 transform hover:scale-110 transition-all duration-300 cursor-pointer" />
                </div>

                {renderDropZone('comp', '비교 파일', compState, compWb, compInputRef, compPath, handleCompPathChange)}
            </div>

            {/* Resume Work Button Section */}
            <div className="flex justify-center -mt-2 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                <label className="flex items-center gap-4 px-10 py-4 bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 rounded-2xl font-black tracking-tight transition-all shadow-xl hover:shadow-blue-500/10 border border-white/5 cursor-pointer group active:scale-[0.98]">
                    {isParsing ? (
                        <div className="w-5 h-5 border-3 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <FileCode className="w-5 h-5 group-hover:text-blue-400 transition-colors" />
                    )}
                    <span className="text-xl">기존 작업 재개 (Load Project)</span>
                    <input
                        ref={resumeInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => handleResumeWork(e)}
                        disabled={isParsing}
                    />
                </label>
            </div>

            {/* Recent Analysis History Section */}
            {recentProjects.length > 0 && (
                <div className="mt-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
                    <div className="flex items-center justify-between gap-3 mb-6 px-4">
                        <div className="flex items-center gap-3">
                            <History className="w-5 h-5 text-blue-500" />
                            <h3 className="text-base font-black text-slate-400 uppercase tracking-[0.2em]">최근 분석 이력 (RECENT ANALYSIS)</h3>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); if (confirm('최근 분석 이력을 모두 초기화하시겠습니까?')) clearRecentProjects(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all uppercase tracking-wider border border-transparent hover:border-red-500/20"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            이력 초기화
                        </button>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar justify-center">
                        {recentProjects.map((project) => (
                            <div
                                key={project.id}
                                onClick={() => handleRecentProjectClick(project)}
                                className={`flex-none w-72 bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 hover:border-blue-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group ${isParsing ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(project.last_modified).toLocaleDateString()}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                                                <Clock className="w-3 h-3" />
                                                {new Date(project.last_modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`'${project.name}' 이력을 삭제하시겠습니까?`)) {
                                                deleteProject(project.id);
                                            }
                                        }}
                                        className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                        title="항목 삭제"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <h4 className="text-base font-black text-slate-200 mb-4 line-clamp-1 group-hover:text-blue-400 transition-colors">
                                    {project.name}
                                </h4>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[9px] font-black text-slate-500 uppercase">Ref</div>
                                        <div className="text-[11px] text-slate-500 truncate font-mono">{project.ref_path}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[9px] font-black text-slate-500 uppercase">Comp</div>
                                        <div className="text-[11px] text-slate-500 truncate font-mono">{project.comp_path}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
