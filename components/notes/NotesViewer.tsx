"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type DragEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/pdfjs";
import {
  deleteBookmark,
  deletePdf,
  getAnnotationsForPdf,
  getPdf,
  listBookmarks,
  listPdfs,
  putBookmark,
  saveAnnotations,
  updatePdf,
  uploadPdfWithMetadata,
  type Annotation,
  type Bookmark,
  type StoredPdf,
} from "@/lib/notesDb";
import PdfPage, { type Tool } from "@/components/notes/PdfPage";
import CardDialog from "@/components/flashcards/CardDialog";

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: "hand", icon: "✋", label: "Scroll / select" },
  { id: "pen", icon: "✏", label: "Pen" },
  { id: "highlight", icon: "🖍️", label: "Highlighter (freehand)" },
  { id: "rect", icon: "▭", label: "Highlight box" },
  { id: "text", icon: "T", label: "Text box" },
  { id: "eraser", icon: "🧽", label: "Eraser" },
  { id: "card", icon: "🃏", label: "Make flashcard (drag a box)" },
];

const PEN_PRESETS = ["#ef4444", "#2563eb", "#16a34a", "#111827", "#ffffff"];
const HL_PRESETS = ["#facc15", "#4ade80", "#38bdf8", "#f472b6", "#fb923c"];

