/**
 * Text utility functions for string manipulation and normalization
 */

/**
 * Normalize text for comparison by removing whitespace and converting to lowercase
 */
export function normalizeForComparison(text: string | number | boolean | null | undefined): string {
    if (text === null || text === undefined) return '';
    return String(text).trim().toLowerCase();
}

/**
 * Remove all whitespace from text
 */
export function removeWhitespace(text: string): string {
    return text.replace(/\s+/g, '');
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Check if two values are equal after normalization
 */
export function isEqual(a: any, b: any): boolean {
    return normalizeForComparison(a) === normalizeForComparison(b);
}

/**
 * Convert text to title case
 */
export function toTitleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

/**
 * Escape special characters for use in regex
 */
export function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text contains Korean characters
 */
export function hasKorean(text: string): boolean {
    return /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
}

/**
 * Extract numbers from text
 */
export function extractNumbers(text: string): number[] {
    const matches = text.match(/\d+(\.\d+)?/g);
    return matches ? matches.map(Number) : [];
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Check if string is empty or only whitespace
 */
export function isEmpty(text: string | null | undefined): boolean {
    return !text || text.trim().length === 0;
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(text: string): string {
    return text.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(text: string): string {
    return text.replace(/-([a-z])/g, (g) => g[1]!.toUpperCase());
}

/**
 * Find best matching string from a list of candidates
 * @param target Target string to match
 * @param candidates List of candidate strings
 * @param threshold Minimum similarity threshold (0-1)
 * @returns Best match or empty string if no match above threshold
 */
export function findBestMatch(target: string, candidates: string[], threshold: number = 0.6): string {
    if (!target || candidates.length === 0) return '';

    const normalizedTarget = normalizeForComparison(target);
    let bestMatch = '';
    let bestScore = 0;

    for (const candidate of candidates) {
        const normalizedCandidate = normalizeForComparison(candidate);

        // Exact match
        if (normalizedTarget === normalizedCandidate) {
            return candidate;
        }

        // Calculate similarity score (simple approach)
        const score = calculateSimilarity(normalizedTarget, normalizedCandidate);

        if (score > bestScore && score >= threshold) {
            bestScore = score;
            bestMatch = candidate;
        }
    }

    return bestMatch;
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Simple Jaccard similarity based on character sets
    const set1 = new Set(str1.toLowerCase());
    const set2 = new Set(str2.toLowerCase());

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
}
