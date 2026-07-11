"use client";

import React, { useEffect, useRef, useState } from "react";
import { color, radius } from "@conclave/ui-tokens";
import { createTypedMove } from "@conclave/apps-sdk";
import { HEAD_FONT, PrimaryButton, type GameViewProps } from "./gameUi";
import { accentFor } from "./covers";
import type { SpinWheelMove } from "./moves";

type WheelPlayer = { id: string; name: string; included: boolean };

type SpinWheelPublic = {
  phase: "idle" | "spinning";
  serverNow: number;
  players: WheelPlayer[];
  eligibleCount: number;
  spinId: number;
  spinDeadline: number | null;
  spinDurationMs: number;
  targetRotationDeg: number;
  winnerId: string | null;
  winnerName: string | null;
};

type SpinWheelMe = Record<string, never>;

const WHEEL_COLORS = [
  "#F95F4A",
  "#3B8EE0",
  "#22A578",
  "#E0863A",
  "#8B7BF0",
  "#E06392",
  "#6AAA64",
  "#C08552",
  "#4EC9C0",
  "#D64545",
];

const EXTRA_SPIN_TURNS = 5;

export default function SpinWheelGame({
  pub,
  isAdmin,
  readOnly = false,
  move,
}: GameViewProps<SpinWheelPublic, SpinWheelMe>) {
  const send = createTypedMove<SpinWheelMove>(move);
  const canControl = isAdmin && !readOnly;

  const wheel = pub.players.filter((p) => p.included);
  const segmentDeg = wheel.length > 0 ? 360 / wheel.length : 0;

  const rotationRef = useRef(pub.targetRotationDeg);
  const seenSpinId = useRef(pub.spinId);
  const [rotation, setRotation] = useState(pub.targetRotationDeg);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (pub.spinId === seenSpinId.current) return;
    seenSpinId.current = pub.spinId;
    const currentMod = ((rotationRef.current % 360) + 360) % 360;
    let delta = pub.targetRotationDeg - currentMod;
    if (delta <= 0) delta += 360;
    const next = rotationRef.current + EXTRA_SPIN_TURNS * 360 + delta;
    rotationRef.current = next;
    setAnimate(true);
    setRotation(next);
  }, [pub.spinId, pub.targetRotationDeg]);

  const showWinner = pub.phase === "idle" && pub.winnerId != null;
  const winner = showWinner ? pub.players.find((p) => p.id === pub.winnerId) : undefined;

  const gradient =
    wheel.length > 0
      ? `conic-gradient(${wheel
          .map((p, i) => {
            const from = i * segmentDeg;
            const to = from + segmentDeg;
            const c = WHEEL_COLORS[i % WHEEL_COLORS.length];
            return `${c} ${from}deg ${to}deg`;
          })
          .join(", ")})`
      : color.surfaceRaised;

  const accent = accentFor("spin-wheel");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "4px 2px" }}>
      <div style={{ position: "relative", width: 264, height: 264, margin: "10px auto 0" }}>
        {/* soft accent glow behind the wheel */}
        <div
          style={{
            position: "absolute",
            inset: -24,
            borderRadius: "50%",
            background: accent,
            opacity: 0.16,
            filter: "blur(36px)",
            pointerEvents: "none",
          }}
        />

        {/* fixed pointer, does not rotate with the wheel */}
        <div
          style={{
            position: "absolute",
            top: -4,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.45))",
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              margin: "0 auto",
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderTop: `18px solid ${accent}`,
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              margin: "-3px auto 0",
              borderRadius: "50%",
              background: accent,
              border: `2px solid ${color.surface}`,
            }}
          />
        </div>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: gradient,
            border: `4px solid ${color.surface}`,
            outline: `2px solid ${color.border}`,
            boxShadow:
              "0 10px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.15) inset",
            transform: `rotate(${rotation}deg)`,
            transition: animate
              ? `transform ${pub.spinDurationMs}ms cubic-bezier(0.12, 0.82, 0.16, 1)`
              : "none",
          }}
        >
          {/* divider lines between segments */}
          {wheel.length > 1
            ? wheel.map((p, i) => (
                <div
                  key={`div-${p.id}`}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "50%",
                    height: 2,
                    background: "rgba(0,0,0,0.28)",
                    transformOrigin: "0 50%",
                    // conic-gradient measures its angle from "up" (12 o'clock);
                    // this line's native rest direction is "right" (3 o'clock),
                    // so it needs a -90deg correction to land on the same boundary.
                    transform: `rotate(${i * segmentDeg - 90}deg)`,
                    pointerEvents: "none",
                  }}
                />
              ))
            : null}

          {/* glossy highlight, purely decorative */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)",
              pointerEvents: "none",
            }}
          />

          {wheel.map((p, i) => {
            const mid = i * segmentDeg + segmentDeg / 2;
            return (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: "50%",
                  height: 0,
                  transformOrigin: "0 50%",
                  // Same -90deg correction as the divider lines above, so each
                  // name sits centered in its own conic-gradient wedge.
                  transform: `rotate(${mid - 90}deg)`,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 24,
                    top: -8,
                    fontFamily: HEAD_FONT,
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#fff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                    whiteSpace: "nowrap",
                    maxWidth: 88,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* hub */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: `linear-gradient(160deg, ${color.surfaceRaised}, ${color.surface})`,
            border: `2px solid ${color.border}`,
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
          }}
        />
      </div>

      {showWinner ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: radius.md,
            background: color.accentSoft,
            border: `1.5px solid ${color.accent}`,
            textAlign: "center",
          }}
        >
          <span style={{ fontFamily: HEAD_FONT, fontSize: 15, color: color.text }}>
            {winner?.name ?? pub.winnerName}
          </span>
          <span style={{ fontSize: 12, color: color.accent }}>lands the spin</span>
        </div>
      ) : null}

      {canControl ? (
        <PrimaryButton
          full
          disabled={pub.phase === "spinning" || pub.eligibleCount < 2}
          onClick={() => send({ type: "spin" })}
        >
          {pub.phase === "spinning" ? "Spinning…" : "Spin"}
        </PrimaryButton>
      ) : null}
      {pub.eligibleCount < 2 ? (
        <p style={{ fontSize: 12, color: color.textFaint, textAlign: "center", margin: 0 }}>
          Need at least 2 names on the wheel
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <p style={{ fontSize: 11, color: color.textFaint, fontFamily: HEAD_FONT, margin: "4px 0 0" }}>
          On the wheel
        </p>
        {pub.players.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!canControl || pub.phase === "spinning"}
            onClick={() => send({ type: "toggle", target: p.id })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: radius.md,
              border: `1.5px solid ${p.included ? color.accent : color.border}`,
              background: color.surfaceRaised,
              color: color.text,
              cursor: !canControl || pub.phase === "spinning" ? "default" : "pointer",
              opacity: p.included ? 1 : 0.5,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: radius.sm,
                border: `1.5px solid ${p.included ? color.accent : color.border}`,
                background: p.included ? color.accent : "transparent",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13.5, textAlign: "left", flex: 1 }}>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
