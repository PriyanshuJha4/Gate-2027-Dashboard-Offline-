/**
 * Loads pdf.js only in the browser (never on the server) and points it at the
 * local worker file in /public (copied there by scripts/copy-pdf-worker.mjs).
 */
type PdfJsModule = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

export function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      const pdfJs = mod as unknown as PdfJsModule;
      pdfJs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return pdfJs;
    });
  }
  return pdfjsPromise;
}
