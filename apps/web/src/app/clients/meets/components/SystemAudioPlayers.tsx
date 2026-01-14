"use client";

import { memo, useEffect, useRef } from "react";
import type { Participant } from "../types";
import { isSystemUserId } from "../utils";

interface SystemAudioPlayersProps {
  participants: Map<string, Participant>;
  audioOutputDeviceId?: string;
  muted?: boolean;
}

function SystemAudioPlayers({
  participants,
  audioOutputDeviceId,
  muted = false,
}: SystemAudioPlayersProps) {
  const systemAudioParticipants = Array.from(participants.values()).filter(
    (participant) => isSystemUserId(participant.userId) && participant.audioStream
  );

  return (
    <>
      {systemAudioParticipants.map((participant) => (
        <SystemAudioPlayer
          key={participant.userId}
          stream={participant.audioStream}
          audioOutputDeviceId={audioOutputDeviceId}
          muted={muted}
        />
      ))}
    </>
  );
}

interface SystemAudioPlayerProps {
  stream: MediaStream | null;
  audioOutputDeviceId?: string;
  muted: boolean;
}

function SystemAudioPlayer({
  stream,
  audioOutputDeviceId,
  muted,
}: SystemAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;
    audio.srcObject = stream;
    audio.play().catch((err) => {
      if (err.name !== "AbortError") {
        console.error("[Meets] System audio play error:", err);
      }
    });
  }, [stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!muted && stream && audio.paused) {
      audio.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[Meets] System audio play error:", err);
        }
      });
    }
  }, [muted, stream]);

  useEffect(() => {
    const audio = audioRef.current as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (!audio || !audioOutputDeviceId || !audio.setSinkId) return;
    audio.setSinkId(audioOutputDeviceId).catch((err) => {
      console.error("[Meets] Failed to set system audio output:", err);
    });
  }, [audioOutputDeviceId]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      muted={muted}
      style={{
        width: 0,
        height: 0,
        opacity: 0,
        position: "absolute",
        pointerEvents: "none",
      }}
    />
  );
}

export default memo(SystemAudioPlayers);
