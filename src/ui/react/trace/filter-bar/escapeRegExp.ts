/**
 * Escape regex metacharacters so user text matches as a literal substring inside a `$regex` filter.
 *
 * Why: the @andymitchell/objects where-filter DSL has no literal-substring operator — `$regex` is the
 * only string-substring mechanism. Raw user text both (a) changes semantics (`.`/`*`/`(` become
 * metacharacters) and (b) makes matchJavascriptObject THROW on invalid patterns (e.g. a lone `(`).
 * Escaping restores the pre-migration `contains`/`indexOf` behavior and guarantees a valid pattern.
 *
 * @example
 * escapeRegExp('a.b(c)'); // 'a\\.b\\(c\\)' → matches the literal string 'a.b(c)'
 */
export const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a literal-substring `$regex` value-comparison from raw search-box text.
 *
 * Why: single source of truth for turning user text into a safe where-filter value.
 * Case-sensitive by default (matches pre-migration behavior); pass `caseInsensitive` to opt in.
 *
 * @example
 * literalContains('a.b');                            // { $regex: 'a\\.b' }
 * literalContains('a.b', { caseInsensitive: true }); // { $regex: 'a\\.b', $options: 'i' }
 */
export const literalContains = (
    value: string,
    opts?: { caseInsensitive?: boolean }
): { $regex: string; $options?: string } =>
    opts?.caseInsensitive
        ? { $regex: escapeRegExp(value), $options: 'i' }
        : { $regex: escapeRegExp(value) };
