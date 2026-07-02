import { createWatchDoc } from "../core/doc/index";
import { defineApp } from "../../../sdk/registry/index";
import { WatchWebApp } from "./components/WatchWebApp";

export const watchApp = defineApp({
  id: "watch",
  name: "Watch together",
  description: "Synced YouTube playback",
  createDoc: createWatchDoc,
  web: WatchWebApp,
});

export { WatchWebApp };
