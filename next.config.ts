import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
   * The dev server and the production build get separate output directories.
   *
   * This repository lives inside OneDrive, which turns files it is syncing
   * into cloud placeholders. A production build writes several hundred at
   * once, OneDrive starts on the folder, and the next `next dev` reads one
   * mid-conversion and dies before it ever answers a request:
   *
   *   EINVAL: invalid argument, readlink
   *   '...\.next\server\interception-route-rewrite-manifest.js'
   *
   * That happened four times in one day, always in the same order — build,
   * then start the dev server. Separate directories mean the build's output
   * is never the thing the dev server is reading.
   *
   * Vercel builds with NODE_ENV=production, so deployment still uses .next
   * and nothing about the hosted build changes.
   *
   * This is a workaround for where the repo sits, not a fix. Moving it out
   * of OneDrive — to C:\dev\landline, say — removes the cause.
   */
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
