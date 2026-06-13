import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

type MediaPipeDelegate = "GPU" | "CPU";
type ModelWorkerInputSource = "video-frame" | "image-bitmap";
type WorkerVideoFrame = CanvasImageSource & {
  close?: () => void;
};
type WorkerModelFrameSource = ImageBitmap | WorkerVideoFrame;
type WorkerFaceLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
type FaceProcessorRequest =
  | { type: "INIT" }
  | {
      type: "FACE";
      sequence: number;
      processingConfigId: number;
      source: WorkerModelFrameSource;
      sourceKind: ModelWorkerInputSource;
      width: number;
      height: number;
      timestamp: number;
    }
  | { type: "CLOSE" };

const TASKS_VISION_VERSION = "0.10.35";
const TASKS_VISION_WASM_LOCAL_PATH = `/mediapipe/tasks-vision/${TASKS_VISION_VERSION}/wasm`;
const TASKS_FACE_LANDMARKER_MODEL_LOCAL_PATH =
  "/mediapipe/models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const TASKS_FACE_LANDMARKER_MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const TASKS_FACE_LANDMARKER_MODELS = [
  { source: "same-origin", url: TASKS_FACE_LANDMARKER_MODEL_LOCAL_PATH },
  { source: "google-storage", url: TASKS_FACE_LANDMARKER_MODEL_CDN },
] as const;

let faceLandmarker: FaceLandmarker | null = null;
let faceLandmarkerDelegate: MediaPipeDelegate | null = null;
let faceLandmarkerPromise: Promise<FaceLandmarker | null> | null = null;
let gpuCanvas: OffscreenCanvas | null = null;
let closed = false;
const activeSources = new Set<WorkerModelFrameSource>();

const workerScope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<FaceProcessorRequest>) => void) | null;
};

const getErrorDebugSnapshot = (err: unknown) => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return err;
};

const createFaceLandmarker = async (delegate: MediaPipeDelegate) => {
  const fileset = await FilesetResolver.forVisionTasks(
    TASKS_VISION_WASM_LOCAL_PATH,
  );
  let lastError: unknown = null;

  for (const model of TASKS_FACE_LANDMARKER_MODELS) {
    try {
      if (delegate === "GPU" && typeof OffscreenCanvas !== "undefined") {
        gpuCanvas ??= new OffscreenCanvas(1, 1);
      }
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: model.url,
          delegate,
        },
        canvas: delegate === "GPU" ? gpuCanvas ?? undefined : undefined,
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to create worker FaceLandmarker");
};

const ensureFaceLandmarker = async () => {
  if (faceLandmarker || closed) return faceLandmarker;
  if (faceLandmarkerPromise) return faceLandmarkerPromise;

  faceLandmarkerPromise = (async () => {
    try {
      faceLandmarker = await createFaceLandmarker("GPU");
      faceLandmarkerDelegate = "GPU";
    } catch {
      faceLandmarker = await createFaceLandmarker("CPU");
      faceLandmarkerDelegate = "CPU";
    }
    return faceLandmarker;
  })();

  faceLandmarkerPromise.finally(() => {
    faceLandmarkerPromise = null;
  });
  return faceLandmarkerPromise;
};

const closeFaceLandmarker = () => {
  closed = true;
  for (const source of activeSources) {
    try {
      source.close?.();
    } catch {}
  }
  activeSources.clear();
  try {
    faceLandmarker?.close();
  } catch {}
  faceLandmarker = null;
  faceLandmarkerDelegate = null;
  faceLandmarkerPromise = null;
  gpuCanvas = null;
};

workerScope.onmessage = (event) => {
  const message = event.data;
  void (async () => {
    try {
      switch (message.type) {
        case "INIT": {
          closed = false;
          const model = await ensureFaceLandmarker();
          if (!model || !faceLandmarkerDelegate) {
            throw new Error("Worker FaceLandmarker did not initialize.");
          }
          workerScope.postMessage({
            type: "READY",
            delegate: faceLandmarkerDelegate,
          });
          break;
        }
        case "FACE": {
          const source = message.source;
          activeSources.add(source);
          try {
            const model = await ensureFaceLandmarker();
            if (!model || !faceLandmarkerDelegate) {
              throw new Error("Worker FaceLandmarker is unavailable.");
            }
            const startedAt = performance.now();
            const result = model.detectForVideo(
              source as ImageBitmap,
              message.timestamp,
            );
            const landmarks =
              (result.faceLandmarks?.[0] as WorkerFaceLandmark[] | undefined) ??
              null;
            const payload = {
              type: "FACE_RESULT",
              sequence: message.sequence,
              processingConfigId: message.processingConfigId,
              landmarks,
              faceCount: result.faceLandmarks?.length ?? 0,
              blendshapeCount: result.faceBlendshapes?.length ?? 0,
              matrixCount: result.facialTransformationMatrixes?.length ?? 0,
              width: message.width,
              height: message.height,
              timestamp: message.timestamp,
              delegate: faceLandmarkerDelegate,
              inputSource: message.sourceKind,
              processingMs: performance.now() - startedAt,
            };
            workerScope.postMessage(payload);
          } finally {
            activeSources.delete(source);
            try {
              source.close?.();
            } catch {}
          }
          break;
        }
        case "CLOSE":
          closeFaceLandmarker();
          workerScope.postMessage({ type: "CLOSED" });
          break;
        default:
          throw new Error("Unknown face processor worker message.");
      }
    } catch (err) {
      workerScope.postMessage({
        type: "ERROR",
        sequence:
          "sequence" in message && typeof message.sequence === "number"
            ? message.sequence
            : undefined,
        error: getErrorDebugSnapshot(err),
      });
    }
  })();
};
