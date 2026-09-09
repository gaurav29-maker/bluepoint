import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Money is always integer paise. Never floats, never rupees.
 * Times of day are minutes from midnight in the expert's timezone;
 * see the design doc for why weekly recurrence is not stored as timestamptz.
 */

export const expertStatus = pgEnum("expert_status", ["draft", "live", "paused"]);
export const sebiRegType = pgEnum("sebi_reg_type", ["ria", "ra", "none"]);
export const specialty = pgEnum("specialty", ["portfolio_audit", "fno_systematic"]);
export const exceptionKind = pgEnum("exception_kind", ["block", "extra"]);
export const applicationStatus = pgEnum("application_status", ["new", "approved", "rejected"]);
export const bookingStatus = pgEnum("booking_status", [
  "held",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
  "refunded",
  "expired",
]);
export const productType = pgEnum("product_type", [
  "single",
  "bundle_call",
  "monthly",
  "membership_call",
]);
export const membershipTier = pgEnum("membership_tier", ["quarterly", "annual"]);
export const membershipStatus = pgEnum("membership_status", [
  "pending",
  "active",
  "expired",
  "refunded",
  "cancelled",
]);
export const paymentStatus = pgEnum("payment_status", [
  "created",
  "captured",
  "failed",
  "refunded",
]);
export const bundleStatus = pgEnum("bundle_status", [
  "active",
  "exhausted",
  "expired",
  "refunded",
]);
export const notificationKind = pgEnum("notification_kind", [
  "booking_confirmed_customer",
  "booking_confirmed_expert",
  "intake_nudge",
  "reminder_24h",
  "reminder_1h",
  "followup",
  "refund_apology",
]);

export const experts = pgTable(
  "experts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    initials: text("initials").notNull(),
    headline: text("headline").notNull(),
    bio: text("bio").notNull().default(""),
    specialties: specialty("specialties").array().notNull(),
    yearsExperience: smallint("years_experience").notNull(),
    pricePaise: integer("price_paise").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),

    // First-class, not an afterthought: see the SEBI section of the design doc.
    sebiRegType: sebiRegType("sebi_reg_type").notNull().default("none"),
    sebiRegNumber: text("sebi_reg_number"),

    /**
     * NOT copied onto bookings any more. A single room shared across every
     * session means one customer can walk into another's call — see the note
     * on bookings.meetingUrl. Kept only as a default an expert may paste.
     */
    meetingUrl: text("meeting_url"),
    contactEmail: text("contact_email").notNull(),

    status: expertStatus("status").notNull().default("draft"),
    lastLinkSentAt: timestamp("last_link_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("experts_slug_idx").on(t.slug), index("experts_status_idx").on(t.status)],
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 0 = Sunday
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [index("availability_rules_expert_idx").on(t.expertId, t.weekday)],
);

export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: exceptionKind("kind").notNull(),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
  },
  (t) => [index("availability_exceptions_expert_idx").on(t.expertId, t.date)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    /** When a sign-in link was last emailed, so it cannot be used to spam. */
    lastLinkSentAt: timestamp("last_link_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_email_idx").on(sql`lower(${t.email})`)],
);

