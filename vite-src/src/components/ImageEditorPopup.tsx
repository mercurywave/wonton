import { useState, useRef, useCallback, useEffect } from "react";
import { RotateCcw, Brush, Eraser } from "lucide-react";
import styles from "./ImageEditorPopup.module.css";

const COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Black", value: "#000000" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
];

interface ImageEditorPopupProps {
  imageSrc: string;
  onClose: () => void;
  onSave: (editedBlob: Blob) => void;
}

export default function ImageEditorPopup({ imageSrc, onClose, onSave }: ImageEditorPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Load image and set up canvas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const container = containerRef.current;
      if (!container) return;

      const maxW = window.innerWidth * 0.9;
      const maxH = window.innerHeight * 0.9;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const cw = img.width * scale;
      const ch = img.height * scale;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      ctxRef.current = context;

      context.drawImage(img, 0, 0, cw, ch);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handleReset = useCallback(() => {
    const img = imageRef.current;
    const context = ctxRef.current;
    const canvas = canvasRef.current;
    if (!img || !context || !canvas) return;
    context.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
  }, []);

  const drawLine = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const context = ctxRef.current;
      if (!context) return;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      context.lineWidth = tool === "eraser" ? brushSize * 3 : brushSize;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    },
    [color, brushSize, tool]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDrawing(true);
      const pos = getCanvasPos(e);
      setLastPos(pos);
    },
    [getCanvasPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !lastPos) return;
      const pos = getCanvasPos(e);
      drawLine(lastPos, pos);
      setLastPos(pos);
    },
    [isDrawing, lastPos, getCanvasPos, drawLine]
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    setLastPos(null);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as React.MouseEvent<HTMLCanvasElement>;
      setIsDrawing(true);
      const pos = getCanvasPos(mouseEvent);
      setLastPos(pos);
    },
    [getCanvasPos]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing || !lastPos) return;
      const touch = e.touches[0];
      const mouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as React.MouseEvent<HTMLCanvasElement>;
      const pos = getCanvasPos(mouseEvent);
      drawLine(lastPos, pos);
      setLastPos(pos);
    },
    [isDrawing, lastPos, getCanvasPos, drawLine]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDrawing(false);
    setLastPos(null);
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      "image/png"
    );
  }, [onSave]);

  return (
    <div className={styles.overlay}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolButton}
          onClick={() => {
            setTool("brush");
            setIsDrawing(false);
            setLastPos(null);
          }}
          title="Brush tool"
          disabled={tool === "brush"}
        >
          <Brush size={18} />
        </button>
        <button
          className={styles.toolButton}
          onClick={() => {
            setTool("eraser");
            setIsDrawing(false);
            setLastPos(null);
          }}
          title="Eraser tool"
          disabled={tool === "eraser"}
        >
          <Eraser size={18} />
        </button>

        <div className={styles.colorSwatches}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={`${styles.swatch} ${color === c.value ? styles.swatchActive : ""}`}
              style={{ backgroundColor: c.value }}
              onClick={() => {
                setColor(c.value);
                setIsDrawing(false);
                setLastPos(null);
              }}
              title={c.name}
              type="button"
            />
          ))}
        </div>

        <div className={styles.brushSize}>
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(e) => {
              setBrushSize(Number(e.target.value));
              setIsDrawing(false);
              setLastPos(null);
            }}
            aria-label="Brush size"
          />
        </div>

        <button
          className={styles.toolButton}
          onClick={handleReset}
          title="Reset to original"
        >
          <RotateCcw size={18} />
        </button>

        <div className={styles.toolbarActions}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>

      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>
    </div>
  );
}
