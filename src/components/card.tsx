"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
export function Card({
  id,
  title,
  eyebrow,
  icon,
  children,
  states,
  index,
  onChange,
  tone = "neutral",
  motionKey,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  icon: ReactNode;
  children: ReactNode;
  states: string[];
  index: number;
  onChange: (n: number) => void;
  tone?: string;
  motionKey: string;
}) {
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <section
      className={`card card-${id} tone-${tone}`}
      aria-labelledby={`title-${id}`}
      data-card={id}
    >
      <header className="card-heading">
        <div className="card-title">
          {icon}
          <h2 id={`title-${id}`}>{title}</h2>
        </div>
        {eyebrow && <span className="card-eyebrow">{eyebrow}</span>}
      </header>
      <motion.div
        className="card-body"
        key={motionKey + index}
        initial={
          reduced || first.current
            ? false
            : { opacity: 0, transform: "translateY(4px)" }
        }
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      >
        {children}
      </motion.div>
      <button
        className="card-navigation"
        onClick={() => onChange((index + 1) % states.length)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(
              (index + (e.key === "ArrowLeft" ? -1 : 1) + states.length) %
                states.length,
            );
          }
        }}
        aria-label={`${title}: ${states[index]}. Show ${states[(index + 1) % states.length]}. View ${index + 1} of ${states.length}`}
      >
        <span>{states[index]}</span>
        <span className="state-dots" aria-hidden="true">
          {states.map((s, i) => (
            <i className={i === index ? "active" : ""} key={s} />
          ))}
        </span>
        <ChevronRight size={15} />
      </button>
    </section>
  );
}