export const bundles = pgTable("bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  // Nullable since memberships arrived: a bundle is tied to one expert,
  // a pass is not tied to anyone.
  expertId: uuid("expert_id").references(() => experts.id),
  creditsTotal: smallint("credits_total").notNull().default(3),
  creditsUsed: smallint("credits_used").notNull().default(0),
  amountPaise: integer("amount_paise").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: bundleStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A pass is a WINDOW OF TIME, not a pot of credits.
 *
 * There is deliberately no credits_total or credits_used here. Passes are
 * unlimited, so a counter would be a column that is always meaningless, and
 * bending `bundles` to carry both shapes would leave half its columns null on
 * every row. Booking under a pass asks one question: is there an active
 * membership covering this date?
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    tier: membershipTier("tier").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    status: membershipStatus("status").notNull().default("pending"),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memberships_customer_idx").on(t.customerId),
    index("memberships_window_idx").on(t.status, t.endsAt),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expertId: uuid("expert_id")
      .notNull()
      .references(() => experts.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("held"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    product: productType("product").notNull().default("single"),
    bundleId: uuid("bundle_id").references(() => bundles.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    amountPaise: integer("amount_paise").notNull(),
    /**
     * Set per session by the expert, and deliberately NOT inherited from
     * experts.meeting_url. Copying one room onto every booking gave four
     * customers the same link, which is a privacy breach dressed as a
     * convenience: any of them could join another's portfolio review.
     * Null until the expert supplies one; the UI already says so.
     */
    meetingUrl: text("meeting_url"),
    cancelledReason: text("cancelled_reason"),

    /**
     * What the expert recorded after the session, shown to the customer.
     *
     * The wording of this field is load-bearing. It records what was
     * DISCUSSED, never what was recommended. "Discussed the concentration in
     * IT and how it got there" is an account of a conversation; "advised
     * cutting IT to 30%" is a written personalised recommendation sitting on
     * Bluepoint's servers and delivered to the customer, which is the exact
     * thing the terms say we do not do. The expert console says so at the
     * point of writing, and the customer's view frames it the same way.
     *
     * Purged on the same 90-day clock as the intake it describes.
     */
    expertNote: text("expert_note"),
    expertNoteAt: timestamp("expert_note_at", { withTimezone: true }),

    /** The refund policy allows one free move; this is what enforces "one". */
    rescheduleCount: smallint("reschedule_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * The single most important line in this schema.
     *
     * Two customers paying for the same slot costs a customer and an expert
     * at once. A check-then-insert in application code loses that race; this
     * index cannot. Cancelled, refunded and expired bookings are excluded, so
     * a released slot becomes bookable again immediately.
     */
    uniqueIndex("bookings_no_double_booking")
      .on(t.expertId, t.startsAt)
      .where(sql`status in ('held','confirmed','completed')`),
    index("bookings_customer_idx").on(t.customerId),
    index("bookings_starts_at_idx").on(t.startsAt),
    index("bookings_hold_sweep_idx")
      .on(t.holdExpiresAt)
      .where(sql`status = 'held'`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    bundleId: uuid("bundle_id").references(() => bundles.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    razorpayOrderId: text("razorpay_order_id").notNull(),
    razorpayPaymentId: text("razorpay_payment_id"),
    amountPaise: integer("amount_paise").notNull(),
    status: paymentStatus("status").notNull().default("created"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_order_idx").on(t.razorpayOrderId),
    // Idempotency: a redelivered capture cannot be recorded twice.
    uniqueIndex("payments_payment_idx")
      .on(t.razorpayPaymentId)
      .where(sql`razorpay_payment_id is not null`),
  ],
);

export const intakeSubmissions = pgTable(
  "intake_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    /**
     * Holdings summary, goals, experience, risk comfort.
     *
     * There is deliberately no field here for demat credentials. The FAQ
     * promises users never share a login, and the cheapest way to keep that
     * promise is to have nowhere to put one. Purged 90 days after the call.
     */
    payload: jsonb("payload").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("intake_booking_idx").on(t.bookingId)],
);

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  disclaimerVersion: text("disclaimer_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("razorpay"),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("webhook_events_event_idx").on(t.provider, t.eventId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // A retrying Cron must not send the same reminder three times.
  (t) => [uniqueIndex("notifications_once_idx").on(t.bookingId, t.kind)],
);

/**
 * People asking to become experts.
 *
 * Kept apart from `experts` on purpose. An applicant is not a draft expert:
 * they have no price, no availability and no account, and a row in `experts`
 * is something the booking code is entitled to assume is a real person we
 * have checked. Approval is the moment one becomes the other, and it is a
 * decision a human makes in the ops console.
 *
 * Applications carry personal data under the DPDP Act. Rejected ones should
 * not be kept indefinitely — see the note in scripts/ and the purge cron.
 */
export const expertApplications = pgTable(
  "expert_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    headline: text("headline").notNull(),
    bio: text("bio").notNull(),
    specialties: specialty("specialties").array().notNull(),
    yearsExperience: smallint("years_experience").notNull(),

    /**
     * Asked at the door rather than after approval. Whether someone is
     * registered changes what the listing has to say about them, and the
     * terms commit to showing it either way.
     */
    sebiRegType: sebiRegType("sebi_reg_type").notNull().default("none"),
    sebiRegNumber: text("sebi_reg_number"),

    /** Where their work can be seen, in their own words. */
    links: text("links"),
    note: text("note"),

    status: applicationStatus("status").notNull().default("new"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    /** Set on approval, so an application can never create two experts. */
    expertId: uuid("expert_id").references(() => experts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /*
     * One open application per address. A partial index rather than a plain
     * unique one, so somebody rejected in March can apply again in October
     * without a support ticket — but cannot submit the same form nine times
     * while it is still sitting in the queue.
     */
    uniqueIndex("expert_applications_one_open_idx")
      .on(sql`lower(${t.email})`)
      .where(sql`status = 'new'`),
    index("expert_applications_status_idx").on(t.status, t.createdAt),
  ],
);

export type Expert = typeof experts.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type ExpertApplication = typeof expertApplications.$inferSelect;
