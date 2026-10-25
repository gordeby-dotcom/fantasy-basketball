"use client";

import { useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

// Tap a dotted-underlined word to see a one-line explainer in a bottom sheet.
export function Term({ k, children }: { k: GlossaryKey; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[k];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-help underline decoration-dotted decoration-2 underline-offset-4"
      >
        {children ?? entry.term}
      </button>
      {open && <Sheet title={entry.term} text={entry.text} onClose={() => setOpen(false)} />}
    </>
  );
}

export function Sheet({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-md rounded-t-2xl bg-card p-5 text-left shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-muted">{text}</p>
        <button onClick={onClose} className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-white">
          Got it
        </button>
      </div>
    </div>
  );
}
