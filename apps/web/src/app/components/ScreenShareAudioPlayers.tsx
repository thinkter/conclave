"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useMeetVolume } from "../hooks/useMeetVolume";
import type { Participant } from "../lib/types";

interface ScreenShareAudioPlayersProps {
  participants: Map<string, Participant>;
  currentUserId: string;
  activeScreenShareId: string | null;
  audioOutputDeviceId?: string;
  onAutoplayBlocked?: () => void;
  onPlaybackStarted?: () => void;
  playbackAttemptToken?: number;
}

const hasLiveAudio = (stream: MediaStream | null | undefined) => {
  const track = stream?.getAudioTracks()[0];
  return Boolean(track && track.readyState === "live");
};

function ScreenShareAudioPlayers({
  participants,
  currentUserId,
  activeScreenShareId,
  audioOutputDeviceId,
  onAutoplayBlocked,
  onPlaybackStarted,
  playbackAttemptToken,
}: ScreenShareAudioPlayersProps) {
  const screenShareAudioParticipants = Array.from(participants.values()).filter(
    (participant) =>
      participant.userId !== currentUserId &&
      hasLiveAudio(participant.screenShareAudioStream) &&
      (!activeScreenShareId ||
        participant.screenShareProducerId === activeScreenShareId)
  );

  return (
    <>
      {screenShareAudioParticipants.map((participant) => (
        <ScreenShareAudioPlayer
          key={
            participant.screenShareAudioProducerId ??
            `${participant.userId}-screen-audio`
          }
          stream={participant.screenShareAudioStream}
          audioOutputDeviceId={audioOutputDeviceId}
          onAutoplayBlocked={onAutoplayBlocked}
          onPlaybackStarted={onPlaybackStarted}
          playbackAttemptToken={playbackAttemptToken}
        />
      ))}
    </>
  );
}

interface ScreenShareAudioPlayerProps {
  stream: MediaStream | null;
  audioOutputDeviceId?: string;
  onAutoplayBlocked?: () => void;
  onPlaybackStarted?: () => void;
  playbackAttemptToken?: number;
}

function ScreenShareAudioPlayer({
  stream,
  audioOutputDeviceId,
  onAutoplayBlocked,
  onPlaybackStarted,
  playbackAttemptToken,
}: ScreenShareAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { meetVolume } = useMeetVolume();

  const attemptPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !stream) return;
    audio.play()
      .then(() => {
        onPlaybackStarted?.();
      })
      .catch((err) => {
        if (err.name === "NotAllowedError") {
          onAutoplayBlocked?.();
          return;
        }
        if (err.name !== "AbortError") {
          console.error("[Meets] Screen share audio play error:", err);
        }
      });
  }, [onAutoplayBlocked, onPlaybackStarted, stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!stream) {
      if (audio.srcObject) {
        audio.srcObject = null;
      }
      return;
    }

    audio.srcObject = stream;
    attemptPlay();
    return () => {
      if (audio.srcObject === stream) {
        audio.srcObject = null;
      }
    };
  }, [stream, attemptPlay]);

  useEffect(() => {
    if (playbackAttemptToken == null || playbackAttemptToken < 1) return;
    attemptPlay();
  }, [playbackAttemptToken, attemptPlay]);

  useEffect(() => {
    const audio = audioRef.current as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (!audio || !audioOutputDeviceId || !audio.setSinkId) return;
    audio.setSinkId(audioOutputDeviceId).catch((err) => {
      console.error("[Meets] Failed to set screen share audio output:", err);
    });
  }, [audioOutputDeviceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = meetVolume;
  }, [meetVolume]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
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

export default memo(ScreenShareAudioPlayers);
