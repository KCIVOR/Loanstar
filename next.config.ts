import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfmake (→ @foliojs-fork/pdfkit → fontkit) and jsdom read data/font files
  // via runtime readFileSync. Bundling them rewrites those paths and breaks the
  // reads (e.g. fontkit's data.trie), so keep them external and require them
  // from node_modules at runtime. Used by the document template renderer.
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
