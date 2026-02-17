/**
 * [B1.0 Standard] Comparison Engine
 * Ported from Python's AnalysisThread
 * 
 * Implements the 4-principle matching algorithm:
 * 1. PK Match (Primary Key exact match)
 * 2. SK Match (Secondary Key match when PK differs)
 * 3. Only Ref (exists only in reference file)
 * 4. Only Comp (exists only in comparison file)
 */

import { normalizeKey, getIntegratedKey } from './keyManager';

export type ExistsStatus = 'Both' | 'Only Ref' | 'Only Comp' | 'Both(M)';

/**
 * Helper to check if two values match using B1.0 smart comparison rules:
 * 1. Case-insensitive string comparison
 * 2. Numeric equality (1 vs 1.0)
 * 3. Collapsed spaces and control character removal
 */
export function isValuesMatch(v1: unknown, v2: unknown): boolean {
    const s1 = normalizeKey(v1);
    const s2 = normalizeKey(v2);

    // Exact match after normalization
    if (s1.toLowerCase() === s2.toLowerCase()) return true;

    // Numeric match
    if (s1 !== '' && s2 !== '') {
        const n1 = Number(s1.replace(/,/g, ''));
        const n2 = Number(s2.replace(/,/g, ''));
        if (!isNaN(n1) && !isNaN(n2) && n1 === n2) return true;
    }

    return false;
}

export interface MappingInfo {
    refColumn: string;
    compColumn: string;
    isTarget: boolean; // Include in result
    isPK: boolean;
    isSK: boolean;
}

export interface ComparisonResult {
    integratedKey: string;
    exists: ExistsStatus;
    [key: string]: unknown;
}

export interface ColumnExclusionConfig {
    excludeUnnamed: boolean;
    patterns: string[];
}

export interface PKExclusionConfig {
    excludeStartAlpha: boolean;
    excludeEmpty: boolean;
    customPatterns: string[];
}

export interface ComparisonConfig {
    pkColumn: string;
    skColumn?: string;
    mappings: MappingInfo[];
    exclusionRules?: string[]; // Deprecated or kept for backward compatibility
    pkExclusion?: PKExclusionConfig;
    columnExclusion?: ColumnExclusionConfig;
}

/**
 * [B1.0] Apply PK filtering and exclusion rules
 */
function applyExclusionRules(
    data: Record<string, unknown>[],
    pkColumn: string,
    useB1Filter: boolean,
    pkExclusion?: PKExclusionConfig,
    oldExclusionRules?: string[]
): Record<string, unknown>[] {
    return data.filter((row) => {
        const rawValue = row[pkColumn];
        const pkValue = normalizeKey(rawValue);

        // 1. [Enhanced] Empty Check
        if (pkExclusion?.excludeEmpty && (!rawValue || String(rawValue).trim() === '')) {
            return false;
        }

        if (!pkValue) return false;

        // 2. [Standard] B1.0 prefix check
        if (useB1Filter && !pkValue.startsWith('0-')) {
            return false;
        }

        // 3. [Enhanced] Start with Alpha check
        if (pkExclusion?.excludeStartAlpha && /^[a-zA-Z]/.test(pkValue)) {
            return false;
        }

        // 4. [Enhanced] Custom Patterns (Regex or String inclusion)
        const patterns = pkExclusion?.customPatterns || oldExclusionRules || [];
        if (patterns.length > 0) {
            const upperPK = pkValue.toUpperCase();
            const isExcluded = patterns.some((pattern) => {
                const trimmed = pattern.trim();
                if (!trimmed) return false;

                // Try Regex first if it looks like one (starts and ends with /)
                if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
                    try {
                        const regex = new RegExp(trimmed.slice(1, -1), 'i');
                        return regex.test(pkValue);
                    } catch {
                        // Fallback to string match if regex invalid
                    }
                }

                // Default: Simple string inclusion (case-insensitive)
                return upperPK.includes(trimmed.toUpperCase());
            });
            if (isExcluded) return false;
        }

        return true;
    });
}

