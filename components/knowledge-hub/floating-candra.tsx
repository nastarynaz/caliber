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
          <span className="candra-pill-subtitle">AI Plant Assistant · Standby</span>
        </div>

        <div className="candra-avatar-frame">
          <Image
            src="/Candra.png"
            alt="Mas Candra"
            width={52}
            height={52}
            className="candra-avatar-img"
            priority
          />
          <span className="candra-status-dot" title="Online & Terhubung ke Dokumen Kilang" />
        </div>
      </button>
    </aside>
  );
}
