import { Platform } from "react-native";
import type {
  BackgroundEffect,
  CreateManagedCameraTrackOptions,
  ManagedCameraTrack,
} from "./background-blur.types";

const implementation =
  Platform.OS === "web"
    ? require("./background-blur.web")
    : require("./background-blur.native");

export const createManagedCameraTrack = implementation.createManagedCameraTrack as (
  options: CreateManagedCameraTrackOptions,
) => Promise<ManagedCameraTrack>;

export type { BackgroundEffect, ManagedCameraTrack } from "./background-blur.types";
