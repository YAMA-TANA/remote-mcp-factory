'use client';

import { useEffect, useRef, useState } from 'react';

type Kind = 'email' | 'phone';

const KEY = 73;
const DATA: Record<Kind, number[]> = {
  email: [58, 60, 57, 57, 38, 59, 61, 9, 57, 32, 42, 38, 58, 63, 42, 103, 42, 38, 36],
  phone: [121, 113, 121, 100, 127, 120, 123, 125, 100, 125, 127, 112, 126],
};

function decode(kind: Kind): string {
  return DATA[kind].map((value) => String.fromCharCode(value ^ KEY)).join('');
}

export default function ProtectedContact({ kind }: { kind: Kind }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const text = decode(kind);
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const cssWidth = kind === 'email' ? 320 : 220;
    const cssHeight = 42;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.font = '600 17px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    context.textBaseline = 'middle';
    context.fillStyle = '#f6f7f9';
    context.fillText(text, 0, cssHeight / 2);
  }, [kind]);

  async function copy() {
    await navigator.clipboard.writeText(decode(kind));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="protectedContact">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={kind === 'email' ? 'Support email address displayed visually' : 'Support telephone number displayed visually'}
      />
      <button className="ghost" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}
