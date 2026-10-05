"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  uid,
  type Annotation,
  type RectItem,
  type StrokeItem,
  type TextItem,
} from "@/lib/notesDb";

export type Tool = "hand" | "pen" | "highlight" | "rect" | "text" | "eraser" | "card";

// Sizes are fractions of the page width, so they scale with zoom
export const PEN_WIDTHS = [0.0015, 0.003, 0.006];
export const HIGHLIGHT_WIDTHS = [0.008, 0.016, 0.03];
export const TEXT_SIZES = [0.014, 0.02, 0.03];

type Draft =
  | { kind: "stroke"; item: StrokeItem }
  | { kind: "box"; mode: "rect" | "crop"; color: string; a: [number, number]; b: [number, number] }
  | null;

type Props = {
  doc: PDFDocumentProxy;
  pageNumber: number;
  cssWidth: number;
  defaultAspect: number;
  scrollRef: RefObject<HTMLDivElement>;
  items: Annotation[];
  tool: Tool;
  penColor: string;
  hlColor: string;
  sizeIdx: number;
  onItemsChange: (page: number, next: Annotation[], snapshot: boolean) => void;
  onCrop: (page: number, dataUrl: string) => void;
  registerEl: (page: number, el: HTMLDivElement | null) => void;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/* ------------------------------- Drawing ---------------------------------- */

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: Annotation,
  W: number,
  H: number,
) {
  if (it.type === "pen" || it.type === "highlight") {
    const pts = it.points;
    if (pts.length === 0) return;

    ctx.save();
    ctx.globalAlpha = it.type === "highlight" ? 0.35 : 1;
    ctx.strokeStyle = it.color;
    ctx.fillStyle = it.color;
    ctx.lineWidth = Math.max(1, it.width * W);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0] * W, pts[0][1] * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (it.type === "rect") {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = it.color;
    ctx.fillRect(it.x * W, it.y * H, it.w * W, it.h * H);
    ctx.restore();
  }
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitTest(it: Annotation, p: [number, number], W: number, H: number): boolean {
  if (it.type === "text") return false; // text boxes are erased by clicking them
  if (it.type === "rect") {
    return p[0] >= it.x && p[0] <= it.x + it.w && p[1] >= it.y && p[1] <= it.y + it.h;
  }

  const px = p[0] * W;
  const py = p[1] * H;
  const tol = Math.max(8, (it.width * W) / 2 + 4);
  const pts = it.points;

  if (pts.length === 1) {
    return Math.hypot(pts[0][0] * W - px, pts[0][1] * H - py) <= tol;
  }
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegment(
      px,
      py,
      pts[i - 1][0] * W,
      pts[i - 1][1] * H,
      pts[i][0] * W,
      pts[i][1] * H,
    );
    if (d <= tol) return true;
  }
  return false;
}

/* -------------------------------- TextBox --------------------------------- */

function TextBox({
  item,
  pageW,
  pageH,
  interactive,
  eraser,
  autoFocus,
  onChange,
  onDelete,
}: {
  item: TextItem;
  pageW: number;
  pageH: number;
  interactive: boolean;
  eraser: boolean;
  autoFocus: boolean;
  onChange: (next: TextItem, snapshot: boolean) => void;
  onDelete: (snapshot: boolean) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number; first: boolean } | null>(null);

  // Keep the DOM text in sync (initial mount + undo), but never while typing
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerText !== item.text) {
      el.innerText = item.text;
    }
  }, [item.text]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !autoFocus) return;
    el.focus();
  }, [autoFocus]);

  function commitText() {
    const el = elRef.current;
    if (!el) return;
    const text = (el.innerText || "").replace(/\u00a0/g, " ").replace(/\s+$/, "");
    if (!text.trim()) {
      onDelete(item.text !== "");
      return;
    }
    if (text !== item.text) {
      onChange({ ...item, text }, item.text !== "");
    }
  }

  function onHandleDown(e: ReactPointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: item.x, y: item.y, first: true };
  }

  function onHandleMove(e: ReactPointerEvent<HTMLSpanElement>) {
    const d = dragRef.current;
    if (!d) return;
    const x = clamp01(d.x + (e.clientX - d.px) / pageW);
    const y = clamp01(d.y + (e.clientY - d.py) / pageH);
    onChange({ ...item, x: round4(x), y: round4(y) }, d.first);
    d.first = false;
  }

  function onHandleUp() {
    dragRef.current = null;
  }

  return (
    <div
      className="group absolute z-10"
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      {!eraser && (
        <span
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          title="Drag to move"
          className="absolute -left-5 -top-5 h-4 w-4 rounded-full bg-indigo-600 text-white text-[9px] leading-4 text-center cursor-move opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 touch-none select-none"
        >
          ✥
        </span>
      )}
      <div
        ref={elRef}
        contentEditable={!eraser}
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={commitText}
        onPointerDown={(e) => {
          if (eraser) {
            e.preventDefault();
            onDelete(true);
          }
        }}
        className="rounded px-0.5 outline-none ring-1 ring-transparent hover:ring-indigo-300/60 focus:ring-indigo-400"
        style={{
          fontSize: Math.max(8, item.size * pageW),
          color: item.color,
          lineHeight: 1.25,
          minWidth: "2ch",
          minHeight: "1.25em",
          whiteSpace: "pre-wrap",
          cursor: eraser ? "cell" : "text",
        }}
      />
    </div>
  );
}

