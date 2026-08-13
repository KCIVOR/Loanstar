import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake (→ @foliojs-fork/pdfkit → fontkit) and jsdom read data/font files
  // via runtime readFileSync. Bundling them rewrites those paths and breaks the
  // reads (e.g. fontkit's data.trie), so keep them external and require them
  // from node_modules at runtime. Used by the document template renderer.
  //
  // NOTE: jsdom is externalized by Next.js by default (see
  // node_modules/next/dist/lib/server-external-packages.jsonc) regardless of
  // whether it's listed here — serverExternalPackages only *adds* to that
  // built-in list, it can't remove a default entry. So the jsdom/pdfmake
  // version pins in package.json (and the cssstyle override) are load-bearing:
  // jsdom's dependency tree must stay free of ESM-only packages (like
  // @exodus/bytes or @asamuzakjp/css-color), since Turbopack's externalRequire
  // does a raw Node require() on externalized packages at runtime and cannot
  // load ESM (see scripts/scan-esm-only.mjs).
  serverExternalPackages: [
    "pdfmake",
    "@foliojs-fork/pdfkit",
    "@foliojs-fork/fontkit",
    "html-to-pdfmake",
    "jsdom",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "acopcwlhkovssjnrqygk.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
