import React from 'react';
import { useGridStore } from '../store/gridStore';
import { LayoutDashboard, AlertCircle, CheckCircle2, Minus, File, Files, Check, AlertTriangle, GitCompareArrows, Search } from 'lucide-react';

const PanelHeader = () => (
    <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/40 backdrop-blur-md rounded-t-2xl">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg shadow-blue-900/20">
                <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
                <h2 className="text-2xl font-black text-slate-100 tracking-tight flex items-center gap-2 uppercase">
                    데이터 분석 요약
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">METRICS</span>
                </h2>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-wide">Data Integrity Analysis Result</p>
            </div>
        </div>

    </div>
);

const MetricCell = ({ value, icon, className = '' }: { value: React.ReactNode; icon?: React.ReactNode; className?: string }) => (
    <td className={`px-4 py-4 text-sm text-center font-mono text-slate-400 border-r border-white/5 ${className}`}>
        <div className="flex items-center justify-center gap-2">
            {icon}
            {value}
        </div>
    </td>
);

const StatusIndicator = ({ status }: { status: string | null }) => {
    if (status) {
        return (
            <span className="inline-flex items-center gap-1.5 font-bold text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                {status}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
            <Check className="w-4 h-4" />
            일치 (MATCH)
        </span>
    );
};

export const IntegritySummaryPanel: React.FC = () => {
    const { detailedSummary } = useGridStore();

    if (!detailedSummary || detailedSummary.length === 0) return null;

    const headers = [
        { name: '분석 대상 (Column)', icon: <Search className="w-4 h-4 text-blue-400" /> },
        { name: '기준 데이터', icon: <File className="w-4 h-4 text-slate-500" /> },
        { name: '비교 데이터', icon: <Files className="w-4 h-4 text-slate-500" /> },
        { name: '일치 행', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
        { name: '불일치 행', icon: <AlertCircle className="w-4 h-4 text-rose-400" /> },
        { name: '기준 단독', icon: <Minus className="w-4 h-4 text-orange-400" /> },
        { name: '비교 단독', icon: <Minus className="w-4 h-4 text-blue-400" /> },
        { name: '상태', icon: <GitCompareArrows className="w-4 h-4 text-slate-400" /> },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
            <PanelHeader />

            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                <div className="inline-block min-w-full align-middle rounded-2xl overflow-hidden border border-white/5 bg-slate-900/20 backdrop-blur-sm">
                    <table className="min-w-full table-fixed border-collapse">
                        <thead className="bg-slate-900/60">
                            <tr>
                                {headers.map((header) => (
                                    <th
                                        key={header.name}
                                        className="px-4 py-3 text-center text-[11px] font-black text-slate-500 uppercase tracking-widest border-r last:border-r-0 border-white/5"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {header.icon}
                                            {header.name}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {detailedSummary.map((row, idx) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 text-sm font-black text-slate-200 bg-white/5 border-r border-white/5 truncate max-w-[200px]" title={row.columnName}>
                                        {row.columnName}
                                    </td>
                                    <MetricCell value={row.refRowCount.toLocaleString()} />
                                    <MetricCell value={row.compRowCount.toLocaleString()} />
                                    <MetricCell value={row.sameCount.toLocaleString()} className="font-bold text-blue-400" />
                                    <MetricCell
                                        value={row.diffCount > 0 ? row.diffCount.toLocaleString() : <Minus className="w-3 h-3 text-slate-700" />}
                                        className="font-bold text-rose-400"
                                    />
                                    <MetricCell
                                        value={row.onlyRefCount > 0 ? row.onlyRefCount.toLocaleString() : <Minus className="w-3 h-3 text-slate-700" />}
                                        className="font-bold text-orange-400"
                                    />
                                    <MetricCell
                                        value={row.onlyCompCount > 0 ? row.onlyCompCount.toLocaleString() : <Minus className="w-3 h-3 text-slate-700" />}
                                        className="font-bold text-blue-400"
                                    />
                                    <td className="px-4 py-4 text-xs text-center border-r last:border-r-0 border-white/5">
                                        <StatusIndicator status={row.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="p-4 border-t border-white/5 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Real-time integrity analysis active
                    </span>
                </div>
                <div className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                    Based on Primary Key (PK) Matching
                </div>
            </div>
        </div>
    );
};
