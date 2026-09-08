import crypto from "node:crypto";
import Razorpay from "razorpay";

let cached: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (cached) return cached;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error("Razorpay keys are not set");
  cached = new Razorpay({ key_id, key_secret });
  return cached;
}

export function isTestMode(): boolean {
  return (process.env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_");
}

/**
 * Verify a webhook against the RAW request body.
 *
 * This must never be handed a re-serialized object. Next.js will happily parse
 * a body for you, and `JSON.stringify(parsed)` differs from what Razorpay
 * signed whenever key order or number formatting shifts — which fails
 * intermittently and is miserable to debug.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Used when a payment lands after its hold has already lapsed. */
export async function refundPayment(paymentId: string, amountPaise: number, reason: string) {
  return razorpay().payments.refund(paymentId, {
    amount: amountPaise,
    speed: "normal",
    notes: { reason },
  });
}
