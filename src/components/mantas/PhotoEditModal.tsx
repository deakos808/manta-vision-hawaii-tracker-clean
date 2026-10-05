import mantaOrientationExample from "@/assets/manta-orientation-example.jpg";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crop, CropHandle, EditTransform, dragCrop, rotatedSize, wrapAngle } from "@/features/photos/photoPreparation";

// Minimal recovery of ceddcf4's image load / expanded white canvas / crop export.
// Pointer-bearing rotation and eight crop handles follow the ROI pilot. No filters.
type Props = {
  file: File;
  exifOrientation: number;
  remaining: number;
  initialTransform?: EditTransform;
  onClose: () => void;
  onSave: (blob: Blob, transform: EditTransform) => Promise<void>;
};
const handles: { handle: CropHandle; left: string; top: string }[] = [
  { handle: "nw", left: "0%", top: "0%" }, { handle: "n", left: "50%", top: "0%" },
  { handle: "ne", left: "100%", top: "0%" }, { handle: "e", left: "100%", top: "50%" },
  { handle: "se", left: "100%", top: "100%" }, { handle: "s", left: "50%", top: "100%" },
  { handle: "sw", left: "0%", top: "100%" }, { handle: "w", left: "0%", top: "50%" },
];

export default function PhotoEditModal({ file, exifOrientation, remaining, initialTransform, onClose, onSave }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(initialTransform?.rotationDegrees ?? 0);
  const [step, setStep] = useState<"rotate" | "crop">(initialTransform ? "crop" : "rotate");
  const [crop, setCrop] = useState<Crop | null>(initialTransform?.crop ?? null);
  const [fit, setFit] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { handle: CropHandle; x: number; y: number; crop: Crop; scaleX: number; scaleY: number }>(null);
  const rotationDrag = useRef<null | { cx: number; cy: number; bearing: number; angle: number }>(null);
  const size = image ? rotatedSize(image.naturalWidth, image.naturalHeight, rotation) : { width: 1, height: 1 };
  const currentCrop = crop ?? { x: 0, y: 0, ...size };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const url = URL.createObjectURL(file);
    const img = new Image();
    let active = true;
    // Chromium normalizes EXIF orientation when decoding. Do not rotate it twice.
    img.onload = () => {
      if (!active) return;
      if (initialTransform) {
        const expected = rotatedSize(img.naturalWidth, img.naturalHeight, initialTransform.rotationDegrees);
        const c = initialTransform.crop;
        if (img.naturalWidth !== initialTransform.originalWidth || img.naturalHeight !== initialTransform.originalHeight
            || expected.width !== initialTransform.rotatedWidth || expected.height !== initialTransform.rotatedHeight
            || ![c.x, c.y, c.width, c.height].every(Number.isInteger)
            || c.x < 0 || c.y < 0 || c.width < 1 || c.height < 1
            || c.x + c.width > expected.width || c.y + c.height > expected.height) {
          setError("The original photo does not match its saved crop geometry. Cancel to keep the existing photo unchanged.");
        }
      }
      setImage(img);
    };
    img.onerror = () => { if (active) setError("This photo could not be decoded. Cancel and choose a supported JPEG, PNG or WebP photo; HEIC support depends on the app's decoder."); };
    img.src = url;
    return () => { active = false; URL.revokeObjectURL(url); previousFocus?.focus(); };
  }, [file, initialTransform]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    function updateFit() {
      // Display may upscale small sources; full-resolution geometry stays unchanged.
      setFit(Math.min(Math.max(1, wrap!.clientWidth - 32) / size.width, Math.max(1, wrap!.clientHeight - 96) / size.height));
    }
    updateFit();
    const observer = new ResizeObserver(updateFit);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [size.width, size.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    // Bounded preview resolution keeps free rotation responsive; export uses source
    // resolution and the SAME mathematical canvas, never these display dimensions.
    const scale = Math.min(1, 1600 / Math.max(size.width, size.height));
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) { setError("The image canvas is unavailable."); return; }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(canvas.width / size.width, canvas.height / size.height);
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  }, [image, rotation, size.width, size.height]);

  function beginCrop(event: React.PointerEvent, handle: CropHandle) {
    if (saving || error || step !== "crop") return;
    event.preventDefault(); event.stopPropagation();
    const rect = frameRef.current!.getBoundingClientRect();
    drag.current = { handle, x: event.clientX, y: event.clientY, crop: currentCrop, scaleX: size.width / rect.width, scaleY: size.height / rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCrop(event: React.PointerEvent) {
    const d = drag.current;
    if (d) setCrop(dragCrop(d.crop, d.handle, (event.clientX - d.x) * d.scaleX, (event.clientY - d.y) * d.scaleY, size.width, size.height));
  }
  function reset() { setRotation(0); setCrop(null); setStep("rotate"); }
  async function save() {
    if (!image || savingRef.current || error || step !== "crop") return;
    savingRef.current = true; setSaving(true);
    try {
      const output = document.createElement("canvas");
      output.width = currentCrop.width; output.height = currentCrop.height;
      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("Could not create the prepared photo canvas.");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, output.width, output.height);
      // Equivalent to cropping the full expanded canvas, without allocating another
      // full-size intermediate bitmap. All translation values are image pixels.
      ctx.translate(size.width / 2 - currentCrop.x, size.height / 2 - currentCrop.y);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("Could not encode this photo. It may exceed the app's canvas size limit.")), "image/jpeg", 0.94));
      await onSave(blob, {
        version: "rotate-crop-v1", rotationDegrees: rotation,
        originalWidth: image.naturalWidth, originalHeight: image.naturalHeight, exifOrientation,
        rotatedWidth: size.width, rotatedHeight: size.height, crop: currentCrop,
        outputWidth: currentCrop.width, outputHeight: currentCrop.height,
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Photo preparation failed. Cancel and choose the photo again."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function keyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.stopPropagation(); if (!savingRef.current) onClose(); }
    if (event.key === "Tab") {
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
    }
  }

  return (
    <div className="fixed inset-0 z-[300100] bg-black/60 flex items-center justify-center p-2 sm:p-4" onKeyDown={keyDown}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="prepare-photo-title" tabIndex={-1} className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[96dvh] overflow-y-auto p-4 outline-none">
        <h3 id="prepare-photo-title" className="text-lg font-semibold">Prepare photo · {step === "rotate" ? "1. Rotate" : "2. Crop"}</h3>
        <p className="text-sm text-slate-500 truncate">{file.name}{remaining > 1 ? ` · ${remaining} photos remaining` : ""}</p>
        <div className="grid md:grid-cols-[minmax(0,1fr)_210px] gap-4 mt-3">
          <div>
            <div ref={wrapRef} className="h-[48dvh] min-h-[230px] sm:h-[58dvh] bg-slate-100 rounded flex items-center justify-center overflow-hidden">
              {!image && !error && <span className="text-sm">Loading photo…</span>}
              <div ref={frameRef} className="relative shrink-0" style={{ width: size.width * fit, height: size.height * fit, visibility: image ? "visible" : "hidden" }}>
                <canvas ref={canvasRef} className="block w-full h-full bg-white" aria-label="Rotated photo preview" />
                {step === "rotate" && <button type="button" aria-label="Drag to rotate photo; arrow keys rotate by one degree" disabled={saving || !!error} className="absolute left-1/2 -top-11 -translate-x-1/2 w-9 h-9 rounded-full border-2 border-sky-700 bg-white text-sky-800 text-xl touch-none cursor-grab disabled:opacity-50"
                  onPointerDown={event => {
                    const rect = frameRef.current!.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
                    rotationDrag.current = { cx, cy, bearing: Math.atan2(event.clientY - cy, event.clientX - cx), angle: rotation };
                    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
                  }}
                  onPointerMove={event => {
                    const d = rotationDrag.current;
                    if (d) { setRotation(wrapAngle(d.angle + (Math.atan2(event.clientY - d.cy, event.clientX - d.cx) - d.bearing) * 180 / Math.PI)); setCrop(null); }
                  }}
                  onPointerUp={() => { rotationDrag.current = null; }} onPointerCancel={() => { rotationDrag.current = null; }}
                  onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); setRotation(wrapAngle(rotation + (event.key === "ArrowRight" ? 1 : -1))); setCrop(null); } }}
                >↻</button>}
                {step === "crop" && <div className="absolute border-2 border-sky-500 touch-none cursor-move" style={{ left: `${currentCrop.x / size.width * 100}%`, top: `${currentCrop.y / size.height * 100}%`, width: `${currentCrop.width / size.width * 100}%`, height: `${currentCrop.height / size.height * 100}%`, boxShadow: "0 0 0 9999px rgba(15,23,42,.28)", clipPath: "inset(-12px)" }}
                  onPointerDown={event => beginCrop(event, "move")} onPointerMove={moveCrop} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                  {handles.map(({ handle, left, top }) => <button type="button" key={handle} aria-label={`Adjust crop ${handle}`} disabled={saving || !!error} className="absolute w-5 h-5 bg-white border-2 border-sky-600 rounded-sm -translate-x-1/2 -translate-y-1/2 touch-none" style={{ left, top, cursor: `${handle}-resize` }}
                    onPointerDown={event => beginCrop(event, handle)}
                    onKeyDown={event => { const delta = event.shiftKey ? 10 : 1; if (event.key.startsWith("Arrow")) { event.preventDefault(); setCrop(dragCrop(currentCrop, handle, event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0, event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0, size.width, size.height)); } }} />)}
                </div>}
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2">{step === "rotate" ? "Drag the circular handle to orient the head up and tail down." : "Drag the crop edges or corners; drag inside the box to move it."}</p>
            <p className="text-xs text-slate-500">Rotation {rotation.toFixed(1)}° · {step === "crop" ? `${currentCrop.width} × ${currentCrop.height} pixels` : "Fit to window"}</p>
          </div>
          <aside className="text-sm text-slate-600">
            <h4 className="font-medium text-slate-800">Target orientation &amp; crop</h4>
            <img
              src={mantaOrientationExample}
              alt="Ventral manta photo showing head-up orientation and a close crop"
              width={500}
              height={292}
              className="w-full max-w-[210px] h-auto object-contain mx-auto my-3 bg-white rounded"
            />
            <p className="font-medium mb-2">Head up • Tail down</p>
            <p>Crop closely around the manta. Remove excess water while keeping the body and identifying markings visible.</p>
          </aside>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="border rounded px-3 py-2 disabled:opacity-50" disabled={saving} onClick={onClose}>Cancel{remaining > 1 ? " / Skip photo" : ""}</button>
          <button type="button" className="border rounded px-3 py-2 disabled:opacity-50" disabled={saving || !image || !!error} onClick={reset}>Reset</button>
          {step === "crop" && <button type="button" className="border rounded px-3 py-2 disabled:opacity-50" disabled={saving || !!error} onClick={() => { setStep("rotate"); setCrop(null); }}>Back to Rotate</button>}
          <button type="button" className="bg-sky-700 text-white rounded px-3 py-2 disabled:opacity-50" disabled={saving || !image || !!error} onClick={() => step === "rotate" ? setStep("crop") : void save()}>{saving ? "Saving photo…" : step === "rotate" ? "Continue to Crop" : "Save / Continue"}</button>
        </div>
      </div>
    </div>
  );
}
