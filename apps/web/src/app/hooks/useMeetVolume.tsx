"use client";

import {
  createContext,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { clampMeetVolume, DEFAULT_MEET_VOLUME } from "../lib/meet-volume";

interface MeetVolumeContextValue {
  meetVolume: number;
  setMeetVolume: Dispatch<SetStateAction<number>>;
}

const MeetVolumeContext = createContext<MeetVolumeContextValue>({
  meetVolume: DEFAULT_MEET_VOLUME,
  setMeetVolume: () => {},
});

interface MeetVolumeProviderProps {
  children: ReactNode;
  meetVolume: number;
  setMeetVolume: Dispatch<SetStateAction<number>>;
}

export function MeetVolumeProvider({
  children,
  meetVolume,
  setMeetVolume,
}: MeetVolumeProviderProps) {
  const value = useMemo(
    () => ({
      meetVolume: clampMeetVolume(meetVolume),
      setMeetVolume,
    }),
    [meetVolume, setMeetVolume],
  );

  return (
    <MeetVolumeContext.Provider value={value}>
      {children}
    </MeetVolumeContext.Provider>
  );
}

export function useMeetVolume() {
  return useContext(MeetVolumeContext);
}