/* --------------------------------- PdfPage -------------------------------- */

export default function PdfPage({
  doc,
  pageNumber,
  cssWidth,
  defaultAspect,
  scrollRef,
  items,
  tool,
  penColor,
  hlColor,
  sizeIdx,
  onItemsChange,
  onCrop,
  registerEl,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [visible, setVisible] = useState(false);
  const [aspect, setAspect] = useState(defaultAspect);

  const itemsRef = useRef<Annotation[]>(items);
  itemsRef.current = items;
  const draftRef = useRef<Draft>(null);
  const pointerDownRef = useRef(false);
  const erasedRef = useRef(false);
  const focusIdRef = useRef<string | null>(null);

  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const cssHeight = Math.round(cssWidth * aspect);

  // Let the viewer know about this page element (for scrolling / page tracking)
  useEffect(() => {
    registerEl(pageNumber, wrapRef.current);
    return () => registerEl(pageNumber, null);
  }, [pageNumber, registerEl]);

  // Only pages near the viewport are rendered (keeps big PDFs fast)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: scrollRef.current, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRef]);

  // Render the PDF page onto the canvas
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const base = page.getViewport({ scale: 1 });
      const ratio = base.height / base.width;
      setAspect((prev) => (Math.abs(prev - ratio) > 0.001 ? ratio : prev));

      let scale = (cssWidth / base.width) * dpr;
      if (base.width * scale > 3200) scale = 3200 / base.width;
      const viewport = page.getViewport({ scale });

      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      renderTaskRef.current?.cancel();
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    })().catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      if (!cancelled && name !== "RenderingCancelledException") {
        console.error(`Failed to render page ${pageNumber}`, err);
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [visible, doc, pageNumber, cssWidth, dpr]);

  // Redraw the annotation canvas (strokes, boxes, current draft)
  const redraw = useCallback(() => {
    const c = overlayRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, c.width, c.height);
    for (const it of itemsRef.current) drawItem(ctx, it, c.width, c.height);

    const d = draftRef.current;
    if (!d) return;

    if (d.kind === "stroke") {
      drawItem(ctx, d.item, c.width, c.height);
    } else {
      const x = Math.min(d.a[0], d.b[0]) * c.width;
      const y = Math.min(d.a[1], d.b[1]) * c.height;
      const w = Math.abs(d.a[0] - d.b[0]) * c.width;
      const h = Math.abs(d.a[1] - d.b[1]) * c.height;
      ctx.save();
      if (d.mode === "rect") {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = d.color;
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#6366f1";
        ctx.fillStyle = "rgba(99,102,241,0.12)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    c.width = Math.max(1, Math.round(cssWidth * dpr));
    c.height = Math.max(1, Math.round(cssWidth * aspect * dpr));
    redraw();
  }, [visible, cssWidth, aspect, dpr, redraw]);

  useEffect(() => {
    redraw();
  }, [items, redraw]);

  /* ------------------------------ Interaction ----------------------------- */

  function normalized(e: { clientX: number; clientY: number }): [number, number] {
    const r = overlayRef.current!.getBoundingClientRect();
    return [
      clamp01((e.clientX - r.left) / r.width),
      clamp01((e.clientY - r.top) / r.height),
    ];
  }

  function eraseAt(p: [number, number]) {
    const list = itemsRef.current;
    const W = cssWidth;
    const H = cssWidth * aspect;
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitTest(list[i], p, W, H)) {
        const next = list.filter((_, j) => j !== i);
        itemsRef.current = next;
        onItemsChange(pageNumber, next, !erasedRef.current);
        erasedRef.current = true;
        return;
      }
    }
  }

  function finishCrop(a: [number, number], b: [number, number]) {
    const pdfC = pdfCanvasRef.current;
    const ov = overlayRef.current;
    if (!pdfC || !ov) return;

    const x0 = Math.min(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const w = Math.abs(a[0] - b[0]);
    const h = Math.abs(a[1] - b[1]);
    const sw = w * pdfC.width;
    const sh = h * pdfC.height;
    if (sw < 12 || sh < 12) return;

    const out = document.createElement("canvas");
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(pdfC, x0 * pdfC.width, y0 * pdfC.height, sw, sh, 0, 0, out.width, out.height);
    ctx.drawImage(
      ov,
      x0 * ov.width,
      y0 * ov.height,
      w * ov.width,
      h * ov.height,
      0,
      0,
      out.width,
      out.height,
    );
    onCrop(pageNumber, out.toDataURL("image/png"));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === "hand" || tool === "text") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDownRef.current = true;
    const p = normalized(e);

    if (tool === "pen" || tool === "highlight") {
      const isPen = tool === "pen";
      draftRef.current = {
        kind: "stroke",
        item: {
          id: uid(),
          type: isPen ? "pen" : "highlight",
          color: isPen ? penColor : hlColor,
          width: (isPen ? PEN_WIDTHS : HIGHLIGHT_WIDTHS)[sizeIdx],
          points: [[round4(p[0]), round4(p[1])]],
        },
      };
      redraw();
    } else if (tool === "rect" || tool === "card") {
      draftRef.current = {
        kind: "box",
        mode: tool === "rect" ? "rect" : "crop",
        color: hlColor,
        a: p,
        b: p,
      };
    } else if (tool === "eraser") {
      erasedRef.current = false;
      eraseAt(p);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointerDownRef.current) return;
    const p = normalized(e);
    const d = draftRef.current;

    if (tool === "eraser") {
      eraseAt(p);
      return;
    }
    if (!d) return;

    if (d.kind === "stroke") {
      const last = d.item.points[d.item.points.length - 1];
      if (Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) < 0.0005) return;
      d.item.points.push([round4(p[0]), round4(p[1])]);
    } else {
      d.b = p;
    }
    redraw();
  }

  function onPointerUp() {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;

    const d = draftRef.current;
    draftRef.current = null;
    if (!d) {
      redraw();
      return;
    }

    if (d.kind === "stroke") {
      const next = [...itemsRef.current, d.item];
      itemsRef.current = next;
      onItemsChange(pageNumber, next, true);
    } else if (d.mode === "rect") {
      const x = Math.min(d.a[0], d.b[0]);
      const y = Math.min(d.a[1], d.b[1]);
      const w = Math.abs(d.a[0] - d.b[0]);
      const h = Math.abs(d.a[1] - d.b[1]);
      if (w * cssWidth >= 4 && h * cssWidth * aspect >= 4) {
        const rect: RectItem = {
          id: uid(),
          type: "rect",
          color: d.color,
          x: round4(x),
          y: round4(y),
          w: round4(w),
          h: round4(h),
        };
        const next = [...itemsRef.current, rect];
        itemsRef.current = next;
        onItemsChange(pageNumber, next, true);
      }
    } else {
      redraw(); // remove the dashed selection before copying pixels
      finishCrop(d.a, d.b);
    }
    redraw();
  }

  function onCanvasClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (tool !== "text") return;
    const p = normalized(e);
    const item: TextItem = {
      id: uid(),
      type: "text",
      color: penColor,
      x: round4(p[0]),
      y: round4(p[1]),
      size: TEXT_SIZES[sizeIdx],
      text: "",
    };
    focusIdRef.current = item.id;
    const next = [...itemsRef.current, item];
    itemsRef.current = next;
    onItemsChange(pageNumber, next, true);
  }

  function updateText(next: TextItem, snapshot: boolean) {
    focusIdRef.current = null;
    const list = itemsRef.current.map((it) => (it.id === next.id ? next : it));
    itemsRef.current = list;
    onItemsChange(pageNumber, list, snapshot);
  }

  function deleteText(id: string, snapshot: boolean) {
    const list = itemsRef.current.filter((it) => it.id !== id);
    itemsRef.current = list;
    onItemsChange(pageNumber, list, snapshot);
  }

  const cursor =
    tool === "text" ? "text" : tool === "eraser" ? "cell" : tool === "hand" ? "default" : "crosshair";
  const textInteractive = tool === "hand" || tool === "text" || tool === "eraser";
  const texts = items.filter((it): it is TextItem => it.type === "text");

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      className="relative shrink-0 bg-white shadow-md"
      style={{ width: cssWidth, height: cssHeight }}
    >
      {visible ? (
        <>
          <canvas ref={pdfCanvasRef} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 h-full w-full"
            style={{
              cursor,
              pointerEvents: tool === "hand" ? "none" : "auto",
              touchAction: tool === "hand" || tool === "text" ? "auto" : "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onCanvasClick}
          />
          {texts.map((t) => (
            <TextBox
              key={t.id}
              item={t}
              pageW={cssWidth}
              pageH={cssWidth * aspect}
              interactive={textInteractive}
              eraser={tool === "eraser"}
              autoFocus={focusIdRef.current === t.id}
              onChange={updateText}
              onDelete={(snapshot) => deleteText(t.id, snapshot)}
            />
          ))}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          Page {pageNumber}
        </div>
      )}
      <span className="pointer-events-none absolute bottom-1 right-2 rounded bg-black/40 px-1.5 text-[10px] text-white">
        {pageNumber}
      </span>
    </div>
  );
}