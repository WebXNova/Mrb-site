/**
 * Canonical student question presentation.
 *
 * display_mode is the only product setting:
 *   all           → every question on one scrollable exam page
 *   one_per_page  → one question visible at a time
 *
 * layout_mode (vertical / horizontal) is a compatibility mirror only.
 * It must never control answer-option arrangement.
 */

export const TEST_DISPLAY_ALL = 'all';
export const TEST_DISPLAY_ONE_PER_PAGE = 'one_per_page';
export const TEST_LAYOUT_VERTICAL = 'vertical';
export const TEST_LAYOUT_HORIZONTAL = 'horizontal';

export function canonicalizeDisplayMode(value) {
  return value === TEST_DISPLAY_ONE_PER_PAGE ? TEST_DISPLAY_ONE_PER_PAGE : TEST_DISPLAY_ALL;
}

export function canonicalizeLayoutMode(value) {
  return value === TEST_LAYOUT_HORIZONTAL ? TEST_LAYOUT_HORIZONTAL : TEST_LAYOUT_VERTICAL;
}

export function displayModeFromLayout(layoutMode) {
  return canonicalizeLayoutMode(layoutMode) === TEST_LAYOUT_HORIZONTAL
    ? TEST_DISPLAY_ONE_PER_PAGE
    : TEST_DISPLAY_ALL;
}

export function layoutModeFromDisplay(displayMode) {
  return canonicalizeDisplayMode(displayMode) === TEST_DISPLAY_ONE_PER_PAGE
    ? TEST_LAYOUT_HORIZONTAL
    : TEST_LAYOUT_VERTICAL;
}

/**
 * Resolve how many questions are visible at once.
 * Legacy `layout_mode=horizontal` still maps to one-per-page so existing
 * tests and frozen snapshots keep the intended paper.
 *
 * @param {Record<string, unknown>|null|undefined} source
 */
export function resolveAuthoritativeDisplay(source) {
  if (!source || typeof source !== 'object') return TEST_DISPLAY_ALL;
  const displayRaw = source.displayMode ?? source.display_mode;
  const layoutRaw = source.layoutMode ?? source.layout_mode;
  if (displayRaw === TEST_DISPLAY_ONE_PER_PAGE) return TEST_DISPLAY_ONE_PER_PAGE;
  if (canonicalizeLayoutMode(layoutRaw) === TEST_LAYOUT_HORIZONTAL) return TEST_DISPLAY_ONE_PER_PAGE;
  return TEST_DISPLAY_ALL;
}

export function resolveAuthoritativeLayout(source) {
  return layoutModeFromDisplay(resolveAuthoritativeDisplay(source));
}

export function isAllQuestionsDisplay(value) {
  if (value && typeof value === 'object') {
    return resolveAuthoritativeDisplay(value) === TEST_DISPLAY_ALL;
  }
  return resolveAuthoritativeDisplay({ display_mode: value, layout_mode: value }) === TEST_DISPLAY_ALL;
}

/** @deprecated Use isAllQuestionsDisplay. Accepts layout or display values. */
export function isVerticalQuestionFlow(layoutOrDisplay) {
  return isAllQuestionsDisplay(layoutOrDisplay);
}

export function resolveFullPageMode(source) {
  if (!source || typeof source !== 'object') return false;
  const value = source.fullPageMode ?? source.full_page_mode;
  return value === true || value === 1 || value === '1';
}

/**
 * Prefer an explicit payload display_mode, then legacy layout_mode, then existing row.
 * @param {Record<string, unknown>|null|undefined} payload
 * @param {Record<string, unknown>|null|undefined} existing
 */
export function resolveDisplayModeFromPayload(payload, existing) {
  if (payload && typeof payload === 'object') {
    if (payload.display_mode != null || payload.displayMode != null) {
      return canonicalizeDisplayMode(payload.display_mode ?? payload.displayMode);
    }
    if (payload.layout_mode != null || payload.layoutMode != null) {
      return displayModeFromLayout(payload.layout_mode ?? payload.layoutMode);
    }
  }
  return resolveAuthoritativeDisplay(existing);
}

export function buildPresentationSettings(source) {
  const displayMode = resolveAuthoritativeDisplay(source);
  return {
    displayMode,
    layoutMode: layoutModeFromDisplay(displayMode),
    fullPageMode: resolveFullPageMode(source),
  };
}
