"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Where the choice is kept, and the flag the pre-paint script reads. */
export const THEME_KEY = "landline:theme";

/**
 * Light / dark, as a choice rather than a guess.
 *
 * Three states exist and only two are shown: no stored choice means follow
 * the operating system, which is what a first-time visitor gets. Pressing the
 * button writes a choice and from then on this site ignores the OS — that is
 * the point of a toggle, and a toggle that silently reverts on the next visit
 * is worse than none.
 *
 * Renders nothing until mounted. The server has no idea what the visitor's OS
 * prefers, so any label rendered on the server is a coin flip, and React would
 * hydrate a button that says "Dark" over a page that already is.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const stored = root.getAttribute("data-theme") as Theme | null;
    setTheme(
      stored ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  }, []);

  /*
   * While the visitor is still on the system default, the OS changing should
   * still move the page. Once they have chosen, it should not.
   */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (document.documentElement.hasAttribute("data-theme")) return;
      setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (theme === null) {
    // Holds the space so the nav does not jump when this appears.
    return <span className={`theme-btn theme-btn-ghost ${className}`} aria-hidden />;
  }

  const next: Theme = theme === "dark" ? "light" : "dark";

  const flip = () => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private windows and blocked site data. The page still turns; the
      // choice just will not survive a reload, which is the right failure.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={`theme-btn ${className}`}
      onClick={flip}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {/*
        One icon, showing what you would get, not what you have. A moon on a
        dark page reads as "you are in dark" to half of people and "press for
        dark" to the other half; the label settles it for screen readers.
      */}
      {next === "dark" ? (
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden focusable="false">
          <path
            d="M16.3 11.6A6.5 6.5 0 0 1 8.4 3.7a6.8 6.8 0 1 0 7.9 7.9Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden focusable="false">
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10 1.6v2M10 16.4v2M1.6 10h2M16.4 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4" />
          </g>
        </svg>
      )}
    </button>
  );
}
