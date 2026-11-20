import { createWorker, OEM, type Worker } from 'tesseract.js';
import { parseExpiryFromOcrText, type OcrExpiryParseResult } from '../utils/dateAndExpiry';

export interface CropRect {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  w: number; // 0..1 normalized
  h: number; // 0..1 normalized
}

export interface PreprocessOptions {
  crop?: CropRect;
  highContrast?: boolean;
  rotationDeg?: 0 | 90 | 180 | 270;
}

let cachedWorker: Worker | null = null;
let cachedLangKey: string | null = null;

async function supportsWasmSimd(): Promise<boolean> {
  try {
    // Minimal valid WASM SIMD probe
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    );
  } catch {
    return false;
  }
}

async function getOfflineWorker(
  langs: 'eng+ben' | 'eng',
  onProgress?: (pct: number, statusText: string) => void
): Promise<Worker> {
  if (cachedWorker && cachedLangKey === langs) {
    return cachedWorker;
  }

  if (cachedWorker) {
    await cachedWorker.terminate().catch(() => {});
    cachedWorker = null;
    cachedLangKey = null;
  }

  const hasSimd = await supportsWasmSimd();
  const corePath = hasSimd
    ? '/tesseract/tesseract-core-simd-lstm.wasm.js'
    : '/tesseract/tesseract-core-lstm.wasm.js';

  const worker = await createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath,
    langPath: '/tesseract/lang',
    workerBlobURL: false,
    gzip: true,
    logger: (msg) => {
      if (onProgress && typeof msg.progress === 'number') {
        onProgress(Math.round(msg.progress * 100), msg.status || 'Running offline OCR...');
      }
    },
  });

  cachedWorker = worker;
  cachedLangKey = langs;
  return worker;
}

export function preprocessImageForOcr(
  imageSrc: string,
  options: PreprocessOptions = {}
): Promise<{ ocrDataUrl: string; thumbnailDataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const rot = options.rotationDeg ?? 0;
      const rotCanvas = document.createElement('canvas');
      const swap = rot === 90 || rot === 270;
      rotCanvas.width = swap ? img.height : img.width;
      rotCanvas.height = swap ? img.width : img.height;
      const rCtx = rotCanvas.getContext('2d');
      if (!rCtx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rCtx.rotate((rot * Math.PI) / 180);
      rCtx.drawImage(img, -img.width / 2, -img.height / 2);

      const crop = options.crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const sx = Math.max(0, Math.round(crop.x * rotCanvas.width));
      const sy = Math.max(0, Math.round(crop.y * rotCanvas.height));
      const sw = Math.max(16, Math.round(crop.w * rotCanvas.width));
      const sh = Math.max(16, Math.round(crop.h * rotCanvas.height));

      // Upscale small crops slightly for sharper dot-matrix/date OCR
      const targetMax = 1400;
      const scale = Math.min(2.2, Math.max(1, targetMax / Math.max(sw, sh)));
      const outW = Math.round(sw * scale);
      const outH = Math.round(sh * scale);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

      // Save clean color thumbnail for batch record storage (max 480px wide)
      const thumbScale = Math.min(1, 480 / sw);
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.round(sw * thumbScale));
      thumbCanvas.height = Math.max(1, Math.round(sh * thumbScale));
      const tCtx = thumbCanvas.getContext('2d');
      tCtx?.drawImage(
        rotCanvas,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        thumbCanvas.width,
        thumbCanvas.height
      );
      const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.72);

      if (options.highContrast !== false) {
        const imgData = ctx.getImageData(0, 0, outW, outH);
        const data = imgData.data;
        const factor = 1.65; // boost contrast for stamped packaging ink
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const adjusted = Math.max(0, Math.min(255, factor * (lum - 128) + 128));
          data[i] = adjusted;
          data[i + 1] = adjusted;
          data[i + 2] = adjusted;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      resolve({
        ocrDataUrl: outCanvas.toDataURL('image/png'),
        thumbnailDataUrl,
      });
    };
    img.onerror = () => reject(new Error('Failed to load captured image.'));
    img.src = imageSrc;
  });
}

export async function runOfflineExpiryOcr(params: {
  imageSrc: string;
  langs: 'eng+ben' | 'eng';
  preprocess?: PreprocessOptions;
  onProgress?: (pct: number, statusText: string) => void;
}): Promise<{
  rawText: string;
  parsed: OcrExpiryParseResult;
  thumbnailDataUrl: string;
}> {
  params.onProgress?.(5, 'Preparing image...');
  const { ocrDataUrl, thumbnailDataUrl } = await preprocessImageForOcr(
    params.imageSrc,
    params.preprocess
  );

  params.onProgress?.(15, 'Loading local OCR engine...');
  const worker = await getOfflineWorker(params.langs, params.onProgress);

  params.onProgress?.(45, 'Recognizing English & Bengali numerals...');
  const result = await worker.recognize(ocrDataUrl);
  const rawText = result.data.text || '';
  const parsed = parseExpiryFromOcrText(rawText);

  params.onProgress?.(100, 'Complete');
  return { rawText, parsed, thumbnailDataUrl };
}

export async function verifyOfflineOcrAssetsCached(): Promise<{
  workerReady: boolean;
  engReady: boolean;
  benReady: boolean;
  coreReady: boolean;
}> {
  const check = async (url: string) => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const [workerReady, engReady, benReady, coreReady] = await Promise.all([
    check('/tesseract/worker.min.js'),
    check('/tesseract/lang/eng.traineddata.gz'),
    check('/tesseract/lang/ben.traineddata.gz'),
    check('/tesseract/tesseract-core-lstm.wasm.js'),
  ]);

  return { workerReady, engReady, benReady, coreReady };
}
