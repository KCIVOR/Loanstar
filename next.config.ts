import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake (→ @foliojs-fork/pdfkit → fontkit) reads font/data files via
  // runtime readFileSync. Bundling it rewrites those paths and breaks the
  // reads (e.g. fontkit's data.trie), so keep it external and require it
  // from node_modules at runtime. Used by the document template renderer.
  //
  // jsdom is deliberately NOT external (unlike before): its dependency tree
  // (whatwg-url, cssstyle → @asamuzakjp/css-color → @csstools/css-calc, etc.)
  // has grown ESM-only leaves that Turbopack's externalRequire cannot
  // require() at runtime (ERR_REQUIRE_ESM), even on Node 24. Bundling jsdom
  // lets Turbopack resolve/interop those ESM imports at build time instead.
  // jsdom's own runtime readFileSync (default-stylesheet.css, resolved via
  // __dirname) still works when bundled — verified against the actual
  // `next build` + `next start` output, not just `next dev`.
  serverExternalPackages: [
    "pdfmake",
    "@foliojs-fork/pdfkit",
    "@foliojs-fork/fontkit",
    "html-to-pdfmake",
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