/**
 * Filter mappings based on exclusion config
 */
export function filterMappings(mappings: MappingInfo[], config?: ColumnExclusionConfig): MappingInfo[] {
    if (!config) return mappings;
    const { excludeUnnamed, patterns } = config;

    return mappings.filter((m) => {
        const colName = m.refColumn;
        // Always keep PK/SK unless explicitly told otherwise, but usually they are required
        if (m.isPK || m.isSK) return true;

        if (excludeUnnamed) {
            const lower = colName.toLowerCase();
            // Match "unnamed: n" or "column n" (Excel/Pandas defaults)
            const isUnnamedGarbage = lower.startsWith('unnamed') || /^column\s*\d+$/i.test(lower);
            if (isUnnamedGarbage) return false;
        }

        if (patterns && patterns.length > 0) {
            return !patterns.some((p) => {
                const trimmed = p.trim();
                if (!trimmed) return false;

                // Regex support
                if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
                    try {
                        const regex = new RegExp(trimmed.slice(1, -1), 'i');
                        return regex.test(colName);
                    } catch {
                        // Fallback to string match
                    }
                }

                // Default: Simple string inclusion (case-insensitive)
                return colName.toLowerCase().includes(trimmed.toLowerCase());
            });
        }

        return true;
    });
}

/**
 * Helper to get value from row handling common Excel header whitespace/newline issues
 */
function getFuzzyValue(row: Record<string, unknown> | null, colName: string): unknown {
    if (!row) return undefined;
    if (row[colName] !== undefined) return row[colName];

    // [Fix] Aggressive normalization: remove ALL non-alphanumeric/Korean characters to match complex headers
    // e.g. "Status(1/TRUE)" vs "Status_ (1/TRUE)" or "TAG NO" vs "TAG_NO"
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '');
    const target = normalize(colName);

    const foundKey = Object.keys(row).find(k => normalize(k) === target);
    return foundKey ? row[foundKey] : undefined;
}

/**
 * [Helper] Get value with fallback to Review column (for re-analysis support)
 * If main column is empty, check for '_검토' suffix column.
 */
function getValueWithFallback(row: Record<string, unknown> | null, col: string): string {
    const main = normalizeKey(getFuzzyValue(row, col));
    if (main) return main;

    // Fallback: Check for Review/Compensation column (e.g. "TAG NO_기준" -> "TAG NO_기준검토")
    // This supports "Added" items from previous rounds
    if (col.endsWith('_기준')) {
        return normalizeKey(getFuzzyValue(row, col + '검토'));
    }
    if (col.endsWith('_비교')) {
        return normalizeKey(getFuzzyValue(row, col + '검토'));
    }
    return '';
}

/**
 * Main comparison function
 */
