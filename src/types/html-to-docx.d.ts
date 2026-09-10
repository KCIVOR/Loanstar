declare module "html-to-docx" {
  /**
   * html-to-docx@1.x — `HTMLtoDOCX(html, headerHTML?, options?, footerHTML?)`.
   * Returns a Buffer in Node, an ArrayBuffer/Blob in the browser.
   */
  const HTMLtoDOCX: (
    html: string,
    headerHTML?: string | null,
    options?: Record<string, unknown>,
    footerHTML?: string | null,
  ) => Promise<ArrayBuffer | Uint8Array>;
  export default HTMLtoDOCX;
}
