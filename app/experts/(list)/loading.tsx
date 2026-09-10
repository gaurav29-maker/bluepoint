import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

/**
 * /experts reads every live expert and then computes each one's next open
 * slot. Until now the browser held the previous page for the whole of that
 * and then swapped — which locally is imperceptible and on a cold serverless
 * function against Postgres in Mumbai is not.
 *
 * The nav and footer are repeated here rather than left out. They live in the
 * page rather than a layout, so a skeleton without them would take the site
 * chrome away and put it back, which reads as a worse fault than the wait.
 *
 * Three cards because three is what is seeded. It is a placeholder, not a
 * promise about how many there are.
 */
function CardSkeleton() {
  return (
    <article className="xcard" aria-hidden="true">
      <div className="xcard-top">
        <span className="sk sk-av" />
        <div className="sk-lines">
          <span className="sk" style={{ height: 15, maxWidth: 160 }} />
          <span className="sk" style={{ maxWidth: 210 }} />
        </div>
      </div>

      {/* Four rows, because the real record has four: rate, session, next, SEBI. */}
      <dl className="rec">
        {[68, 96, 120, 104].map((w, i) => (
          <div key={i}>
            <dt>
              <span className="sk" style={{ width: 52, height: 9 }} />
            </dt>
            <dd>
              <span className="sk" style={{ width: w, height: 11 }} />
            </dd>
          </div>
        ))}
      </dl>

      <span className="sk sk-btn" />
    </article>
  );
}

export default function LoadingExperts() {
  return (
    <div className="site">
      <SiteNav />

      <div className="wrap">
        <div className="doc find" role="status" aria-busy="true">
          <span className="sk-say">Loading experts…</span>

          {/*
            42 and 52 are the real heights: the h1's line box, and the lede's
            two lines of 26. Matching the boxes rather than the bars is what
            puts the first card where it is going to stay.
          */}
          <div className="sk-box" style={{ height: 42 }} aria-hidden="true">
            <span className="sk sk-h1" />
          </div>
          <div className="sk-box" style={{ height: 52, marginTop: 24 }} aria-hidden="true">
            <span className="sk sk-lede" />
            <span className="sk sk-lede" style={{ maxWidth: 430 }} />
          </div>

          {/*
            The filter rows and the count are what set the distance between
            the lede and the first card. Without them the cards drew high and
            then jumped 125px down the page when the real ones arrived, which
            is the fault a skeleton exists to prevent.

            The two eyebrows are real text — they are fixed labels, not data.
            The chips are placeholders only because which one is active comes
            from the URL, and showing the wrong one lit up for a second is
            worse than showing none.
          */}
          <div className="filters" aria-hidden="true">
            <div className="filter-row">
              <span className="eyebrow">Focus</span>
              {[74, 112, 52].map((w, i) => (
                <span key={i} className="sk" style={{ width: w, height: 34, borderRadius: 4 }} />
              ))}
            </div>
            <div className="filter-row">
              <span className="eyebrow">Sort</span>
              {[128, 96].map((w, i) => (
                <span key={i} className="sk" style={{ width: w, height: 34, borderRadius: 4 }} />
              ))}
            </div>
          </div>

          {/* The results count: 36 tall, 16 clear beneath it. */}
          <div className="sk-box" style={{ height: 36, marginBottom: 16 }} aria-hidden="true">
            <span className="sk" style={{ width: 84, height: 10 }} />
          </div>

          <div className="grid3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
