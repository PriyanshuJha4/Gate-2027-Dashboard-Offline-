import { NextResponse } from "next/server";

/**
 * PDF uploads are intentionally disabled here.
 * Resource Root -> Sync is the only supported way to add PDFs.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Direct PDF upload is disabled. Add the PDF to Resource Root and run Sync Library.",
      code: "RESOURCE_ROOT_ONLY",
    },
    { status: 410 },
  );
}
