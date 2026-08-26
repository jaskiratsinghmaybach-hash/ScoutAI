"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { ZoomIn, ZoomOut, Check, X } from "lucide-react";

interface AvatarCropModalProps {
    /** Object URL of the raw selected image */
    imageSrc: string;
    onCancel: () => void;
    onConfirm: (croppedFile: File) => void;
}

/**
 * Draw the cropped area from imageSrc onto a 512x512 canvas and return as a File.
 * Output is always WebP at quality 0.9, regardless of the input format.
 */
async function getCroppedFile(imageSrc: string, croppedAreaPixels: Area): Promise<File> {
    const OUTPUT_SIZE = 512;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.addEventListener("load", () => resolve(img));
        img.addEventListener("error", reject);
        img.src = imageSrc;
    });

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;

    // Draw the cropped sub-region of the source image scaled into the 512x512 canvas
    ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
    );

    return new Promise<File>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Canvas toBlob failed"));
                    return;
                }
                const file = new File([blob], `avatar-cropped.webp`, { type: "image/webp" });
                resolve(file);
            },
            "image/webp",
            0.9
        );
    });
}

export function AvatarCropModal({ imageSrc, onCancel, onConfirm }: AvatarCropModalProps) {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
        setCroppedAreaPixels(croppedPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;
        setIsExporting(true);
        try {
            const file = await getCroppedFile(imageSrc, croppedAreaPixels);
            onConfirm(file);
        } catch (err) {
            console.error("[AvatarCrop] Export failed:", err);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        /* Full-screen overlay on top of everything, including the continuity modal */
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onCancel}
        >
            <div
                className="relative w-full max-w-sm rounded-xl border border-border bg-neutral-950 shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-white">Crop photo</p>
                        <p className="text-[11px] text-neutral-400">Drag to reposition · scroll to zoom</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1.5 text-neutral-400 hover:text-white transition-colors"
                        aria-label="Cancel"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Cropper area — fixed 280px tall */}
                <div className="relative h-[280px] w-full bg-neutral-900">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        minZoom={1}
                        maxZoom={4}
                        zoomSpeed={0.15}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                        style={{
                            containerStyle: { background: "#0a0a0a" },
                            mediaStyle: {},
                            cropAreaStyle: {
                                border: "2px solid rgba(255,255,255,0.85)",
                                boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
                            },
                        }}
                    />
                </div>

                {/* Zoom Slider */}
                <div className="px-5 py-3 flex items-center gap-3 border-t border-border bg-neutral-900/60">
                    <button
                        type="button"
                        aria-label="Zoom out"
                        onClick={() => setZoom((z) => Math.max(1, z - 0.15))}
                        className="text-neutral-400 hover:text-white transition-colors"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="flex-1 h-1.5 appearance-none rounded-full bg-neutral-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                        aria-label="Zoom"
                    />
                    <button
                        type="button"
                        aria-label="Zoom in"
                        onClick={() => setZoom((z) => Math.min(4, z + 0.15))}
                        className="text-neutral-400 hover:text-white transition-colors"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </button>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-neutral-950">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-all active:scale-95"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isExporting || !croppedAreaPixels}
                        onClick={handleConfirm}
                        className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50 transition-all active:scale-95"
                    >
                        <Check className="h-3.5 w-3.5" />
                        {isExporting ? "Saving…" : "Use this photo"}
                    </button>
                </div>
            </div>
        </div>
    );
}
