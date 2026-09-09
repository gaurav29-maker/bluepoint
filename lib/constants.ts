/** Bump when the disclaimer text changes; consents record the version they accepted. */
export const DISCLAIMER_VERSION = "2026-09-08";

/** How long a slot is reserved while the customer pays. */
export const HOLD_MINUTES = 10;

/**
 * The price list. One source of truth — the site, the order routes and the
 * ops console all read these, so a price can never be right in one place and
 * wrong in another.
 *
 * Set by Gaurav on 8 September 2026. Two things recorded in
 * docs/plans/2026-09-08-membership-and-pricing-design.md and knowingly
 * shipped as they stand:
 *
 *   - four quarterly passes (18,00,00 paise) cost LESS than one annual, for
 *     identical coverage;
 *   - the bundle sells calls at 3,333 rupees against a 5,499 list price, a
 *     39% discount, which is the widest gap in the ladder.
 */
export const SINGLE_CALL_PAISE = 549900;

export const BUNDLE_DAYS = 60;
export const BUNDLE_CREDITS = 3;
export const BUNDLE_PRICE_PAISE = 999900;
export const BUNDLE_PER_CALL_PAISE = Math.round(BUNDLE_PRICE_PAISE / BUNDLE_CREDITS);

/**
 * Passes are unlimited and have NO credit count. A pass bought once upfront
 * is a payment, not a mandate, which is how this sidesteps the RBI e-mandate
 * framework that stalled the monthly tier.
 */
export const MEMBERSHIP_TIERS = {
  quarterly: { label: "Quarterly pass", pricePaise: 4500000, days: 90 },
  annual: { label: "Annual pass", pricePaise: 24500000, days: 365 },
} as const;

export type MembershipTierName = keyof typeof MEMBERSHIP_TIERS;

/**
 * What an expert is paid per session, used only to estimate margin in the ops
 * console. THIS IS A PLACEHOLDER — the real split has not been decided. Set
 * EXPERT_PAYOUT_PAISE in the environment once it is, or every margin figure
 * below is fiction.
 */
export const EXPERT_PAYOUT_PAISE = Number(process.env.EXPERT_PAYOUT_PAISE ?? 220000);

/**
 * A pass is bought outright, not auto-renewed, so a member has to actively
 * decide to pay again. The prompt IS the renewal mechanism — without it they
 * simply lapse.
 */
export const RENEWAL_WINDOW_DAYS = 30;

/**
 * Minimum gap between sign-in emails to one address. The response to the form
 * is identical either way, so a throttled request is indistinguishable from a
 * sent one and reveals nothing.
 */
export const SIGN_IN_THROTTLE_SECONDS = 60;

/** Intake payloads are deleted this long after the call. */
export const INTAKE_RETENTION_DAYS = 90;
