/** Bump when the disclaimer text changes; consents record the version they accepted. */
export const DISCLAIMER_VERSION = "2026-09-08";

/** How long a slot is reserved while the customer pays. */
export const HOLD_MINUTES = 10;

/** Bundle validity and price, matching the pricing copy on the site. */
export const BUNDLE_DAYS = 60;
export const BUNDLE_CREDITS = 3;

/**
 * A bundle is a flat 3,600 rupees whichever expert it is booked against,
 * because that is what the pricing card promises. Worth revisiting: against
 * the 2,200 expert it is a 45% discount, against the 1,500 one only 20%.
 */
export const BUNDLE_PRICE_PAISE = 360000;
export const BUNDLE_PER_CALL_PAISE = BUNDLE_PRICE_PAISE / BUNDLE_CREDITS;

/** Intake payloads are deleted this long after the call. */
export const INTAKE_RETENTION_DAYS = 90;
