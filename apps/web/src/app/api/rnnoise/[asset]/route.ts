import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const resolveAssetCandidates = (...segments: string[]) => [
  path.join(
    process.cwd(),
    "node_modules",
    "@sapphi-red",
    "web-noise-suppressor",
    "dist",
    ...segments,
  ),
  path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "../..",
    "node_modules",
    "@sapphi-red",
    "web-noise-suppressor",
    "dist",
    ...segments,
  ),
];

const assets = {
  "rnnoiseWorklet.js": {
    paths: resolveAssetCandidates("rnnoise", "workletProcessor.js"),
    contentType: "text/javascript; charset=utf-8",
  },
  "rnnoise.wasm": {
    paths: resolveAssetCandidates("rnnoise.wasm"),
    contentType: "application/wasm",
  },
  "rnnoise_simd.wasm": {
    paths: resolveAssetCandidates("rnnoise_simd.wasm"),
    contentType: "application/wasm",
  },
} as const;

type AssetName = keyof typeof assets;

const isAssetName = (asset: string): asset is AssetName => asset in assets;

const readFirstAvailableAsset = async (paths: readonly string[]) => {
  let lastError: unknown;
  for (const assetPath of paths) {
    try {
      return await readFile(assetPath);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (!isAssetName(asset)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const selectedAsset = assets[asset];
  const body = await readFirstAvailableAsset(selectedAsset.paths);

  return new NextResponse(body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": selectedAsset.contentType,
    },
  });
}
