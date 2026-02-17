/**
 * Key management utilities for data comparison
 */

/**
 * Normalize a key value for comparison
 * Handles null, undefined, numbers, and strings
 */
export function normalizeKey(value: unknown): string {
    if (value === null || value === undefined) return '';

    const str = String(value).trim();

    // Remove control characters and normalize whitespace
    return str
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate an integrated key from reference and comparison keys
 * Standard Concept: Prioritize Reference Side PK. 
 * Use Comparison PK only if Reference side does not exist (Only Comp).
 */
export function getIntegratedKey(
    refKey: string,
    compKey: string,
    _status: 'Both' | 'Only Ref' | 'Only Comp' | 'Both(M)'
): string {
    const normalizedRef = normalizeKey(refKey);
    const normalizedComp = normalizeKey(compKey);

    // Standard Concept: Reference Priority
    // If a reference key exists (Both or Only Ref), use it as the unified identifier.
    // Use comparison key only for 'Only Comparison' rows.
    return normalizedRef || normalizedComp || 'UNKNOWN';
}

/**
 * Extract reference key from integrated key
 */
export function getRefKeyFromIntegrated(integratedKey: string): string {
    if (integratedKey.includes('::')) {
        return integratedKey.split('::')[0];
    }
    return integratedKey;
}

/**
 * Extract comparison key from integrated key
 */
export function getCompKeyFromIntegrated(integratedKey: string): string {
    if (integratedKey.includes('::')) {
        const parts = integratedKey.split('::');
        return parts[1] || '';
    }
    return integratedKey;
}

/**
 * Check if integrated key represents a merged row
 */
export function isMergedKey(integratedKey: string): boolean {
    return integratedKey.includes('::');
}

/**
 * Generate a unique key for manually added rows
 */
let checkCounter = 0;
export function generateCheckKey(): string {
    checkCounter++;
    return `CHECK-${Date.now()}-${checkCounter}`;
}

/**
 * Reset the check counter (useful for testing)
 */
export function resetCheckCounter(): void {
    checkCounter = 0;
}
