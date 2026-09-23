/**
 * The brand mark, in one place.
 *
 * Until now the wordmark was hand-written as JSX in fifteen separate files.
 * That is how the old name survived the rebrand inside two Open Graph cards:
 * it was split across two spans, so searching for the string never found it,
 * and the cards kept shipping the wrong brand into every WhatsApp forward.
 * One definition, one component, and that cannot happen again.
 */

/**
 * The supplied logotype, once the file is in public/brand/.
 *
 * Null means "render the wordmark as type", which is what happens today.
 * Point this at the artwork and every mark on the site changes at once —
 * nav, footer, both consoles, both share cards.
 *
 * The file needs to be an SVG with the text converted to outlines, so it does
 * not depend on the viewer having the typeface. See public/brand/README.md.
 */
export const WORDMARK_SRC: string | null = null;

/** Height of the logotype image, in px, at each size it is used. */
export const WORDMARK_HEIGHT = { sm: 15, md: 17, lg: 22 } as const;

/**
 * The descriptor from the supplied lockup. It sits under the logotype, which
 * is the only place the artwork uses it — never in the nav, where it would
 * read as a claim Landline is making about itself rather than the name of a
 * category. The experts are the experts; Landline is where you reach them.
 */
export const BRAND_DESCRIPTOR = "financial expert";

/**
 * The campaign line. It is the promise, so it goes where somebody meets the
 * brand cold and nowhere else: the two share cards, and the header of every
 * email. Repeating it down the page would turn a promise into a slogan.
 */
/**
 * Split where the headline breaks it.
 *
 * Every heading on this site sets its last phrase in the italic serif, and
 * the hero is now the tagline, so the tagline has to be splittable. Parts
 * rather than a second hard-coded copy: BRAND_TAGLINE is built from these,
 * so the hero, the footer, the share card and every email still move
 * together when the words change.
 */
export const BRAND_TAGLINE_PARTS = ["Your direct line to a ", "financial expert", "."] as const;

/** The tagline as one string, for every place that is not the headline. */
export const BRAND_TAGLINE = BRAND_TAGLINE_PARTS.join("");

/**
 * Whether to set the ® on the mark.
 *
 * FALSE deliberately, and it is not a styling choice. Under section 107 of
 * the Trade Marks Act 1999, representing a mark as registered in India when
 * it is not is an offence. The supplied artwork carries an ®, but designers
 * add that symbol as a matter of habit, and I have no evidence of a
 * registration for this mark.
 *
 * Flip this to true once there is a registration number for "landline" in
 * the relevant class — and record the number here when you do.
 */
export const TRADEMARK_REGISTERED = false;

/**
 * The name as it is written in a sentence.
 *
 * The logotype is set lowercase; running prose is not. "Landline sessions
 * are a review and discussion" keeps its capital, the same way a lowercase
 * logo does not make a brand lowercase in the middle of a paragraph.
 */
export const BRAND_NAME = "Landline";

/**
 * The logotype split the way it is set — plain word, accent word.
 *
 * This exists for the two Open Graph cards, which cannot use the Wordmark
 * component: Satori renders them, and it does not know next/link and refuses
 * to lay out an element that holds more than one child without an explicit
 * display. They still read the name from here rather than typing it, which
 * is the whole point — the old name survived the rebrand in exactly those
 * two files because each had it hand-written across two spans.
 */
export const WORDMARK_PARTS = ["land", "line"] as const;
