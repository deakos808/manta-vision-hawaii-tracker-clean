import React, { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  src: string;
  fileName: string;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
};

type Crop = { x: number; y: number; w: number; h: number };
type DragMode = "move" | "resize";
type PresetKey = "shallow" | "deep" | "blue" | "spots";
type EraserStroke = { x: number; y: number; radius: number };
type BrushCursor = { left: number; top: number; size: number };
type CanvasSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{value}{suffix}</span>
      </div>
      <input
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function PhotoEditModal({ open, src, fileName, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startCrop: Crop } | null>(null);
  const paintingRef = useRef(false);
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [temperature, setTemperature] = useState(0);
  const [tint, setTint] = useState(0);
  const [texture, setTexture] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [dehaze, setDehaze] = useState(0);
  const [backgroundRemove, setBackgroundRemove] = useState(false);
  const [backgroundTolerance, setBackgroundTolerance] = useState(80);
  const [eraserEnabled, setEraserEnabled] = useState(false);
  const [brushSize, setBrushSize] = useState(28);
  const [eraserStrokes, setEraserStrokes] = useState<EraserStroke[]>([]);
  const [brushCursor, setBrushCursor] = useState<BrushCursor | null>(null);
  const [whiteBalanceEnabled, setWhiteBalanceEnabled] = useState(false);
  const [whiteBalance, setWhiteBalance] = useState<{ r: number; g: number; b: number } | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setTemperature(0);
    setTint(0);
    setTexture(0);
    setClarity(0);
    setDehaze(0);
    setBackgroundRemove(false);
    setBackgroundTolerance(80);
    setEraserEnabled(false);
    setBrushSize(28);
    setEraserStrokes([]);
    setBrushCursor(null);
    setWhiteBalanceEnabled(false);
    setWhiteBalance(null);
    setCropMode(false);
    setCrop(null);
    setZoom(1);
    setSaving(false);
    setError(null);
  }, [open, src]);

  useEffect(() => {
    if (!open || !src) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      draw();
    };
    img.onerror = () => setError("Could not load this photo for editing.");
    img.src = src;
  }, [open, src]);

  useEffect(() => {
    if (!open || !imageRef.current) return;
    draw();
  }, [open, rotation, brightness, contrast, temperature, tint, texture, clarity, dehaze, backgroundRemove, backgroundTolerance, eraserStrokes, whiteBalance, crop]);

  useEffect(() => {
    if (!open) return;

    function updateFitScale() {
      const wrap = previewWrapRef.current;
      if (!wrap || !canvasSize.width || !canvasSize.height) return;
      const availableWidth = Math.max(120, wrap.clientWidth - 24);
      const availableHeight = Math.max(120, wrap.clientHeight - 24);
      const next = Math.min(1, availableWidth / canvasSize.width, availableHeight / canvasSize.height);
      setFitScale(Number.isFinite(next) && next > 0 ? next : 1);
    }

    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    if (previewWrapRef.current) observer.observe(previewWrapRef.current);
    return () => observer.disconnect();
  }, [open, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dx = ((event.clientX - drag.startX) / rect.width) * canvas.width;
      const dy = ((event.clientY - drag.startY) / rect.height) * canvas.height;
      const minSize = 40;

      setCrop((prev) => {
        const base = prev ?? drag.startCrop;
        if (drag.mode === "move") {
          return {
            ...base,
            x: clamp(drag.startCrop.x + dx, 0, canvas.width - base.w),
            y: clamp(drag.startCrop.y + dy, 0, canvas.height - base.h),
          };
        }

        return {
          ...base,
          w: clamp(drag.startCrop.w + dx, minSize, canvas.width - drag.startCrop.x),
          h: clamp(drag.startCrop.h + dy, minSize, canvas.height - drag.startCrop.y),
        };
      });
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!open) return null;

  function applyPreset(key: PresetKey) {
    if (key === "shallow") {
      setBrightness(108);
      setContrast(118);
      setTemperature(18);
      setTint(4);
      setTexture(18);
      setClarity(14);
      setDehaze(12);
    } else if (key === "deep") {
      setBrightness(116);
      setContrast(128);
      setTemperature(42);
      setTint(8);
      setTexture(22);
      setClarity(22);
      setDehaze(28);
    } else if (key === "blue") {
      setBrightness(110);
      setContrast(122);
      setTemperature(55);
      setTint(10);
      setTexture(12);
      setClarity(16);
      setDehaze(24);
    } else {
      setBrightness(104);
      setContrast(142);
      setTemperature(10);
      setTint(0);
      setTexture(38);
      setClarity(34);
      setDehaze(18);
    }
  }

  function draw() {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const radians = (rotation * Math.PI) / 180;
    const maxEdge = 1100;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));

    canvas.width = Math.max(1, Math.ceil(width * cos + height * sin));
    canvas.height = Math.max(1, Math.ceil(width * sin + height * cos));
    setCanvasSize({ width: canvas.width, height: canvas.height });

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.filter = `brightness(${clamp(brightness, 40, 180)}%) contrast(${clamp(contrast, 40, 180)}%)`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(radians);
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();

    applyPixelAdjustments(ctx, canvas.width, canvas.height);
    drawEraserStrokes(ctx);
  }

  function applyPixelAdjustments(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const original = texture || clarity ? new Uint8ClampedArray(data) : null;

    const tempR = 1 + temperature / 350;
    const tempB = 1 - temperature / 350;
    const tintG = 1 - tint / 450;
    const tintRB = 1 + tint / 900;
    const dehazeAmount = dehaze / 100;
    const clarityAmount = clarity / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (whiteBalance) {
        r *= whiteBalance.r;
        g *= whiteBalance.g;
        b *= whiteBalance.b;
      }

      r *= tempR * tintRB;
      g *= tintG;
      b *= tempB * tintRB;

      if (dehazeAmount !== 0) {
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * (1 + dehazeAmount * 0.85) - dehazeAmount * 8;
        g = avg + (g - avg) * (1 + dehazeAmount * 0.85) - dehazeAmount * 8;
        b = avg + (b - avg) * (1 + dehazeAmount * 0.85) - dehazeAmount * 8;
      }

      if (clarityAmount !== 0) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const mid = (lum - 128) * clarityAmount * 0.55;
        r += mid;
        g += mid;
        b += mid;
      }

      data[i] = clamp(Math.round(r), 0, 255);
      data[i + 1] = clamp(Math.round(g), 0, 255);
      data[i + 2] = clamp(Math.round(b), 0, 255);
    }

    if (texture && original) {
      const amount = texture / 100;
      const copy = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const idx = (y * width + x) * 4;
          for (let c = 0; c < 3; c += 1) {
            const center = copy[idx + c];
            const blur = (
              copy[idx - 4 + c] +
              copy[idx + 4 + c] +
              copy[idx - width * 4 + c] +
              copy[idx + width * 4 + c]
            ) / 4;
            data[idx + c] = clamp(Math.round(center + (center - blur) * amount * 0.9), 0, 255);
          }
        }
      }
    }

    if (backgroundRemove) {
      removeEdgeBackground(data, width, height, backgroundTolerance);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function removeEdgeBackground(data: Uint8ClampedArray, width: number, height: number, tolerance: number) {
    const samples: number[][] = [];
    const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

    const addSample = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const nearWhite = r > 242 && g > 242 && b > 242;
      const blueWater = b > r + 8 || g > r + 8;
      if (!nearWhite && blueWater) samples.push([r, g, b]);
    };

    for (let x = 0; x < width; x += step) {
      addSample(x, 0);
      addSample(x, height - 1);
    }
    for (let y = 0; y < height; y += step) {
      addSample(0, y);
      addSample(width - 1, y);
    }
    if (!samples.length) return;

    const avg = samples.reduce(
      (acc, sample) => [acc[0] + sample[0], acc[1] + sample[1], acc[2] + sample[2]],
      [0, 0, 0],
    ).map((v) => v / samples.length);
    const limit = tolerance * tolerance;
    const seen = new Uint8Array(width * height);
    const queue: number[] = [];

    const enqueue = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const p = y * width + x;
      if (seen[p]) return;
      const i = p * 4;
      const dr = data[i] - avg[0];
      const dg = data[i + 1] - avg[1];
      const db = data[i + 2] - avg[2];
      if ((dr * dr + dg * dg + db * db) > limit) return;
      seen[p] = 1;
      queue.push(p);
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    for (let q = 0; q < queue.length; q += 1) {
      const p = queue[q];
      const x = p % width;
      const y = Math.floor(p / width);
      const i = p * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }
  }

  function sampleWhitePoint(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!whiteBalanceEnabled) return;

    const point = canvasPoint(event);
    if (!point) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
    const r = Math.max(1, pixel[0]);
    const g = Math.max(1, pixel[1]);
    const b = Math.max(1, pixel[2]);
    const target = Math.max(r, g, b);

    setWhiteBalance({
      r: clamp(target / r, 0.5, 2.5),
      g: clamp(target / g, 0.5, 2.5),
      b: clamp(target / b, 0.5, 2.5),
    });
  }

  function canvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width - 1)),
      y: Math.floor(clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height - 1)),
    };
  }

  function updateBrushCursor(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!eraserEnabled) {
      setBrushCursor(null);
      return;
    }

    const canvas = canvasRef.current;
    const wrap = previewWrapRef.current;
    if (!canvas || !wrap) return;

    const rect = canvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scale = Math.max(rect.width / canvas.width, rect.height / canvas.height);
    const displaySize = Math.max(8, brushSize * 2 * scale);

    setBrushCursor({
      left: event.clientX - wrapRect.left + wrap.scrollLeft,
      top: event.clientY - wrapRect.top + wrap.scrollTop,
      size: displaySize,
    });
  }

  function addEraserPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    if (!point) return;
    setEraserStrokes((prev) => [...prev, { ...point, radius: brushSize }]);
  }

  function handleCanvasMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (eraserEnabled) {
      event.preventDefault();
      updateBrushCursor(event);
      paintingRef.current = true;
      addEraserPoint(event);
      return;
    }

    if (whiteBalanceEnabled) {
      sampleWhitePoint(event);
    }
  }

  function handleCanvasMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!eraserEnabled) return;
    updateBrushCursor(event);
    if (!paintingRef.current) return;
    addEraserPoint(event);
  }

  function stopPainting() {
    paintingRef.current = false;
  }

  function stopPaintingAndHideCursor() {
    stopPainting();
    setBrushCursor(null);
  }

  function beginPan(event: React.MouseEvent<HTMLDivElement>) {
    if (cropMode || eraserEnabled || whiteBalanceEnabled) return;
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    event.preventDefault();
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
    };
  }

  function movePan(event: React.MouseEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const wrap = previewWrapRef.current;
    if (!pan || !wrap) return;
    wrap.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    wrap.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }

  function stopPan() {
    panRef.current = null;
  }

  function zoomBy(delta: number) {
    setZoom((value) => clamp(Number((value + delta).toFixed(2)), 0.25, 4));
  }

  function handleViewportWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.altKey && !event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.15 : -0.15);
  }

  function drawEraserStrokes(ctx: CanvasRenderingContext2D) {
    if (!eraserStrokes.length) return;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    for (const stroke of eraserStrokes) {
      ctx.beginPath();
      ctx.arc(stroke.x, stroke.y, stroke.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function defaultCrop(): Crop | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const insetX = Math.round(canvas.width * 0.1);
    const insetY = Math.round(canvas.height * 0.1);
    return {
      x: insetX,
      y: insetY,
      w: Math.max(40, canvas.width - insetX * 2),
      h: Math.max(40, canvas.height - insetY * 2),
    };
  }

  function startCropDrag(event: React.MouseEvent<HTMLDivElement>, mode: DragMode) {
    event.preventDefault();
    event.stopPropagation();
    const startCrop = crop ?? defaultCrop();
    if (!startCrop) return;
    setCrop(startCrop);
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startCrop,
    };
  }

  function cropStyle() {
    const canvas = canvasRef.current;
    const wrap = previewWrapRef.current;
    if (!canvas || !wrap || !crop) return null;

    const rect = canvas.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    return {
      left: rect.left - wrapRect.left + wrap.scrollLeft + crop.x * scaleX,
      top: rect.top - wrapRect.top + wrap.scrollTop + crop.y * scaleY,
      width: crop.w * scaleX,
      height: crop.h * scaleY,
    };
  }

  function resetAdjustmentsAfterBake() {
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setTemperature(0);
    setTint(0);
    setTexture(0);
    setClarity(0);
    setDehaze(0);
    setBackgroundRemove(false);
    setBackgroundTolerance(80);
    setEraserEnabled(false);
    setBrushSize(28);
    setEraserStrokes([]);
    setBrushCursor(null);
    setWhiteBalanceEnabled(false);
    setWhiteBalance(null);
  }

  function bakeCanvasToImage(out: HTMLCanvasElement, afterBake?: () => void) {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      resetAdjustmentsAfterBake();
      setCropMode(false);
      setCrop(null);
      afterBake?.();
      setTimeout(draw, 0);
    };
    img.src = out.toDataURL("image/jpeg", 0.95);
  }

  function applyRotationNow() {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return;

    const out = document.createElement("canvas");
    out.width = sourceCanvas.width;
    out.height = sourceCanvas.height;
    const outCtx = out.getContext("2d");
    if (!outCtx) return;

    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(sourceCanvas, 0, 0);
    bakeCanvasToImage(out);
  }

  function applyCropNow() {
    const sourceCanvas = canvasRef.current;
    const activeCrop = crop ?? defaultCrop();
    if (!sourceCanvas || !activeCrop) return;

    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(activeCrop.w));
    out.height = Math.max(1, Math.round(activeCrop.h));
    const outCtx = out.getContext("2d");
    if (!outCtx) return;

    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(
      sourceCanvas,
      activeCrop.x,
      activeCrop.y,
      activeCrop.w,
      activeCrop.h,
      0,
      0,
      out.width,
      out.height,
    );
    bakeCanvasToImage(out);
  }

  async function saveEditedPhoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError(null);

    try {
      const sourceCanvas = canvas;
      const out = document.createElement("canvas");
      const outCtx = out.getContext("2d");
      if (!outCtx) throw new Error("Could not render edited photo.");

      const activeCrop = cropMode && crop ? crop : null;
      out.width = Math.max(1, Math.round(activeCrop?.w ?? sourceCanvas.width));
      out.height = Math.max(1, Math.round(activeCrop?.h ?? sourceCanvas.height));
      outCtx.fillStyle = "#ffffff";
      outCtx.fillRect(0, 0, out.width, out.height);

      if (activeCrop) {
        outCtx.drawImage(
          sourceCanvas,
          activeCrop.x,
          activeCrop.y,
          activeCrop.w,
          activeCrop.h,
          0,
          0,
          out.width,
          out.height,
        );
      } else {
        outCtx.drawImage(sourceCanvas, 0, 0);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Could not render edited photo."));
        }, "image/jpeg", 0.92);
      });

      await onSave(blob);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Could not save edited photo.");
    } finally {
      setSaving(false);
    }
  }

  const activeCropStyle = cropStyle();
  const hasPendingRotation = rotation !== 0;
  const rotationControlsLocked = cropMode || eraserStrokes.length > 0 || backgroundRemove;
  const cropControlsLocked = hasPendingRotation || eraserStrokes.length > 0 || backgroundRemove;
  const adjustmentControlsLocked = cropMode;
  const maskControlsLocked = cropMode || hasPendingRotation;

  return (
    <div className="fixed inset-0 z-[400000] flex items-center justify-center bg-black/50 p-3">
      <div className="flex h-[min(94vh,920px)] w-[min(1240px,98vw)] flex-col overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Edit Photo</h3>
            <div className="mt-0.5 max-w-[70vw] truncate text-xs text-slate-500">{fileName}</div>
          </div>
          <button type="button" className="text-2xl leading-none hover:text-slate-700" onClick={onClose} aria-label="Close photo editor">
            &times;
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          <div className="grid gap-2 md:grid-cols-[1.1fr_1fr_1fr]">
            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Presets</div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <button type="button" className="rounded border px-2 py-2 text-xs hover:bg-slate-50 disabled:opacity-50" disabled={adjustmentControlsLocked} onClick={() => applyPreset("shallow")}>
                  Shallow Water
                </button>
                <button type="button" className="rounded border px-2 py-2 text-xs hover:bg-slate-50 disabled:opacity-50" disabled={adjustmentControlsLocked} onClick={() => applyPreset("deep")}>
                  Deep Water
                </button>
                <button type="button" className="rounded border px-2 py-2 text-xs hover:bg-slate-50 disabled:opacity-50" disabled={adjustmentControlsLocked} onClick={() => applyPreset("blue")}>
                  Blue Correction
                </button>
                <button type="button" className="rounded border px-2 py-2 text-xs hover:bg-slate-50 disabled:opacity-50" disabled={adjustmentControlsLocked} onClick={() => applyPreset("spots")}>
                  Spot Boost
                </button>
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Crop</div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm disabled:opacity-50 ${cropMode ? "bg-sky-600 text-white" : "border hover:bg-slate-50"}`}
                  disabled={cropControlsLocked && !cropMode}
                  onClick={() => {
                    setCropMode((value) => {
                      const next = !value;
                      if (next && !crop) setCrop(defaultCrop());
                      return next;
                    });
                  }}
                >
                  Crop
                </button>
                <button type="button" className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" onClick={applyCropNow} disabled={!cropMode && !crop}>
                  Apply Crop
                </button>
                <button type="button" className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" onClick={() => setCrop(defaultCrop())} disabled={!cropMode}>
                  Reset crop
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={!cropMode && !crop}
                  onClick={() => {
                  setCropMode(false);
                  setCrop(null);
                }}
              >
                Cancel crop
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {cropMode
                  ? "Drag the box, pull the blue handle, then apply crop."
                  : cropControlsLocked
                    ? "Apply rotation or clear background/eraser edits before cropping."
                    : "Crop locks other edit tools until it is applied or canceled."}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Rotate</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => setRotation((v) => clamp(v - 90, -180, 180))}
                  disabled={rotationControlsLocked}
                >
                  Left
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => setRotation((v) => clamp(v + 90, -180, 180))}
                  disabled={rotationControlsLocked}
                >
                  Right
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={applyRotationNow}
                  disabled={!hasPendingRotation}
                >
                  Apply
                </button>
              </div>
              <div className="mt-2">
                {slider({ label: "Fine rotation", value: rotation, min: -180, max: 180, suffix: "°", disabled: rotationControlsLocked, onChange: setRotation })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Apply rotation before crop/background/eraser work.
                {rotationControlsLocked ? " Clear crop/background/eraser edits to rotate again." : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">
              Drag to pan. Use buttons or Ctrl/⌘/Option + mouse wheel to zoom.
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button type="button" className="rounded border bg-white px-3 py-1 hover:bg-slate-50" onClick={() => zoomBy(-0.25)}>
                -
              </button>
              <button type="button" className="rounded border bg-white px-3 py-1 hover:bg-slate-50" onClick={() => setZoom(1)}>
                Fit
              </button>
              <button type="button" className="rounded border bg-white px-3 py-1 hover:bg-slate-50" onClick={() => setZoom(1 / Math.max(fitScale, 0.01))}>
                100%
              </button>
              <button type="button" className="rounded border bg-white px-3 py-1 hover:bg-slate-50" onClick={() => zoomBy(0.25)}>
                +
              </button>
              <span className="min-w-12 text-right text-xs text-slate-500">{Math.round(fitScale * zoom * 100)}%</span>
            </div>
          </div>

          <div
            ref={previewWrapRef}
            className={`relative h-[360px] min-h-[300px] shrink-0 overflow-auto rounded-md border bg-slate-100 md:h-[38vh] ${cropMode || eraserEnabled || whiteBalanceEnabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            onMouseDown={beginPan}
            onMouseMove={movePan}
            onMouseUp={stopPan}
            onMouseLeave={() => {
              stopPan();
              stopPaintingAndHideCursor();
            }}
            onWheel={handleViewportWheel}
          >
            {error ? (
              <div className="grid h-full min-h-[260px] place-items-center text-sm text-red-600">{error}</div>
            ) : (
              <div
                className="relative grid min-h-full min-w-full place-items-center p-3"
                style={{
                  width: Math.max(previewWrapRef.current?.clientWidth || 0, canvasSize.width * fitScale * zoom + 24),
                  height: Math.max(previewWrapRef.current?.clientHeight || 0, canvasSize.height * fitScale * zoom + 24),
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={`rounded bg-white shadow-sm ${whiteBalanceEnabled || eraserEnabled ? "cursor-crosshair" : ""}`}
                  style={{
                    width: canvasSize.width * fitScale * zoom,
                    height: canvasSize.height * fitScale * zoom,
                    maxWidth: "none",
                    maxHeight: "none",
                  }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={stopPainting}
                  onMouseLeave={stopPaintingAndHideCursor}
                  title={eraserEnabled ? "Drag to erase remaining background" : whiteBalanceEnabled ? "Click a white or neutral area to set white balance" : "Photo preview"}
                />
                {eraserEnabled && brushCursor ? (
                  <div
                    className="pointer-events-none absolute rounded-full border border-white shadow-[0_0_0_1px_rgba(15,23,42,0.75)]"
                    style={{
                      left: brushCursor.left - brushCursor.size / 2,
                      top: brushCursor.top - brushCursor.size / 2,
                      width: brushCursor.size,
                      height: brushCursor.size,
                    }}
                  />
                ) : null}
                {cropMode && activeCropStyle ? (
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    style={activeCropStyle}
                    onMouseDown={(event) => startCropDrag(event, "move")}
                  >
                    <div
                      className="absolute bottom-[-7px] right-[-7px] h-4 w-4 cursor-se-resize rounded-full border border-white bg-sky-600"
                      onMouseDown={(event) => startCropDrag(event, "resize")}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.25fr_1fr]">
            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tone</div>
              <div className="space-y-3">
                {slider({ label: "Brightness", value: brightness, min: 40, max: 180, suffix: "%", disabled: adjustmentControlsLocked, onChange: setBrightness })}
                {slider({ label: "Contrast", value: contrast, min: 40, max: 180, suffix: "%", disabled: adjustmentControlsLocked, onChange: setContrast })}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Color</div>
              <div className="space-y-3">
                {slider({ label: "Temperature", value: temperature, min: -100, max: 100, disabled: adjustmentControlsLocked, onChange: setTemperature })}
                {slider({ label: "Tint", value: tint, min: -100, max: 100, disabled: adjustmentControlsLocked, onChange: setTint })}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Detail</div>
              <div className="space-y-3">
                {slider({ label: "Texture", value: texture, min: -100, max: 100, disabled: adjustmentControlsLocked, onChange: setTexture })}
                {slider({ label: "Clarity", value: clarity, min: -100, max: 100, disabled: adjustmentControlsLocked, onChange: setClarity })}
                {slider({ label: "Dehaze", value: dehaze, min: 0, max: 100, disabled: adjustmentControlsLocked, onChange: setDehaze })}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Background</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm disabled:opacity-50 ${backgroundRemove ? "bg-sky-600 text-white" : "border hover:bg-slate-50"}`}
                  disabled={maskControlsLocked}
                  onClick={() => setBackgroundRemove((value) => !value)}
                >
                  {backgroundRemove ? "Remover on" : "Remove bg"}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-2 text-sm disabled:opacity-50 ${eraserEnabled ? "bg-sky-600 text-white" : "border hover:bg-slate-50"}`}
                  disabled={maskControlsLocked}
                  onClick={() => {
                    setEraserEnabled((value) => !value);
                    setWhiteBalanceEnabled(false);
                  }}
                >
                  {eraserEnabled ? "Eraser brush on" : "Eraser brush"}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  {slider({
                    label: "Tolerance",
                    value: backgroundTolerance,
                    min: 35,
                    max: 180,
                    disabled: maskControlsLocked,
                    onChange: setBackgroundTolerance,
                  })}
                </div>
                <div>
                  {slider({
                    label: "Brush size",
                    value: brushSize,
                    min: 4,
                    max: 90,
                    disabled: maskControlsLocked,
                    onChange: setBrushSize,
                  })}
                </div>
              </div>
              {eraserStrokes.length ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setEraserStrokes([])}
                >
                  Clear eraser strokes
                </button>
              ) : null}
              {maskControlsLocked ? (
                <div className="mt-2 text-xs text-slate-500">Apply rotation or finish crop before background cleanup.</div>
              ) : null}
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">White Balance</div>
              <button
                type="button"
                className={`w-full rounded px-3 py-2 text-sm disabled:opacity-50 ${whiteBalanceEnabled ? "bg-sky-600 text-white" : "border hover:bg-slate-50"}`}
                disabled={cropMode}
                onClick={() => {
                  setWhiteBalanceEnabled((value) => !value);
                  setEraserEnabled(false);
                }}
              >
                {whiteBalanceEnabled ? "Click photo to set white" : "Pick white point"}
              </button>
              {whiteBalance ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setWhiteBalance(null)}
                >
                  Clear white balance
                </button>
              ) : null}
              <button
                type="button"
                className="mt-2 w-full rounded border px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  setRotation(0);
                  setBrightness(100);
                  setContrast(100);
                  setTemperature(0);
                  setTint(0);
                  setTexture(0);
                  setClarity(0);
                  setDehaze(0);
                  setBackgroundRemove(false);
                  setBackgroundTolerance(80);
                  setEraserEnabled(false);
                  setBrushSize(28);
                  setEraserStrokes([]);
                  setBrushCursor(null);
                  setWhiteBalanceEnabled(false);
                  setWhiteBalance(null);
                  setCropMode(false);
                  setCrop(null);
                }}
              >
                Reset edits
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" className="rounded border px-3 py-2" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="rounded bg-sky-600 px-3 py-2 text-white disabled:opacity-50" onClick={saveEditedPhoto} disabled={saving || !!error}>
            {saving ? "Saving..." : "Save Edited Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
