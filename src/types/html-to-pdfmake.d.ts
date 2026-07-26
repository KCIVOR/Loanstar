// html-to-pdfmake ships no type declarations. Minimal ambient types for the
// single call shape we use: (html, { window }) -> pdfmake content nodes.
declare module "html-to-pdfmake" {
  interface HtmlToPdfmakeOptions {
    window?: unknown;
    tableAutoSize?: boolean;
    defaultStyles?: Record<string, unknown>;
    [key: string]: unknown;
  }

  const htmlToPdfmake: (
    html: string,
    options?: HtmlToPdfmakeOptions,
  ) => unknown;

  export default htmlToPdfmake;
}
