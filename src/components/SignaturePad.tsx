import React, { useRef, useState, useEffect } from 'react';
import { SquarePen, RotateCcw, Check, Lock } from 'lucide-react';

interface SignaturePadProps {
  onSave: (base64Png: string) => void;
  disabled?: boolean;
}

export default function SignaturePad({ onSave, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset scales & clear canvas
    ctx.strokeStyle = '#1E2D5A'; // Navy theme signature ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const handleResize = () => {
      // Keep canvas drawing buffer matched to client elements
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.strokeStyle = '#1E2D5A';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    handleResize();
    const observer = new ResizeObserver(() => handleResize());
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    return () => observer.disconnect();
  }, [canvasRef]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: e.nativeEvent.clientX - rect.left,
        y: e.nativeEvent.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Prevent scrolling on mobile touch screens while drawing
    if (e.cancelable) e.preventDefault();

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    // Export PNG base64 representation
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="flex flex-col border border-slate-300 rounded-lg bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <SquarePen className="w-3.5 h-3.5 text-slate-500" />
          Authenticate Signature Draw pad
        </span>
        {disabled && (
          <span className="flex items-center gap-1 text-red-500 text-[10px] uppercase tracking-wider font-bold bg-red-50 px-1.5 py-0.5 rounded">
            <Lock className="w-2.5 h-2.5" /> Locked
          </span>
        )}
      </div>
      <div className="relative h-28 bg-slate-50/50">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`w-full h-full cursor-crosshair touch-none ${disabled ? 'opacity-45 pointer-events-none' : ''}`}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs pointer-events-none italic font-sans select-none">
            Use your mouse or finger to draw your signature inside this ledger box
          </div>
        )}
      </div>
      <div className="flex justify-end gap-1.5 border-t border-slate-200 bg-slate-50 p-2">
        <button
          type="button"
          onClick={clearCanvas}
          disabled={disabled || isEmpty}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3 h-3" /> Clear
        </button>
        <button
          type="button"
          onClick={saveSignature}
          disabled={disabled || isEmpty}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-[#1E2D5A] border border-[#1E2D5A] rounded hover:bg-[#2b3c72] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-3 h-3" /> Apply Sign-off
        </button>
      </div>
    </div>
  );
}
