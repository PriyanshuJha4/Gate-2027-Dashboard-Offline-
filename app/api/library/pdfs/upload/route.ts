import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import fs from "fs";
import path from "path";
import { PDF_DIR } from "@/lib/paths";
import { topicIdByName } from "@/lib/topics";

// Helper to sanitize folder names to prevent path traversal
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
}

// Helper to sanitize filename while preserving the original extension (.pdf) safely
function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName); // e.g., ".pdf"
  const baseName = path.basename(originalName, ext);
  
  // Sirf base name ke special characters ko underscore se replace karein
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
  
  // Agar clean hone ke baad base name khali ho jaye, toh fallback name dein
  const finalBase = cleanBase.length > 0 ? cleanBase : "document";
  
  return `${finalBase}${ext || ".pdf"}`;
}

export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const subject = formData.get("subject") as string;
    const chapter = formData.get("chapter") as string;
    const customTitle = formData.get("title") as string;

    if (!file || !subject || !chapter) {
      return NextResponse.json(
        { error: "File, Subject, and Chapter are required fields." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted." },
        { status: 400 }
      );
    }

    const cleanSubject = sanitize(subject);
    const cleanChapter = sanitize(chapter);
    const originalName = file.name;
    const title = customTitle || originalName.replace(/\.[^/.]+$/, "");
    const fileId = `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Define physical storage path inside project: pdfs/Subject/Chapter/
    const uploadDir = path.join(PDF_DIR, cleanSubject || "General", cleanChapter || "General");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Handle duplicate filenames safely while keeping the .pdf extension intact
    let storedFilename = sanitizeFilename(originalName);
    let filePath = path.join(uploadDir, storedFilename);
    if (fs.existsSync(filePath)) {
      storedFilename = `${Date.now()}_${storedFilename}`;
      filePath = path.join(uploadDir, storedFilename);
    }

    // Write file to physical filesystem securely
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    fs.writeFileSync(filePath, fileBytes);

    // Relative path for database
    const relativePath = `pdfs/${cleanSubject || "General"}/${cleanChapter || "General"}/${storedFilename}`;

    // Insert metadata into SQLite
    await db.execute({
      sql: `INSERT INTO pdfs (id, title, original_filename, stored_filename, relative_path, subject, chapter, topic_id, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fileId,
        title,
        originalName,
        storedFilename,
        relativePath,
        subject,
        chapter,
        topicIdByName(chapter, subject),
        file.size,
        file.type,
      ],
    });

    const newPdf = {
      id: fileId,
      name: title,
      originalName,
      relativePath,
      subject,
      chapter,
      size: file.size,
      addedAt: new Date().toISOString(),
      lastPage: 1,
    };

    return NextResponse.json({ success: true, pdf: newPdf }, { status: 201 });
  } catch (error: any) {
    console.error("PDF Upload Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}