import React, { useState, useRef } from 'react';
import { AntigravityGrid } from './components/AntigravityGrid';
import { FileUploadPanel } from './components/FileUploadPanel';
import { MappingScreen } from './components/MappingScreen';
import { ReviewColumnSelector } from './components/ReviewColumnSelector';
import { IntegritySummaryPanel } from './components/IntegritySummaryPanel';
import { ConfirmModal } from './components/ConfirmModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useGridStore } from './store/gridStore';
import {
  Settings,
  BarChart3,
  Database,
  Laptop,
  Info,
  AlertCircle,
  X,
  Download,
  Filter,
  GitMerge,
  PlusCircle,
  Printer,
  FileText,
  PieChart,
  LayoutTemplate,
  Columns,
  ChevronDown
} from 'lucide-react';
import { printGrid, printSummaryReport } from './utils/printUtils';

const App: React.FC = () => {
  const {
    view,
    setView,
    rowCount,
    filteredRows,
    rows,
    comparisonSummary,
    error,
    setError,
    // columns, memos, etc. are used by exportResults but projectExport uses state directly
    // However, columns might be used for filtering UI?
    // Let's check usage. 
    // columns IS NOT used in the simplified App.tsx below header (only ReviewColumnSelector uses it internally)
    // Wait, row.exists checks use 'existsMode'.
    existsMode,
    setExistsMode,
    resetAllFilters,
    getReviewChanges,
    applyReviewCompensation,
    exportProject,
    addChecklistItem,
    addUserColumn,
    selectedRowIndex,
    selectedColumnId,
    columns,
    detailedSummary,
    refFileName,
    compFileName,
    mappings
  } = useGridStore();

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isReviewSelectorOpen, setIsReviewSelectorOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const isProcessingPrint = useRef(false);
  const headerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isWindows = (window as any).electron?.isWindows || false;
  const [isHeaderVisible, setIsHeaderVisible] = useState(!isWindows);

  const handleMouseEnterHeader = () => {
    if (!isWindows) return;
    if (headerTimeoutRef.current) clearTimeout(headerTimeoutRef.current);
    setIsHeaderVisible(true);
  };

  const handleMouseLeaveHeader = () => {
    if (!isWindows) return;
    headerTimeoutRef.current = setTimeout(() => {
      setIsHeaderVisible(false);
    }, 1000);
  };

  // Add Row/Column State
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [checklistPK, setChecklistPK] = useState('');
  const [checklistRemarks, setChecklistRemarks] = useState('');
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // Review Compensation State
  const [reviewConfirmState, setReviewConfirmState] = useState<{
    isOpen: boolean;
    step: 'confirm' | 'complete';
    count: number;
    appliedCount: number;
  }>({ isOpen: false, step: 'confirm', count: 0, appliedCount: 0 });

  const handleReviewCompensation = () => {
    const changes = getReviewChanges();
    if (changes.length === 0) {
      alert('적용할 검토 데이터가 없습니다.');
      return;
    }
    setReviewConfirmState({
      isOpen: true,
      step: 'confirm',
      count: changes.length,
      appliedCount: 0
    });
  };

  const confirmReviewCompensation = () => {
    const { applied } = applyReviewCompensation();
    setReviewConfirmState(prev => ({
      ...prev,
      step: 'complete',
      appliedCount: applied
    }));
  };

  const handleAddRowOrColumn = () => {
    // If a column is selected but NO row is selected, assume Column addition
    // If a row is selected (even if a column is too), assume Row addition (common Excel pattern)
    // If nothing is selected, default to Row addition
    if (selectedColumnId && selectedRowIndex === null) {
      setNewColumnTitle('');
      setIsAddColumnOpen(true);
    } else {
      setChecklistPK('');
      setChecklistRemarks('');
      setIsAddRowOpen(true);
    }
  };

  const submitRow = () => {
    if (!checklistPK.trim()) {
      alert('PK(예: TAG NO)를 입력해주세요.');
      return;
    }
    addChecklistItem(checklistPK, checklistRemarks);
    setIsAddRowOpen(false);
  };

  const submitColumn = () => {
    if (!newColumnTitle.trim()) {
      alert('열 이름을 입력해주세요.');
      return;
    }
    addUserColumn(newColumnTitle, selectedColumnId || undefined);
    setIsAddColumnOpen(false);
  };

  const closeReviewModal = () => {
    setReviewConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  const handleExport = async () => {
    if (rows.length === 0) {
      setError('내보낼 데이터가 없습니다.');
      return;
    }

    try {
      setIsExporting(true);
      await exportProject();
      // The store action handles everything including config embedding
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '파일 내보내기에 실패했습니다.';
      setError(errorMsg);
      console.error('[App] Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async (mode: 'print' | 'pdf') => {
    if (rowCount === 0 || isProcessingPrint.current) return;

    try {
      isProcessingPrint.current = true;
      if (mode === 'print') setIsPrinting(true);
      else setIsPdfExporting(true);

      if (view === 'summary' && detailedSummary) {
        await printSummaryReport(detailedSummary, 'Analysis Integrity Summary', mode);
      } else {
        // Use filteredRows to ensure print matches what user sees
        await printGrid(columns, filteredRows, 'Analysis Data Report', mode);
      }
    } catch (err) {
      console.error(`[App] ${mode} failed:`, err);
    } finally {
      isProcessingPrint.current = false;
      if (mode === 'print') setIsPrinting(false);
      else setIsPdfExporting(false);
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    console.log('[App] Logo clicked - Event propagation stopped');
    // Stop propagation to prevent window click listeners from interfering
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();

    // Check if we are already in setup view to avoid redundant confirms
    if (useGridStore.getState().view === 'setup') {
      console.log('[App] Already in setup view, reloading...');
      window.location.reload();
      return;
    }

    setIsResetModalOpen(true);
  };

  const totalCount = rowCount;
  const filteredCount = filteredRows.length;
  const targetMappingCount = mappings.filter(m => m.isTarget).length;



  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-[60] bg-red-900/80 border border-red-700 rounded-lg p-4 max-w-md backdrop-blur-sm shadow-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-200">오류가 발생했습니다</h3>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-800/50 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-red-300" />
            </button>
          </div>
        </div>
      )}

      {isWindows && (
        <div
          className="header-hit-area"
          onMouseEnter={handleMouseEnterHeader}
        />
      )}

      <header
        onMouseEnter={handleMouseEnterHeader}
        onMouseLeave={handleMouseLeaveHeader}
        className={`h-16 flex items-center justify-between px-6 bg-slate-950 border-b border-slate-800 z-30 shadow-lg ${isWindows ? `header-autohide ${isHeaderVisible ? 'visible' : 'hidden'}` : ''
          }`}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={handleLogoClick}>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
              <Database className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              XL Compare
            </h1>
          </div>
          {(view === 'grid' || view === 'summary') && (
            <>
              <div className="h-6 w-px bg-slate-800" />
              <button
                onClick={async () => {
                  if (confirm('검토(Review) 내용을 원본 엑셀 파일(Local)에 직접 반영하시겠습니까?\n\n※ 화면 내용은 변경되지 않으며, 파일이 직접 수정됩니다.')) {
                    const { updatedCount, details } = await useGridStore.getState().applyAnalysisEngineChanges();

                    const processedDelAdd = details?.ignoredDelAddCount || 0;

                    if (updatedCount > 0 || processedDelAdd > 0) {
                      alert(`작업이 완료되었습니다.\n\n- 업데이트: ${updatedCount}건\n- 삭제/추가 처리: ${processedDelAdd}건`);
                    } else {
                      // Show detailed reason why no updates happened
                      let msg = '반영할 변경 사항이 없습니다.\n\n[상세 정보]\n';
                      if (details) {
                        msg += `- 대상 행을 찾지 못함: ${details.noTargetRowCount}건\n`;
                        msg += `- 기존 값과 동일함: ${details.identicalValueCount}건\n`;
                        msg += `- 검토 내용 없음 (공란): ${details.noReviewDataCount}건\n`;
                      }
                      alert(msg);
                    }
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-full text-xs font-bold text-white border border-blue-500 whitespace-nowrap transition-all shadow-sm active:scale-95"
              >
                <Laptop className="w-4 h-4" />
                <span>원본변경</span>
              </button>

              <button
                onClick={handleExport}
                disabled={rows.length === 0 || isExporting}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95 border whitespace-nowrap group ${rows.length === 0 || isExporting
                  ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                  }`}
              >
                <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                <span>{isExporting ? '내보내는 중...' : '검토완료'}</span>
              </button>

              <button
                onClick={() => handlePrint('print')}
                disabled={filteredRows.length === 0 || isPrinting || isPdfExporting}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95 border whitespace-nowrap ${filteredRows.length === 0 || isPrinting || isPdfExporting
                  ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                  }`}
              >
                <Printer className={`w-4 h-4 ${isPrinting ? 'animate-pulse' : ''}`} />
                <span>{isPrinting ? '준비중...' : '인쇄'}</span>
              </button>

              <button
                onClick={() => handlePrint('pdf')}
                disabled={filteredRows.length === 0 || isPrinting || isPdfExporting}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95 border whitespace-nowrap ${filteredRows.length === 0 || isPrinting || isPdfExporting
                  ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                  }`}
              >
                <FileText className={`w-4 h-4 ${isPdfExporting ? 'animate-bounce' : ''}`} />
                <span>{isPdfExporting ? '저장중...' : 'PDF'}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-6 px-4 py-2 bg-slate-900 rounded-xl border border-slate-800 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 uppercase text-xs font-bold tracking-wider">Total</span>
              <span className="text-blue-400 font-mono font-semibold text-base">{totalCount.toLocaleString()}</span>
            </div>
            <div className="h-5 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-slate-400 uppercase text-xs font-bold tracking-wider">Filtered</span>
              <span className="text-emerald-400 font-mono font-semibold text-base">{filteredCount.toLocaleString()}</span>
            </div>
          </div>

          {(view === 'grid' || view === 'summary') && rows.length > 0 && (
            <div className="flex items-stretch gap-2 ml-2">
              <button
                onClick={() => setIsReviewSelectorOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 min-w-[60px]"
                title="검토 대상 열 선택"
              >
                <div className="flex items-center gap-1.5">
                  <Columns className="w-3.5 h-3.5" />
                  <span>검토열</span>
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </div>
                <span className="text-[10px] opacity-90 font-mono">
                  ({targetMappingCount})
                </span>
              </button>

              <button
                onClick={handleReviewCompensation}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 min-w-[60px]"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>검토보완</span>
              </button>

              <button
                onClick={handleAddRowOrColumn}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 ring-1 ring-white/10 min-w-[60px]"
                title={selectedColumnId && selectedRowIndex === null ? '선택한 위치에 새로운 열 추가' : '선택한 위치에 새로운 행 추가'}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>행/열 추가</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col bg-slate-950">
        {view === 'setup' && (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 overflow-y-auto custom-scrollbar p-0">
            <div className="max-w-6xl w-full text-center py-12 scale-[0.8] origin-center transition-transform duration-500">
              <div className="animate-in fade-in slide-in-from-top-12 duration-1000">
                <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-black uppercase tracking-[0.3em] mb-8 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                  <BarChart3 className="w-5 h-5" />
                  Performance First
                </div>
                <h2 className="text-6xl md:text-7xl font-black text-white mb-6 tracking-tight leading-tight">
                  High-Performance Excel Data <br /> Comparison
                </h2>
                <div className="space-y-1">
                  <p className="text-slate-500 text-xl font-medium tracking-tight">
                    Upload your base and comparison data to begin high-speed matching analysis.
                  </p>
                  <p className="text-slate-500 text-xl font-medium tracking-tight">
                    Process hundreds of thousands of rows instantly in your browser.
                  </p>
                </div>
              </div>
              <div className="mt-16 animate-in fade-in zoom-in-95 duration-1000 delay-300">
                <FileUploadPanel />
              </div>
            </div>
          </div>
        )}


        {(view === 'grid' || view === 'summary' || view === 'mapping') && (
          <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500">
            {/* Integrity Score Header */}
            {comparisonSummary && view !== 'mapping' && (
              <div className="bg-slate-900/70 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex items-center justify-between shadow-sm z-20 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      Integrity Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-white leading-tight">
                        {comparisonSummary.integrityScore.toFixed(1)}%
                      </span>
                      <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 transition-all duration-500"
                          style={{ width: `${comparisonSummary.integrityScore}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-8 w-px bg-slate-800 mx-1" />

                  <div className="flex items-center gap-3">
                    {[
                      { label: 'Total', value: comparisonSummary.total, color: 'text-slate-300' },
                      { label: 'Matched', value: comparisonSummary.perfectMatch, color: 'text-green-400' },
                      { label: 'Diffs', value: comparisonSummary.diffs, color: 'text-yellow-400' },
                      { label: 'Base Only', value: comparisonSummary.onlyRef, color: 'text-orange-400' },
                      { label: 'Comp Only', value: comparisonSummary.onlyComp, color: 'text-blue-400' },
                    ].map(item => (
                      <div key={item.label} className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                        <span className={`text-lg font-mono font-black ${item.color} leading-tight`}>
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                  {/* Filter Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filters</span>
                    <div className="flex items-center bg-slate-950/40 p-1 rounded-lg border border-slate-800/40 gap-0.5">
                      {[
                        { mode: 'All', label: 'All' },
                        { mode: 'Both', label: 'Both' },
                        { mode: 'Diff', label: 'Diff' },
                        { mode: 'Only Ref', label: 'Only Ref' },
                        { mode: 'Only Comp', label: 'Only Comp' }
                      ].map(f => (
                        <button
                          key={f.mode}
                          onClick={() => setExistsMode(f.mode as any)}
                          className={`px-2 py-1 text-[11px] font-bold rounded transition-all ${existsMode === f.mode
                            ? 'bg-slate-700 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={resetAllFilters}
                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-all border border-transparent hover:border-slate-700"
                    title="Reset all column filters"
                  >
                    <Filter className="w-4 h-4" />
                  </button>

                  <div className="h-6 w-px bg-slate-800" />

                  <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl shadow-inner gap-0.5">
                    {/* Settings Button (Moved here, highlighted if active) */}
                    <button
                      onClick={() => setView('mapping')}
                      className="group px-4 py-1.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                    >
                      <Settings className="w-3.5 h-3.5 text-blue-400 group-hover:rotate-90 transition-transform duration-500" />
                      설정
                    </button>

                    {/* Analysis Screen Button (Hidden on Grid) */}
                    {view !== 'grid' && (
                      <button
                        onClick={() => setView('grid')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-1.5
                          text-slate-500 hover:text-slate-300 hover:bg-slate-800`}
                      >
                        <LayoutTemplate className="w-3.5 h-3.5" />
                        분석화면
                      </button>
                    )}

                    {/* Summary Button (Hidden on Summary, added Icon) */}
                    {view !== 'summary' && (
                      <button
                        onClick={() => setView('summary')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all duration-200 flex items-center gap-1.5
                          text-slate-500 hover:text-slate-300 hover:bg-slate-800`}
                      >
                        <PieChart className="w-3.5 h-3.5 text-emerald-400" />
                        요약
                      </button>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
              <div
                className={`flex-1 flex-col overflow-hidden ${view === 'grid' ? 'flex' : 'hidden'}`}
              >
                <ErrorBoundary>
                  <AntigravityGrid />
                </ErrorBoundary>
              </div>

              <div
                className={`flex-1 overflow-auto p-4 ${view === 'summary' ? 'block' : 'hidden'}`}
              >
                <IntegritySummaryPanel />
              </div>

              <div
                className={`flex-1 flex-col overflow-hidden ${view === 'mapping' ? 'flex' : 'hidden'}`}
              >
                <MappingScreen />
              </div>
            </div>
          </div>
        )}



        {isReviewSelectorOpen && (
          <ReviewColumnSelector onClose={() => setIsReviewSelectorOpen(false)} />
        )}

        <ConfirmModal
          isOpen={isResetModalOpen}
          onCancel={() => setIsResetModalOpen(false)}
          onConfirm={() => useGridStore.getState().resetStore()}
          title="초기화 확인"
          message="모든 설정과 분석 정보를 초기화하고 처음으로 돌아갈까요? 현재 작업 중인 내용은 모두 삭제됩니다."
          confirmText="초기화"
        />

        {/* Review Compensation Modal */}
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
        {/* Add Row Modal */}
        {isAddRowOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-emerald-400" />
                  새로운 행 추가
                </h3>
                <button onClick={() => setIsAddRowOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  선택한 행 위치에 새로운 확인사항 행을 삽입합니다.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">PK (TAG NO 등)</label>
                  <input
                    autoFocus
                    type="text"
                    value={checklistPK}
                    onChange={(e) => setChecklistPK(e.target.value)}
                    placeholder="식별 값을 입력하세요"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">확인(검토) 내용</label>
                  <textarea
                    value={checklistRemarks}
                    onChange={(e) => setChecklistRemarks(e.target.value)}
                    placeholder="검토 의견을 입력하세요"
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all resize-none"
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-3">
                <button onClick={() => setIsAddRowOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400">취소</button>
                <button onClick={submitRow} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all">행 추가</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Column Modal */}
        {isAddColumnOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-blue-400" />
                  새로운 열 추가
                </h3>
                <button onClick={() => setIsAddColumnOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                  선택한 열 오른쪽에 새로운 관리 항목(열)을 추가합니다.
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">열 이름 (Title)</label>
                  <input
                    autoFocus
                    type="text"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="예: 조치사항, 담당자, 비고 등"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-3">
                <button onClick={() => setIsAddColumnOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-400">취소</button>
                <button onClick={submitColumn} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all">열 추가</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="h-8 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-6 text-xs text-slate-500 font-medium">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            <span className="font-bold">
              {refFileName ? `${refFileName} ↔ ${compFileName}` : 'No Project Loaded'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Keys: Standard PK • Standard SK • Exists (Frozen)</span>
          </div>
        </div>
        <div className="opacity-70">
          Tip: Click column headers to filter and sort data
        </div>
      </footer>
    </div>
  );
};

export default App;
