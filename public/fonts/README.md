# Korataki, the wordmark face

The wordmark asks for **Korataki** (Ray Larabie / Typodermic) at bold and
extra-bold. The font file is not in this repository, for two reasons:

1. Every free distribution of Korataki is licensed **personal use only**.
   Landline takes payments, so it needs a commercial licence from Typodermic.
2. Font files are not ours to redistribute even once licensed — a licence
   covers using it, not putting it in a public repo.

## To turn it on

Drop **one file** here:

    public/fonts/Korataki-Bold.woff2

That is all. `app/globals.css` already declares it for weights 700 and 800,
so bold and extra-bold both resolve to it, and `--font-mark` already puts it
ahead of Inter.

If you have a `.ttf` or `.otf` rather than `.woff2`, convert it — woff2 is
roughly half the size and every browser in use supports it.

## Until then

The wordmark falls back to Inter and looks exactly as it did. Nothing
breaks; the browser simply skips a font it cannot find.
