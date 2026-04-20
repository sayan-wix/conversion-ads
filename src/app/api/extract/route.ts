/**
 * POST /api/extract
 * Accepts a multipart/form-data upload with a single "file" field.
 * Extracts text from .txt / .md / .docx / .pdf and returns { text }.
 *
 * Used by the wizard to let users attach source docs directly instead of pasting.
 */
import mammoth from "mammoth";

// NOTE: pdf-parse is lazy-imported inside the PDF branch below. Statically importing
// it at module load caused the whole /api/extract function to crash at cold start in
// Vercel's serverless environment, returning HTML 500s for ALL uploads (even .txt).

export const runtime = "nodejs";
// Vercel Pro: 300s. Big PDFs and docx files can take a while to extract.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel serverless has a ~4.5MB body limit; cap uploads here so we fail fast with a
// clear message instead of a cryptic platform error.
const MAX_BYTES = 10 * 1024 * 1024; // 10MB (Vercel Pro accepts this; Hobby may reject >4.5MB)

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no_file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      {
        error: "file_too_large",
        message: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is ${MAX_BYTES / 1024 / 1024}MB. Try splitting it.`,
      },
      { status: 413 },
    );
  }

  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text: string;

    if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) {
      text = buf.toString("utf8");
    } else if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (name.endsWith(".pdf")) {
      // Lazy-import pdf-parse so non-PDF uploads never touch it. If pdf-parse itself
      // fails to load (native deps, missing workers, etc.), return a clear JSON error
      // instead of crashing the function.
      let PDFParse: new (opts: { data: Uint8Array }) => {
        getText: () => Promise<{ text: string }>;
      };
      try {
        const mod = await import("pdf-parse");
        PDFParse = mod.PDFParse;
      } catch (e) {
        return Response.json(
          {
            error: "pdf_support_unavailable",
            message:
              "PDF parsing is temporarily unavailable on the server. Try converting to .docx or .txt.",
            detail: (e as Error).message,
          },
          { status: 503 },
        );
      }
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      text = result.text;
    } else {
      return Response.json(
        {
          error: "unsupported_format",
          message: `Supported formats: .txt, .md, .docx, .pdf. Got: ${name || "(no name)"}`,
        },
        { status: 400 },
      );
    }

    // Light cleanup: normalize line endings, strip any NUL bytes, trim.
    text = text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();

    return Response.json({
      text,
      filename: file.name,
      bytes: file.size,
      chars: text.length,
    });
  } catch (e) {
    return Response.json(
      {
        error: "extract_failed",
        message: (e as Error).message || "Failed to extract text from file.",
      },
      { status: 500 },
    );
  }
}