export function compareDatasets(
    refData: Record<string, unknown>[],
    compData: Record<string, unknown>[],
    config: ComparisonConfig,
    useB1Filter: boolean = false
): ComparisonResult[] {
    const { pkColumn, skColumn, mappings, pkExclusion, columnExclusion, exclusionRules } = config;

    // 1. Combine system filters (exclusion patterns) and user filters (isTarget flag)
    // Note: PK and SK must ALWAYS be in effectiveMappings for the logic below to work.
    const baseMappings = mappings.filter((m) => m.isTarget || m.isPK || m.isSK);
    const effectiveMappings = filterMappings(baseMappings, columnExclusion);

    // Find corresponding comp PK column
    const pkMapping = mappings.find((m) => m.isPK);
    const compPKColumn = pkMapping?.compColumn || pkColumn;

    const skMapping = mappings.find((m) => m.isSK);
    const compSKColumn = skMapping?.compColumn;

    // 2. Apply filtering and PK exclusion rules
    const filteredRef = applyExclusionRules(refData, pkColumn, useB1Filter, pkExclusion, exclusionRules);
    const filteredComp = applyExclusionRules(compData, compPKColumn, useB1Filter, pkExclusion, exclusionRules);

    // Track matched rows
    const refMatched = new Set<number>();
    const compMatched = new Set<number>();
    const results: ComparisonResult[] = [];

    // Pass effectiveMappings to createResultRow
    const createRow = (ref: Record<string, unknown> | null, comp: Record<string, unknown> | null, status: ExistsStatus) =>
        createResultRow(ref, comp, status, { ...config, mappings: effectiveMappings });

    // === [Principle 1] PK Match ===
    filteredRef.forEach((refRow, refIdx) => {
        const refPKRaw = getValueWithFallback(refRow, pkColumn);
        if (!refPKRaw) return;
        const refPK = refPKRaw.split('::')[0]; // [B1.0 Standard] Compare only PK part

        const compIdx = filteredComp.findIndex((compRow, idx) => {
            if (compMatched.has(idx)) return false;
            const compPKRaw = getValueWithFallback(compRow, compPKColumn);
            return compPKRaw.split('::')[0] === refPK;
        });

        if (compIdx !== -1) {
            const compRow = filteredComp[compIdx];
            results.push(createRow(refRow, compRow, 'Both'));
            refMatched.add(refIdx);
            compMatched.add(compIdx);
        }
    });

    // === [Principle 2] SK Match (if PK not matched) ===
    if (skColumn && compSKColumn) {
        filteredRef.forEach((refRow, refIdx) => {
            if (refMatched.has(refIdx)) return;

            const refSK = getValueWithFallback(refRow, skColumn);
            if (!refSK) return;

            const compIdx = filteredComp.findIndex((compRow, idx) => {
                if (compMatched.has(idx)) return false;
                return getValueWithFallback(compRow, compSKColumn) === refSK;
            });

            if (compIdx !== -1) {
                const compRow = filteredComp[compIdx];
                results.push(createRow(refRow, compRow, 'Both'));
                // [New] Set SK Match flag on the last added result
                const lastResult = results[results.length - 1];
                if (lastResult) {
                    (lastResult as any).skMatch = true;
                }
                refMatched.add(refIdx);
                compMatched.add(compIdx);
            }
        });
    }

    // === [Principle 3] Only Ref ===
    filteredRef.forEach((refRow, refIdx) => {
        if (!refMatched.has(refIdx)) {
            results.push(createRow(refRow, null, 'Only Ref'));
        }
    });

    // === [Principle 4] Only Comp ===
    filteredComp.forEach((compRow, compIdx) => {
        if (!compMatched.has(compIdx)) {
            results.push(createRow(null, compRow, 'Only Comp'));
        }
    });

    return results;
}

/**
 * Create a result row with proper column naming
 */