// Pre-defined complete syllabus structure mapping subjects to their chapters
const PREDEFINED_SYLLABUS: Record<string, string[]> = {
  "C Programming": [
    "Data Types and Operators",
    "Control Flow Statements",
    "Functions & storage",
    "Arrays and Pointers",
    "String in C Programming",
    "Structure and Union",
    "Miscellaneous Topics",
  ],
  "Data Structures": [
    "Introduction to DSA",
    "Arrays",
    "Linked List",
    "Stack and Queues",
    "Tree",
    "Graphs",
    "Hashing",
  ],
  "COA": [
    "Introduction of COA",
    "Machine Instruction & Addressing Modes",
    "Floating Point",
    "ALU & Control Unit",
    "Instruction Pipelining",
    "Cache Memory",
    "Secondary Memory & IO Interface",
  ],
  "algorithms": [
    "Analysis of Algorithm",
    "Design Strategies",
    "Greedy Method",
    "Dynamic Programming",
    "Graph Algorithms",
    "Heap Algorithms",
    "Backtracking & Branch Bound",
  ],
  "Digital Logic": [
    "Logic Gates",
    "Minimization of Boolean Function",
    "Combinational Circuits",
    "Sequential Logic Circuits",
    "Number System",
  ],
  "Discrete Mathematics": [
    "Graph Theory",
    "Mathematical logic",
    "Set Theory",
    "Combinatorics",
  ],
  "Engineering mathematics": [
    "Probability and statistics",
    "Single Variable Calculus",
    "Linear Algebra",
  ],
  "Aptitude": [
    "Verbal Aptitude",
    "Quantitative Aptitude",
    "Clocks & Calendars",
    "Percentages & Profit loss",
    "Numbers & Counting Theory",
    "Time and Work",
    "Time and Distance",
    "Data Interpretation",
    "Spatial Aptitude",
    "Formation of Image",
    "Analytical Aptitude",
    "Arrangement & Problem Solving",
    "Directions & Blood Relations",
    "Venn Diagrams & Syllogism",
  ],
  "TOC": [
    "Finite Automata",
    "Push Down Automata",
    "Turing Machine",
    "Decidability",
  ],
  "DBMS": [
    "FD's & Normalization",
    "Transaction & Concurrency Control",
    "ER Model",
    "Query Language",
    "File Org & Indexing",
  ],
  "Computer Networks": [
    "IPv4 Addressing",
    "Error Control",
    "Flow Control",
    "IPv4 Header & Fragmentation",
    "TCP & UDP",
    "Medium Access Control",
    "Switching",
    "Application Layer Protocol",
    "IP Support Protocol",
    "OSI and TCP/IP Protocol",
  ],
  "COMPILER Design": [
    "Lexical Analysis & Syntax Analysis",
    "Syntax Directed Translation",
    "Intermediate Code & Code Optimization",
  ],
  "Operating Systems": [
    "Introduction and background",
    "Process Management",
    "CPU Scheduling",
    "Process Synchronization",
    "Dead Lock",
    "Memory Management",
    "File System & Device Management",
    "System Calls and Threads",
    "Revision",
  ],
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NotesViewer() {
  /* ------------------------------- Library -------------------------------- */
  const [pdfs, setPdfs] = useState<StoredPdf[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  // VS Code style tree open/closed states for folders & chapters
  const [openSubjects, setOpenSubjects] = useState<Record<string, boolean>>({});
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // File-manager sidebar: search + mobile drawer
  const [search, setSearch] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Multi-select state (stores selected PDF IDs)
  const [selectedPdfIds, setSelectedPdfIds] = useState<Set<string>>(new Set());

  /* ----------------------------- Upload Modal ----------------------------- */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [subjectMode, setSubjectMode] = useState<"select" | "new">("select");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [newSubject, setNewSubject] = useState("");

  const [chapterMode, setChapterMode] = useState<"select" | "new">("select");
  const [selectedChapter, setSelectedChapter] = useState("");
  const [newChapter, setNewChapter] = useState("");
  const [uploading, setUploading] = useState(false);

  /* -------------------------------- Viewer -------------------------------- */
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect0, setAspect0] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [containerW, setContainerW] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  /* ------------------------------ Annotations ----------------------------- */
  const [annotations, setAnnotations] = useState<Record<number, Annotation[]>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [tool, setTool] = useState<Tool>("hand");
  const [penColor, setPenColor] = useState("#ef4444");
  const [hlColor, setHlColor] = useState("#facc15");
  const [sizeIdx, setSizeIdx] = useState(1);
  const [undoLen, setUndoLen] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showPanel, setShowPanel] = useState(true);
  const [bmLabel, setBmLabel] = useState("");
  const [cardDraft, setCardDraft] = useState<{ image: string; page: number } | null>(null);
  const [toast, setToast] = useState("");

  /* --------------------------------- Refs --------------------------------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const annRef = useRef<Record<number, Annotation[]>>({});
  const dirtyRef = useRef<Set<number>>(new Set());
  const undoRef = useRef<{ page: number; items: Annotation[] }[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const numPagesRef = useRef(0);
  const startPageRef = useRef(1);
  const readyRef = useRef(false);
  const openSeq = useRef(0);
  const scrollRaf = useRef(0);

  const activePdf = pdfs.find((p) => p.id === activeId) || null;
  const pageWidth = Math.round(Math.max(240, Math.min(containerW - 32, 1100) * zoom));

  // Combine predefined syllabus subjects with any custom user-added subjects from database and sort alphabetically
  const allSubjectsList = useMemo(() => {
    const dbSubjects = pdfs.map((p) => p.subject).filter(Boolean);
    const predefinedKeys = Object.keys(PREDEFINED_SYLLABUS);
    return Array.from(new Set([...predefinedKeys, ...dbSubjects])).sort((a, b) => a.localeCompare(b));
  }, [pdfs]);

  // Get available chapters for the selected subject sorted alphabetically
  const availableChapters = useMemo(() => {
    const subj = subjectMode === "select" ? selectedSubject : "";
    if (!subj) return [];
    
    const predefinedChs = PREDEFINED_SYLLABUS[subj] || [];
    const dbChs = pdfs
      .filter((p) => p.subject && p.subject.toLowerCase() === subj.toLowerCase())
      .map((p) => p.chapter)
      .filter(Boolean);

    return Array.from(new Set([...predefinedChs, ...dbChs])).sort((a, b) => a.localeCompare(b));
  }, [pdfs, subjectMode, selectedSubject]);

  // Group PDFs by Subject -> Chapter and sort everything in Ascending Order (A to Z)
  const pdfTree = useMemo(() => {
    const rawTree: Record<string, Record<string, StoredPdf[]>> = {};
    
    // Sort pdfs by name first
    const sortedPdfs = [...pdfs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    sortedPdfs.forEach((pdf) => {
      const subj = pdf.subject || "Uncategorized";
      const chap = pdf.chapter || "General";
      if (!rawTree[subj]) rawTree[subj] = {};
      if (!rawTree[subj][chap]) rawTree[subj][chap] = [];
      rawTree[subj][chap].push(pdf);
    });

    // Sort subjects alphabetically
    const sortedSubjects = Object.keys(rawTree).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const tree: Record<string, Record<string, StoredPdf[]>> = {};

    sortedSubjects.forEach((subj) => {
      tree[subj] = {};
      // Sort chapters alphabetically
      const sortedChapters = Object.keys(rawTree[subj]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      sortedChapters.forEach((chap) => {
        tree[subj][chap] = rawTree[subj][chap];
      });
    });

    return tree;
  }, [pdfs]);

  // Search filter for the sidebar tree (matches subject, chapter or file name)
  const q = search.trim().toLowerCase();
  const filteredTree = useMemo(() => {
    if (!q) return pdfTree;
    const out: Record<string, Record<string, StoredPdf[]>> = {};
    for (const [subj, chapters] of Object.entries(pdfTree)) {
      const subjMatch = subj.toLowerCase().includes(q);
      const chOut: Record<string, StoredPdf[]> = {};
      for (const [chap, files] of Object.entries(chapters)) {
        const chapMatch = chap.toLowerCase().includes(q);
        const matched =
          subjMatch || chapMatch ? files : files.filter((f) => f.name.toLowerCase().includes(q));
        if (matched.length > 0) chOut[chap] = matched;
      }
      if (Object.keys(chOut).length > 0) out[subj] = chOut;
    }
    return out;
  }, [pdfTree, q]);

  // Flat, sidebar-ordered list of files for previous / next navigation
  const flatFiles = useMemo(
    () => Object.values(pdfTree).flatMap((chapters) => Object.values(chapters).flat()),
    [pdfTree],
  );
  const activeIdx = flatFiles.findIndex((f) => f.id === activeId);

  const activeSubject = activePdf ? activePdf.subject || "Uncategorized" : "";
  const activeChapter = activePdf ? activePdf.chapter || "General" : "";

  // Reveal the active file's folders in the tree whenever it changes
  useEffect(() => {
    if (!activeSubject) return;
    setOpenSubjects((p) => (p[activeSubject] ? p : { ...p, [activeSubject]: true }));
    const key = `${activeSubject}__${activeChapter}`;
    setOpenChapters((p) => (p[key] ? p : { ...p, [key]: true }));
  }, [activeId, activeSubject, activeChapter]);

  // Scroll the sidebar so the active file is visible (only when the active file changes)
  useEffect(() => {
    if (!activeId) return;
    const t = setTimeout(() => {
      document
        .querySelector(`[data-pdf-id="${CSS.escape(activeId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, 80);
    return () => clearTimeout(t);
  }, [activeId]);

  // Remember whether the desktop sidebar was collapsed
  useEffect(() => {
    try {
      const v = localStorage.getItem("notes:sidebar");
      if (v !== null) setShowLibrary(v === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLibrary = useCallback((v: boolean) => {
    setShowLibrary(v);
    try {
      localStorage.setItem("notes:sidebar", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // Opens the sidebar on whichever layout is active (drawer on mobile, panel on desktop)
  const openSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
    toggleLibrary(true);
  }, [toggleLibrary]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const registerEl = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(page, el);
    else pageEls.current.delete(page);
  }, []);

  const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = "smooth") => {
    const c = scrollRef.current;
    const el = pageEls.current.get(page);
    if (!c || !el) return;
    c.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior });
  }, []);

  /* ------------------------------- Autosave ------------------------------- */

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pdfId = activeIdRef.current;
    if (!pdfId || dirtyRef.current.size === 0) return;

    const pages = Array.from(dirtyRef.current);
    dirtyRef.current.clear();
    try {
      setSaveState("saving");
      await Promise.all(pages.map((p) => saveAnnotations(pdfId, p, annRef.current[p] || [])));
      setSaveState("saved");
    } catch (e) {
      console.error("Autosave failed", e);
      pages.forEach((p) => dirtyRef.current.add(p));
      setSaveState("error");
      // keep trying every 5 s until the server accepts the pages (they stay marked as unsaved)
      if (!saveTimer.current) {
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null;
          flushSave();
        }, 5000);
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
    }, 1000);
  }, [flushSave]);

  const changePage = useCallback(
    (page: number, next: Annotation[], snapshot: boolean) => {
      if (snapshot) {
        undoRef.current.push({ page, items: annRef.current[page] || [] });
        if (undoRef.current.length > 100) undoRef.current.shift();
        setUndoLen(undoRef.current.length);
      }
      annRef.current = { ...annRef.current, [page]: next };
      setAnnotations(annRef.current);
      dirtyRef.current.add(page);
      scheduleSave();
    },
    [scheduleSave],
  );

  const undo = useCallback(() => {
    const last = undoRef.current.pop();
    setUndoLen(undoRef.current.length);
    if (!last) return;
    annRef.current = { ...annRef.current, [last.page]: last.items };
    setAnnotations(annRef.current);
    dirtyRef.current.add(last.page);
    scheduleSave();
    scrollToPage(last.page);
  }, [scheduleSave, scrollToPage]);

  // Save pending changes when leaving the tab / closing the window
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    const onUnload = () => {
      flushSave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      flushSave();
    };
  }, [flushSave]);

  // Ctrl+Z = undo (but not while typing in a text box / input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  /* ------------------------------ Open a PDF ------------------------------ */

  const openPdf = useCallback(
    async (id: string, startPage?: number) => {
      const seq = ++openSeq.current;
      await flushSave();
      setOpening(true);
      setOpenError("");
      readyRef.current = false;

      try {
        const rec = await getPdf(id);
        if (!rec) throw new Error("This PDF was not found in storage.");

        const pdfjs = (await loadPdfjs()) as typeof import("pdfjs-dist") & {
          getDocument: (options: any) => { promise: Promise<any> };
        };
        // Fetch PDF from filesystem via relativePath URL
        const pdfRes = await fetch(`/api/pdf-file?path=${encodeURIComponent(rec.relativePath)}`);
        if (!pdfRes.ok) throw new Error("Could not load PDF physical file from server.");
        const buf = await pdfRes.arrayBuffer();

        const loaded = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
        if (seq !== openSeq.current) {
          loaded.destroy();
          return;
        }

        const [anns, bms, firstPage] = await Promise.all([
          getAnnotationsForPdf(id),
          listBookmarks(id),
          loaded.getPage(1),
        ]);
        if (seq !== openSeq.current) {
          loaded.destroy();
          return;
        }

        const vp = firstPage.getViewport({ scale: 1 });
        const start = Math.min(Math.max(startPage ?? rec.lastPage ?? 1, 1), loaded.numPages);

        activeIdRef.current = id;
        numPagesRef.current = loaded.numPages;
        startPageRef.current = start;
        annRef.current = anns;
        undoRef.current = [];
        dirtyRef.current.clear();

        setUndoLen(0);
        setAnnotations(anns);
        setBookmarks(bms);
        setAspect0(vp.height / vp.width);
        setNumPages(loaded.numPages);
        setCurrentPage(start);
        setPageInput(String(start));
        setSaveState("saved");
        setActiveId(id);
        setDoc(loaded);
      } catch (e) {
        console.error("Could not open PDF", e);
        setOpenError(
          e instanceof Error ? e.message : "Could not open this PDF. The file may be damaged.",
        );
      } finally {
        if (seq === openSeq.current) setOpening(false);
      }
    },
    [flushSave],
  );

  // Open a file from the sidebar (also closes the mobile drawer)
  const selectFile = useCallback(
    (id: string) => {
      setMobileSidebarOpen(false);
      if (id !== activeIdRef.current) openPdf(id);
    },
    [openPdf],
  );

  function expandAll() {
    const subs: Record<string, boolean> = {};
    const chaps: Record<string, boolean> = {};
    Object.entries(pdfTree).forEach(([subj, chapters]) => {
      subs[subj] = true;
      Object.keys(chapters).forEach((ch) => {
        chaps[`${subj}__${ch}`] = true;
      });
    });
    setOpenSubjects(subs);
    setOpenChapters(chaps);
  }

  function collapseAll() {
    const subs: Record<string, boolean> = {};
    Object.keys(pdfTree).forEach((subj) => {
      subs[subj] = false;
    });
    setOpenSubjects(subs);
  }

  // Free the previous pdf.js document when switching / leaving
  useEffect(() => {
    return () => {
      doc?.destroy();
    };
  }, [doc]);

  // Load library once, then open ?pdf=...&page=... if present
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listPdfs();
        if (cancelled) return;
        setPdfs(list);

        const params = new URLSearchParams(window.location.search);
        const wanted = params.get("pdf");
        const wantedPage = Number(params.get("page")) || undefined;
        if (wanted && list.some((p) => p.id === wanted)) {
          openPdf(wanted, wantedPage);
        } else if (wanted) {
          setOpenError("The PDF linked from this flashcard is no longer in your library.");
        }
      } catch (e) {
        console.error(e);
        setOpenError("Could not connect to the database.");
      } finally {
        if (!cancelled) setLibLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openPdf]);

  /* ----------------------------- Layout helpers --------------------------- */

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);

  const hasWidth = containerW > 0;
  useEffect(() => {
    if (!doc || !hasWidth) return;
    const t = setTimeout(() => {
      scrollToPage(startPageRef.current, "auto");
      readyRef.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, [doc, hasWidth, scrollToPage]);

  const onScroll = useCallback(() => {
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      const c = scrollRef.current;
      if (!c || !readyRef.current) return;

      const top = c.scrollTop + 60;
      let current = 1;
      for (let n = 1; n <= numPagesRef.current; n++) {
        const el = pageEls.current.get(n);
        if (!el) continue;
        current = n;
        if (el.offsetTop + el.offsetHeight > top) break;
      }

      setCurrentPage(current);
      setPageInput(String(current));

      if (lastPageTimer.current) clearTimeout(lastPageTimer.current);
      lastPageTimer.current = setTimeout(() => {
        const id = activeIdRef.current;
        if (id) updatePdf(id, { lastPage: current }).catch(() => undefined);
      }, 1000);
    });
  }, []);

  function goToPage(raw: string) {
    const n = Math.min(Math.max(parseInt(raw, 10) || 1, 1), numPagesRef.current || 1);
    setPageInput(String(n));
    scrollToPage(n);
  }

  function changeZoom(next: number) {
    const z = Math.min(3, Math.max(0.5, Math.round(next * 100) / 100));
    const p = currentPage;
    setZoom(z);
    setTimeout(() => scrollToPage(p, "auto"), 60);
  }

  /* ----------------------------- Upload / delete -------------------------- */

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    processSelectedFiles(files);
  }

  function processSelectedFiles(files: File[]) {
    const valid = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (valid.length === 0) {
      showToast("Please select valid PDF files.");
      return;
    }

    setPendingFiles(valid);
    
    // Set default values for modal
    const subs = Object.keys(PREDEFINED_SYLLABUS).sort();
    if (subs.length > 0) {
      setSubjectMode("select");
      setSelectedSubject(subs[0]);
      const chs = PREDEFINED_SYLLABUS[subs[0]] || [];
      if (chs.length > 0) {
        setChapterMode("select");
        setSelectedChapter(chs[0]);
      } else {
        setChapterMode("new");
        setSelectedChapter("");
        setNewChapter("");
      }
    } else {
      setSubjectMode("new");
      setSelectedSubject("");
      setNewSubject("");
      setChapterMode("new");
      setSelectedChapter("");
      setNewChapter("");
    }
  }

  // Drag and Drop handlers for upload zone
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Ignore leave events fired when moving between child elements
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      processSelectedFiles(droppedFiles);
    }
  }

  async function handleUploadSubmit(e: FormEvent) {
    e.preventDefault();
    const finalSubject = (subjectMode === "new" ? newSubject : selectedSubject).trim();
    const finalChapter = (chapterMode === "new" ? newChapter : selectedChapter).trim();

    if (pendingFiles.length === 0 || !finalSubject || !finalChapter) return;

    setUploading(true);
    let firstId = "";
    try {
      for (const file of pendingFiles) {
        const uploadedPdf = await uploadPdfWithMetadata(file, finalSubject, finalChapter);
        if (!firstId) firstId = uploadedPdf.id;
      }
      setPdfs(await listPdfs());
      setPendingFiles([]);
      if (firstId) openPdf(firstId);
      showToast("PDF(s) uploaded successfully ✓");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Could not upload PDF");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(pdf: StoredPdf) {
    const ok = window.confirm(
      `Delete "${pdf.name}" along with its physical file, annotations, and bookmarks?`
    );
    if (!ok) return;

    try {
      if (pdf.id === activeIdRef.current) {
        openSeq.current++;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        dirtyRef.current.clear();
        activeIdRef.current = null;
        setActiveId(null);
        setDoc(null);
        setNumPages(0);
        setAnnotations({});
        setBookmarks([]);
      }
      await deletePdf(pdf.id);
      setPdfs(await listPdfs());
      showToast("PDF deleted successfully");
    } catch (err) {
      console.error(err);
      showToast("Could not delete this PDF");
    }
  }

  // Handle direct file download
  function handleDownload(pdf: StoredPdf, e: React.MouseEvent) {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = `/api/pdf-file?path=${encodeURIComponent(pdf.relativePath)}`;
    link.download = `${pdf.name}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Multi-select actions
  function toggleSelectPdf(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedPdfIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectChapter(files: StoredPdf[], e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedPdfIds((prev) => {
      const next = new Set(prev);
      const allIds = files.map((f) => f.id);
      const allSelected = allIds.every((id) => next.has(id));
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleSelectSubject(chapters: Record<string, StoredPdf[]>, e: React.MouseEvent) {
    e.stopPropagation();
    const allFiles = Object.values(chapters).flat();
    setSelectedPdfIds((prev) => {
      const next = new Set(prev);
      const allIds = allFiles.map((f) => f.id);
      const allSelected = allIds.every((id) => next.has(id));
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedPdfIds.size === 0) return;
    const ok = window.confirm(`Delete ${selectedPdfIds.size} selected PDF(s) along with their physical files and annotations?`);
    if (!ok) return;

    try {
      if (activeIdRef.current && selectedPdfIds.has(activeIdRef.current)) {
        openSeq.current++;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        dirtyRef.current.clear();
        activeIdRef.current = null;
        setActiveId(null);
        setDoc(null);
        setNumPages(0);
        setAnnotations({});
        setBookmarks([]);
      }

      for (const id of selectedPdfIds) {
        await deletePdf(id);
      }

      setPdfs(await listPdfs());
      setSelectedPdfIds(new Set());
      showToast("Selected PDFs deleted successfully");
    } catch (err) {
      console.error(err);
      showToast("Could not delete some PDFs");
    }
  }

  function handleBulkDownload() {
    if (selectedPdfIds.size === 0) return;
    const selectedPdfsList = pdfs.filter((p) => selectedPdfIds.has(p.id));
    selectedPdfsList.forEach((pdf, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = `/api/pdf-file?path=${encodeURIComponent(pdf.relativePath)}`;
        link.download = `${pdf.name}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 300); // Stagger downloads slightly to prevent browser blocking
    });
    showToast(`Downloading ${selectedPdfsList.length} file(s)...`);
  }

  /* ------------------------------- Bookmarks ------------------------------ */

  async function addBookmark() {
    const id = activeIdRef.current;
    if (!id) return;
    const bm: Bookmark = {
      id: uid(),
      pdfId: id,
      page: currentPage,
      label: bmLabel.trim() || `Page ${currentPage}`,
      createdAt: new Date().toISOString(),
    };
    try {
      await putBookmark(bm);
      setBookmarks((list) => [...list, bm].sort((a, b) => a.page - b.page));
      setBmLabel("");
    } catch (err) {
      console.error(err);
      showToast("Could not save bookmark");
    }
  }

  async function removeBookmark(id: string) {
    try {
      await deleteBookmark(id);
      setBookmarks((list) => list.filter((b) => b.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  /* --------------------------------- Render ------------------------------- */

  const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
  const isHighlightTool = tool === "highlight" || tool === "rect";
  const activeColor = isHighlightTool ? hlColor : penColor;
  const presets = isHighlightTool ? HL_PRESETS : PEN_PRESETS;
  const colorEnabled = tool === "pen" || tool === "text" || isHighlightTool;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Mobile backdrop for the drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Collapsed rail (desktop) – always lets you bring the explorer back */}
      {!showLibrary && (
        <div className="hidden shrink-0 lg:block">
          <button
            onClick={() => toggleLibrary(true)}
            className="sticky top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-base shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            title="Show file explorer"
          >
            📁
          </button>
        </div>
      )}

      {/* File manager sidebar: sticky on desktop, slide-over drawer on mobile */}
      <aside
        className={`${
          mobileSidebarOpen ? "fixed inset-y-0 left-0 z-40 flex p-2 lg:p-0" : "hidden"
        } w-80 max-w-[90vw] shrink-0 flex-col lg:sticky lg:bottom-auto lg:left-auto lg:top-4 lg:z-auto lg:h-[calc(100vh-8rem)] lg:max-w-none ${
          showLibrary ? "lg:flex" : "lg:hidden"
        }`}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/90 text-xs font-medium text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-200">
              📥 Drop PDFs to upload
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-1">
            <h2 className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100">
              <span>📁</span> Notes Explorer
            </h2>
            <label
              className="cursor-pointer rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-indigo-500"
              title="Upload PDF (or drag & drop anywhere in this panel)"
            >
              ＋ Upload
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
            {/* Desktop: collapse */}
            <button
              onClick={() => toggleLibrary(false)}
              className="hidden rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:block"
              title="Hide explorer"
            >
              ◀
            </button>
            {/* Mobile: close drawer */}
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files, chapters, subjects..."
              className="w-full rounded-lg border border-slate-200 bg-transparent py-1.5 pl-2.5 pr-7 text-xs placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:text-slate-100"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Tree controls */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {pdfs.length} file{pdfs.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Expand all folders"
              >
                ⊞ Expand
              </button>
              <button
                onClick={collapseAll}
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Collapse all folders"
              >
                ⊟ Collapse
              </button>
            </div>
          </div>

          {/* Bulk Actions Toolbar for Multi-select */}
          {selectedPdfIds.size > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-2 text-xs dark:border-indigo-800 dark:bg-indigo-950/60">
              <span className="font-medium text-indigo-700 dark:text-indigo-300">
                {selectedPdfIds.size} selected
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedPdfIds(new Set())}
                  className="rounded px-2 py-1 text-[11px] text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800"
                  title="Clear selection"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDownload}
                  className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-500"
                  title="Download selected PDFs"
                >
                  📥
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-red-500"
                  title="Delete selected PDFs"
                >
                  🗑️
                </button>
              </div>
            </div>
          )}

          {/* File tree */}
          {libLoading ? (
            <p className="py-4 text-center text-xs text-slate-400">Loading workspace...</p>
          ) : pdfs.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">
              No PDFs yet. Click Upload or drop files here.
            </p>
          ) : Object.keys(filteredTree).length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No matches for “{search}”.</p>
          ) : (
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 font-mono text-xs">
              {Object.entries(filteredTree).map(([subject, chapters]) => {
                const isSubjectOpen = q ? true : (openSubjects[subject] ?? false);
                const allSubFiles = Object.values(chapters).flat();
                const isSubAllSelected =
                  allSubFiles.length > 0 && allSubFiles.every((f) => selectedPdfIds.has(f.id));
                const subHasActive = allSubFiles.some((f) => f.id === activeId);

                return (
                  <div key={subject} className="space-y-0.5">
                    {/* Subject folder */}
                    <div
                      className={`flex items-center justify-between rounded px-2 py-1 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        subHasActive
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <div
                        onClick={() =>
                          setOpenSubjects((prev) => ({ ...prev, [subject]: !isSubjectOpen }))
                        }
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate"
                      >
                        <span className="text-[10px]">{isSubjectOpen ? "▼" : "▶"}</span>
                        <span>{isSubjectOpen ? "📂" : "📁"}</span>
                        <span className="truncate">{subject}</span>
                        <span className="ml-auto text-[10px] font-normal text-slate-400">
                          {allSubFiles.length}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSubAllSelected}
                        onChange={(e) => toggleSelectSubject(chapters, e as any)}
                        className="ml-2 h-3.5 w-3.5 cursor-pointer rounded accent-indigo-600"
                        title="Select all in subject"
                      />
                    </div>

                    {/* Chapters inside subject */}
                    {isSubjectOpen && (
                      <div className="ml-2 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800">
                        {Object.entries(chapters).map(([chapter, files]) => {
                          const chapKey = `${subject}__${chapter}`;
                          const isChapterOpen = q ? true : (openChapters[chapKey] ?? true);
                          const isChapAllSelected =
                            files.length > 0 && files.every((f) => selectedPdfIds.has(f.id));

                          return (
                            <div key={chapter} className="space-y-0.5">
                              <div className="flex items-center justify-between rounded px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                <div
                                  onClick={() =>
                                    setOpenChapters((prev) => ({
                                      ...prev,
                                      [chapKey]: !isChapterOpen,
                                    }))
                                  }
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate"
                                >
                                  <span className="text-[10px]">{isChapterOpen ? "▼" : "▶"}</span>
                                  <span>{isChapterOpen ? "📂" : "📁"}</span>
                                  <span className="truncate">{chapter}</span>
                                  <span className="ml-auto text-[10px] text-slate-400">
                                    ({files.length})
                                  </span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={isChapAllSelected}
                                  onChange={(e) => toggleSelectChapter(files, e as any)}
                                  className="ml-2 h-3.5 w-3.5 cursor-pointer rounded accent-indigo-600"
                                  title="Select all in chapter"
                                />
                              </div>

                              {/* Files inside chapter */}
                              {isChapterOpen && (
                                <div className="ml-2 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800">
                                  {files.map((p) => {
                                    const isSelected = selectedPdfIds.has(p.id);
                                    const isActive = p.id === activeId;
                                    return (
                                      <div
                                        key={p.id}
                                        data-pdf-id={p.id}
                                        onClick={() => selectFile(p.id)}
                                        className={`group flex cursor-pointer items-center justify-between gap-1 rounded px-2 py-1 transition ${
                                          isActive
                                            ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                                            : isSelected
                                              ? "bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-200"
                                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                                        }`}
                                        title={p.name}
                                      >
                                        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => toggleSelectPdf(p.id, e as any)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-3.5 w-3.5 cursor-pointer rounded accent-indigo-600"
                                          />
                                          <span>📄</span>
                                          <span className="truncate">{p.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                                          <button
                                            onClick={(e) => handleDownload(p, e)}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600"
                                            title="Download PDF"
                                          >
                                            📥
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(p);
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-red-500"
                                            title="Delete PDF"
                                          >
                                            🗑
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <section className="min-w-0 flex-1 space-y-3">
        {openError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {openError}
          </p>
        )}

        {!activeId ? (
          <div className="flex h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-400 dark:border-slate-700">
            {opening ? (
              <p>Opening PDF...</p>
            ) : (
              <>
                <p className="mb-1 text-3xl">📝</p>
                <p>Upload a PDF or select one from the tree sidebar to start.</p>
                <button
                  onClick={openSidebar}
                  className={`mt-3 text-xs text-indigo-600 hover:underline ${
                    showLibrary ? "lg:hidden" : ""
                  }`}
                >
                  Show explorer sidebar
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button
                onClick={openSidebar}
                className={`rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  showLibrary ? "lg:hidden" : ""
                }`}
                title="Show explorer sidebar"
              >
                📁 Explorer
              </button>

              {/* Quick previous / next file */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => activeIdx > 0 && selectFile(flatFiles[activeIdx - 1].id)}
                  disabled={activeIdx <= 0}
                  className="h-7 w-7 rounded-md text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Previous file"
                >
                  ‹
                </button>
                <span
                  className="max-w-[9rem] truncate text-xs font-medium text-slate-700 dark:text-slate-200"
                  title={activePdf?.name}
                >
                  {activePdf?.name}
                </span>
                <button
                  onClick={() =>
                    activeIdx >= 0 &&
                    activeIdx < flatFiles.length - 1 &&
                    selectFile(flatFiles[activeIdx + 1].id)
                  }
                  disabled={activeIdx < 0 || activeIdx >= flatFiles.length - 1}
                  className="h-7 w-7 rounded-md text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Next file"
                >
                  ›
                </button>
              </div>

              <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

              <div className="flex gap-1">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id)}
                    title={t.label}
                    className={`h-8 w-8 rounded-lg text-sm transition ${
                      tool === t.id
                        ? "bg-indigo-600 text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>

              <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

              <div className={`flex items-center gap-1 ${colorEnabled ? "" : "opacity-40"}`}>
                {presets.map((c) => (
                  <button
                    key={c}
                    onClick={() => (isHighlightTool ? setHlColor(c) : setPenColor(c))}
                    disabled={!colorEnabled}
                    className={`h-5 w-5 rounded-full border ${
                      activeColor === c ? "ring-2 ring-indigo-500 ring-offset-1" : ""
                    } border-slate-300`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={activeColor}
                  disabled={!colorEnabled}
                  onChange={(e) =>
                    isHighlightTool ? setHlColor(e.target.value) : setPenColor(e.target.value)
                  }
                  className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  title="Custom color"
                />
              </div>

              <div className="flex gap-0.5">
                {["S", "M", "L"].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => setSizeIdx(i)}
                    className={`h-7 w-7 rounded-md text-[11px] font-medium ${
                      sizeIdx === i
                        ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                    title="Pen / highlighter / text size"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

              <button
                onClick={undo}
                disabled={undoLen === 0}
                className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Undo (Ctrl+Z)"
              >
                ↶ Undo
              </button>

              <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <button
                  onClick={() => changeZoom(zoom - 0.25)}
                  className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  −
                </button>
                <span className="w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => changeZoom(zoom + 0.25)}
                  className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ＋
                </button>
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") goToPage(pageInput);
                  }}
                  onBlur={() => setPageInput(String(currentPage))}
                  className="w-12 rounded-md border border-slate-200 bg-transparent px-1 py-1 text-center dark:border-slate-700"
                  inputMode="numeric"
                />
                <span>/ {numPages}</span>
              </div>

              <div className="ml-auto flex items-center gap-2 text-[11px]">
                <span
                  className={
                    saveState === "error"
                      ? "text-red-600"
                      : saveState === "saving"
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }
                >
                  {saveState === "error"
                    ? "Save failed"
                    : saveState === "saving"
                      ? "Saving..."
                      : "Saved ✓"}
                </span>
                <button
                  onClick={() => setShowPanel((v) => !v)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  🔖 Bookmarks ({bookmarks.length})
                </button>
              </div>
            </div>

            {tool === "card" && (
              <p className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                🃏 Card mode: drag a box over the part of the page you want on the flashcard.
              </p>
            )}

            <div className="flex gap-3">
              {/* Pages */}
              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="relative h-[calc(100vh-13rem)] min-h-[420px] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-200 p-4 dark:border-slate-800 dark:bg-slate-950"
              >
                {opening && (
                  <p className="py-4 text-center text-xs text-slate-500">Opening PDF...</p>
                )}
                {doc && containerW > 0 && (
                  <div className="flex flex-col items-center gap-4">
                    {pageNumbers.map((n) => (
                      <PdfPage
                        key={`${activeId}-${n}`}
                        doc={doc}
                        pageNumber={n}
                        cssWidth={pageWidth}
                        defaultAspect={aspect0}
                        scrollRef={scrollRef}
                        items={annotations[n] || EMPTY}
                        tool={tool}
                        penColor={penColor}
                        hlColor={hlColor}
                        sizeIdx={sizeIdx}
                        onItemsChange={changePage}
                        onCrop={(page, image) => setCardDraft({ page, image })}
                        registerEl={registerEl}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Bookmarks panel */}
              {showPanel && (
                <aside className="hidden w-60 shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:block">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    🔖 Bookmarks
                  </h3>
                  <div className="flex gap-1">
                    <input
                      value={bmLabel}
                      onChange={(e) => setBmLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addBookmark();
                      }}
                      placeholder={`Label (page ${currentPage})`}
                      className="min-w-0 flex-1 rounded-md border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
                    />
                    <button
                      onClick={addBookmark}
                      className="rounded-md bg-indigo-600 px-2 text-xs text-white hover:bg-indigo-500"
                    >
                      Add
                    </button>
                  </div>

                  {bookmarks.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      No bookmarks. Add one for the current page.
                    </p>
                  ) : (
                    <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
                      {bookmarks.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <button
                            onClick={() => scrollToPage(b.page)}
                            className="min-w-0 flex-1 truncate text-left text-slate-700 dark:text-slate-200"
                            title={b.label}
                          >
                            <span className="mr-1 text-slate-400">p.{b.page}</span>
                            {b.label}
                          </button>
                          <button
                            onClick={() => removeBookmark(b.id)}
                            className="text-slate-300 hover:text-red-500"
                            aria-label="Delete bookmark"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              )}
            </div>
          </>
        )}
      </section>

      {/* Metadata Input Modal on Upload with Select/New Folder options */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-1 text-base font-bold text-slate-800 dark:text-slate-100">
              📂 Organize PDF Upload
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Selected: {pendingFiles.map((f) => f.name).join(", ")}
            </p>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Subject Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Subject *
                </label>
                {allSubjectsList.length > 0 && subjectMode === "select" ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedSubject}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__NEW__") {
                          setSubjectMode("new");
                          setNewSubject("");
                        } else {
                          setSelectedSubject(val);
                          const chs = PREDEFINED_SYLLABUS[val] || [];
                          if (chs.length > 0) {
                            setChapterMode("select");
                            setSelectedChapter(chs[0]);
                          } else {
                            setChapterMode("new");
                            setSelectedChapter("");
                            setNewChapter("");
                          }
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-slate-700 dark:text-white"
                    >
                      {allSubjectsList.map((s) => (
                        <option key={s} value={s} className="dark:bg-slate-900">
                          📁 {s}
                        </option>
                      ))}
                      <option value="__NEW__" className="dark:bg-slate-900 font-semibold text-indigo-600">
                        ＋ Create new subject...
                      </option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="Enter new subject name..."
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-slate-700 dark:text-white"
                      autoFocus
                    />
                    {allSubjectsList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectMode("select")}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Chapter Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chapter *
                </label>
                {availableChapters.length > 0 && chapterMode === "select" ? (
                  <div className="flex gap-2">
                    <select
                      value={selectedChapter}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "__NEW__") {
                          setChapterMode("new");
                          setNewChapter("");
                        } else {
                          setSelectedChapter(val);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-slate-700 dark:text-white"
                    >
                      {availableChapters.map((c) => (
                        <option key={c} value={c} className="dark:bg-slate-900">
                          📄 {c}
                        </option>
                      ))}
                      <option value="__NEW__" className="dark:bg-slate-900 font-semibold text-indigo-600">
                        ＋ Create new chapter...
                      </option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={newChapter}
                      onChange={(e) => setNewChapter(e.target.value)}
                      placeholder="Enter new chapter name..."
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs dark:border-slate-700 dark:text-white"
                      autoFocus={subjectMode !== "new"}
                    />
                    {availableChapters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setChapterMode("select")}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingFiles([])}
                  disabled={uploading}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {uploading ? "Uploading & Saving..." : "Save PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cardDraft && activePdf && (
        <CardDialog
          image={cardDraft.image}
          source={{ pdfId: activePdf.id, pdfName: activePdf.name, page: cardDraft.page }}
          subject={activePdf.subject}
          topic={activePdf.chapter}
          onClose={() => setCardDraft(null)}
          onSaved={() => {
            setCardDraft(null);
            showToast("Flashcard saved ✓");
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

const EMPTY: Annotation[] = [];