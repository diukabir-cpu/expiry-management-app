import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const SUPPORTED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

function createConfiguredReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, SUPPORTED_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 180,
    delayBetweenScanSuccess: 1200,
  });
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export async function listVideoCameras(): Promise<CameraDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, idx) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${idx + 1}`,
    }));
}

export async function startBarcodeCameraScan(params: {
  videoElement: HTMLVideoElement;
  deviceId?: string;
  onDetected: (barcodeText: string, formatName: string) => void;
  onError?: (err: unknown) => void;
}): Promise<IScannerControls> {
  const reader = createConfiguredReader();

  const constraints: MediaStreamConstraints = {
    audio: false,
    video: params.deviceId
      ? {
          deviceId: { exact: params.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
  };

  return reader.decodeFromConstraints(
    constraints,
    params.videoElement,
    (result, error) => {
      if (result) {
        const text = result.getText().trim();
        if (text) {
          params.onDetected(text, BarcodeFormat[result.getBarcodeFormat()] ?? 'BARCODE');
        }
      } else if (error && params.onError) {
        // NotFoundException fires continuously on empty frames; ignore frame misses
        if (error.name !== 'NotFoundException' && error.name !== 'NotFoundException2') {
          params.onError(error);
        }
      }
    }
  );
}

export async function decodeBarcodeFromImageFile(file: File): Promise<string | null> {
  const reader = createConfiguredReader();
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return result ? result.getText().trim() : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function setCameraTorch(
  videoElement: HTMLVideoElement | null,
  enabled: boolean
): Promise<boolean> {
  if (!videoElement || !videoElement.srcObject) return false;
  const stream = videoElement.srcObject as MediaStream;
  const track = stream.getVideoTracks()[0];
  if (!track) return false;

  try {
    const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
      torch?: boolean;
    };
    if (!capabilities?.torch) return false;
    await track.applyConstraints({
      advanced: [{ torch: enabled } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}
