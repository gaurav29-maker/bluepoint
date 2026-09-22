# The Landline mark

Right now the wordmark on the site is **set in type**, not drawn from the
artwork. Everything below is what it takes to swap in the real logo.

## What to put here

| File | What it is |
| --- | --- |
| `landline.svg` | The logotype on its own — no descriptor, no ® |
| `landline-lockup.svg` | Optional. Logotype with `financial expert` beneath it |

**The SVG must have its text converted to outlines** (in Illustrator:
Type → Create Outlines; in Figma: right-click → Outline Stroke / flatten).
An SVG that still references a font by name renders in whatever the viewer
happens to have installed, which on most machines is not the right face.

Export with a tight bounding box — no whitespace padding around the letters —
or the mark will look mysteriously small and badly aligned next to the nav
links. Transparent background, black fill; the CSS does not recolour it.

## Turning it on

One line, in [`lib/brand.ts`](../../lib/brand.ts):

```ts
export const WORDMARK_SRC: string | null = "/brand/landline.svg";
```

That changes every mark on the site at once — nav, footer, member console,
expert console, ops console, and both Open Graph share cards. There is no
second place to edit; see the note at the top of that file for why.

## Two things deliberately left off

**The ® is not rendered.** The supplied artwork carries one, but designers add
that symbol out of habit and it is a specific legal claim: under section 107 of
the Trade Marks Act 1999, representing a mark as registered in India when it is
not is an offence. `TRADEMARK_REGISTERED` in `lib/brand.ts` is `false`. Flip it
once there is a registration number, and write the number in that comment.

**The descriptor appears once,** under the footer logotype, which is where the
supplied lockup puts it. It is not in the nav, because `landline / financial
expert` sitting at the top of every page reads as a claim Landline is making
about itself — and this site is careful to say the *experts* are the experts.
