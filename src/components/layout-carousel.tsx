"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LayoutItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  thumbnail?: string;
};

type LayoutCarouselProps = {
  items: LayoutItem[];
  isAuthenticated?: boolean;
};

export function LayoutCarousel({ items, isAuthenticated = false }: LayoutCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const goToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    const el = itemRefs.current[clamped];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      setActiveIndex(clamped);
    }
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;

    let closestIndex = activeIndex;
    let minDistance = Number.POSITIVE_INFINITY;

    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(cardCenter - trackCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex !== activeIndex) {
      setActiveIndex(closestIndex);
    }
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => handleScroll();
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  });

  return (
    <div className="layout-carousel">
      <div className="layout-carousel__controls">
        <button className="layout-carousel__nav" onClick={() => goToIndex(activeIndex - 1)} aria-label="Precedente">
          &lt;
        </button>
        <button className="layout-carousel__nav" onClick={() => goToIndex(activeIndex + 1)} aria-label="Successivo">
          &gt;
        </button>
      </div>
      <div className="layout-carousel__viewport">
        <div className="layout-carousel__fade layout-carousel__fade--left" aria-hidden="true" />
        <div className="layout-carousel__fade layout-carousel__fade--right" aria-hidden="true" />
        <div className="layout-carousel__track" ref={trackRef}>
          {items.map((layout, idx) => (
            <Link
              key={layout.id}
              href={
                isAuthenticated
                  ? `/homebooks/new?layout=${encodeURIComponent(layout.id)}`
                  : `/login?next=${encodeURIComponent(`/homebooks/new?layout=${layout.id}`)}`
              }
              className={`layout-card layout-card--carousel layout-card--${layout.id} ${
                activeIndex === idx ? "is-active" : ""
              } ${
                Math.abs(activeIndex - idx) === 1 ? "is-near" : ""
              }`}
              data-layout={layout.id}
              aria-label={
                isAuthenticated
                  ? `Scegli layout ${layout.name} e crea un homebook`
                  : `Accedi per usare il layout ${layout.name}`
              }
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
            >
              {layout.thumbnail ? (
                <div className="layout-thumbnail layout-thumbnail--image">
                  <Image
                    src={layout.thumbnail}
                    alt={`Anteprima del layout ${layout.name}`}
                    width={80}
                    height={60}
                    sizes="80px"
                    style={{ objectFit: "cover" }}
                  />
                </div>
              ) : (
                <div className={`layout-thumbnail ${layout.icon}`} aria-hidden="true" />
              )}
              <div className="layout-badge">Per proprietari registrati</div>
              <h3
                className={`layout-title ${
                  layout.name === "CLASSICO"
                    ? "layout-title--classic"
                    : layout.name === "MODERNO"
                    ? "layout-title--moderno"
                    : layout.name === "RUSTICO"
                    ? "layout-title--rustico"
                    : layout.name === "MEDITERRANEO"
                    ? "layout-title--mediterraneo"
                    : layout.name === "PASTELLO"
                    ? "layout-title--pastello"
                    : layout.name === "ORO"
                    ? "layout-title--oro"
                    : layout.name === "ILLUSTRATIVO"
                    ? "layout-title--illustrativo"
                    : layout.name === "FUTURISTICO"
                    ? "layout-title--futuristico"
                    : layout.name === "ROMANTICO"
                    ? "layout-title--romantico"
                    : layout.name === "NOTTURNO"
                    ? "layout-title--notturno"
                    : ""
                }`}
              >
                {layout.name}
              </h3>
              <p
                className={`layout-desc ${
                  layout.name === "CLASSICO"
                    ? "layout-desc--classic"
                    : layout.name === "MODERNO"
                    ? "layout-desc--moderno"
                    : layout.name === "RUSTICO"
                    ? "layout-desc--rustico"
                    : layout.name === "MEDITERRANEO"
                    ? "layout-desc--mediterraneo"
                    : layout.name === "PASTELLO"
                    ? "layout-desc--pastello"
                    : layout.name === "ORO"
                    ? "layout-desc--oro"
                    : layout.name === "ILLUSTRATIVO"
                    ? "layout-desc--illustrativo"
                    : layout.name === "FUTURISTICO"
                    ? "layout-desc--futuristico"
                    : layout.name === "ROMANTICO"
                    ? "layout-desc--romantico"
                    : layout.name === "NOTTURNO"
                    ? "layout-desc--notturno"
                    : ""
                }`}
              >
                {layout.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
      <div className="layout-carousel__dots" role="tablist" aria-label="Seleziona layout">
        {items.map((_, idx) => (
          <button
            key={idx}
            className={`layout-carousel__dot ${activeIndex === idx ? "is-active" : ""}`}
            onClick={() => goToIndex(idx)}
            aria-label={`Vai al layout ${idx + 1}`}
            aria-pressed={activeIndex === idx}
          />
        ))}
      </div>
    </div>
  );
}
