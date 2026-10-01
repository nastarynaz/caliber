"use client";

import { useState } from "react";
import Image from "next/image";
import { Sparkles, MessageSquareText } from "lucide-react";

export function FloatingCandra() {
  const [hovered, setHovered] = useState(false);

  const handleOpen = () => {
    window.dispatchEvent(new CustomEvent("knowledge-hub:open-ai"));
  };

  return (
    <aside
      className="candra-floating-wrap"
      aria-label="Asisten AI Pabrik - Mas Candra"
    >
      <button
        type="button"
        className="candra-floating-btn"
        onClick={handleOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Buka obrolan dengan Mas Candra"
        title="Tanya Mas Candra · Asisten AI Pabrik"
      >
        <div className="candra-pill" aria-hidden="true">
          <span className="candra-pill-title">
            <Sparkles size={11} className="candra-pill-icon" />
            Tanya Mas Candra
          </span>
          <span className="candra-pill-subtitle">
            <span className="candra-status-dot-inline" />
            AI Plant Assistant · Standby
          </span>
        </div>

        <div className="candra-figure-wrap">
          <Image
            src="/Candra.png"
            alt="Mas Candra"
            width={96}
            height={96}
            className="candra-figure-img"
            priority
          />
        </div>
      </button>
    </aside>
  );
}