function createResultRow(
    refRow: Record<string, unknown> | null,
    compRow: Record<string, unknown> | null,
    status: ExistsStatus,
    config: ComparisonConfig
): ComparisonResult {
    const { pkColumn, mappings } = config;
    const pkMapping = mappings.find((m) => m.isPK);
    const compPKColumn = pkMapping?.compColumn || pkColumn;

    // [Fix] Resolve Effective PKs including Review Data Fallback
    const refPK = refRow ? normalizeKey(refRow[pkColumn]) : '';
    let effectiveRefPK = refPK;
    let refReviewPK = '';

    if (refRow) {
        const rawReview = getFuzzyValue(refRow, pkColumn + '검토');
        if (rawReview) refReviewPK = normalizeKey(rawReview);
        if (!effectiveRefPK && refReviewPK) effectiveRefPK = refReviewPK;
    }

    const compPK = compRow ? normalizeKey(compRow[compPKColumn]) : '';
    let effectiveCompPK = compPK;
    let compReviewPK = '';

    if (compRow) {
        const rawReview = getFuzzyValue(compRow, compPKColumn + '검토');
        if (rawReview) compReviewPK = normalizeKey(rawReview);
        if (!effectiveCompPK && compReviewPK) effectiveCompPK = compReviewPK;
    }

    // Create integrated key using EFFECTIVE PKs
    const integratedKey = getIntegratedKey(effectiveRefPK, effectiveCompPK, status);

    const result: ComparisonResult = {
        integratedKey,
        exists: status,
        standardPK: effectiveRefPK || effectiveCompPK,
        standardSK: '',
    };

    const skMapping = mappings.find((m) => m.isSK);

    // 4. Add PK columns with review data support
    result[`${pkColumn}_기준`] = refPK;
    result[`${pkColumn}_기준검토`] = refReviewPK;
    result[`${pkColumn}_비교`] = compPK;
    result[`${pkColumn}_비교검토`] = compReviewPK;

    // [New] PK Diff check
    if (status === 'Both' && !isValuesMatch(effectiveRefPK, effectiveCompPK)) {
        result[`${pkColumn}_diff`] = true;
    }

    // 5. Add SK columns
    if (skMapping) {
        const refSK = refRow ? normalizeKey(refRow[skMapping.refColumn]) : '';
        const refReviewSK = refRow ? normalizeKey(getFuzzyValue(refRow, skMapping.refColumn + '검토')) : '';

        const compSK = compRow ? normalizeKey(compRow[skMapping.compColumn]) : '';
        const compReviewSK = compRow ? normalizeKey(getFuzzyValue(compRow, skMapping.compColumn + '검토')) : '';

        // Effective SK for display (Standard SK logic)
        const effectiveRefSK = refSK || refReviewSK;
        const effectiveCompSK = compSK || compReviewSK;

        result[`${skMapping.refColumn}_기준`] = refSK;
        result[`${skMapping.refColumn}_기준검토`] = refReviewSK;
        result[`${skMapping.refColumn}_비교`] = compSK;
        result[`${skMapping.refColumn}_비교검토`] = compReviewSK;
        result.standardSK = effectiveRefSK;

        // [New] SK Diff check
        if (status === 'Both' && !isValuesMatch(effectiveRefSK, effectiveCompSK)) {
            result[`${skMapping.refColumn}_diff`] = true;
        }
    }

    // 6. Add all mapped columns (Process ALL to allow visibility toggling without re-analysis)
    mappings
        .filter((m) => !m.isPK && !m.isSK)
        .forEach((m) => {
            const refVal = normalizeKey(getFuzzyValue(refRow, m.refColumn));
            const refReviewVal = refRow ? normalizeKey(getFuzzyValue(refRow, m.refColumn + '검토')) : '';

            const compVal = normalizeKey(getFuzzyValue(compRow, m.compColumn));
            const compReviewVal = compRow ? normalizeKey(getFuzzyValue(compRow, m.compColumn + '검토')) : '';

            result[`${m.refColumn}_기준`] = refVal;
            result[`${m.refColumn}_기준검토`] = refReviewVal;
            result[`${m.refColumn}_비교`] = compVal;
            result[`${m.refColumn}_비교검토`] = compReviewVal;

            // Highlight differences using effective values (Base or Review)
            const effectiveRefVal = refVal || refReviewVal;
            const effectiveCompVal = compVal || compReviewVal;

            if (status === 'Both' && !isValuesMatch(effectiveRefVal, effectiveCompVal)) {
                result[`${m.refColumn}_diff`] = true;
            }
        });

    return result;
}

/**
 * Get comparison statistics
 */
export function getComparisonStats(results: ComparisonResult[]): {
    total: number;
    both: number;
    onlyRef: number;
    onlyComp: number;
    matchRate: number;
} {
    const both = results.filter((r) => r.exists === 'Both').length;
    const onlyRef = results.filter((r) => r.exists === 'Only Ref').length;
    const onlyComp = results.filter((r) => r.exists === 'Only Comp').length;
    const total = results.length;

    return {
        total,
        both,
        onlyRef,
        onlyComp,
        matchRate: total > 0 ? (both / total) * 100 : 0,
    };
}
