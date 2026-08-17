"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";

/**
 * Live selfie capture via getUserMedia — used for document fields where a
 * fresh in-app photo is preferable to picking an old file (e.g. 2x2 ID
 * picture). Falls back gracefully: caller should also offer a plain file
 * upload, since camera access can be denied or unavailable.
 */
export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    if (!open) {
      stopStream();
      setCapturedUrl(null);
      setCapturedBlob(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Couldn't access the camera. Check your browser's camera permission, or upload a photo file instead.",
          );
        }
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedBlob(null);
  }

  function handleUsePhoto() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    onCapture(file);
    onClose();
  }

  return (
    <Modal open={open} title="Take a photo" onClose={onClose}>
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--r-md)] bg-navy-900">
        {capturedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedUrl}
            alt="Captured preview"
            className="max-h-[60vh] w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="max-h-[60vh] w-full -scale-x-100 object-contain"
          />
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {capturedUrl ? (
          <>
            <Button variant="secondary" onClick={handleRetake}>
              Retake
            </Button>
            <Button onClick={handleUsePhoto}>Use this photo</Button>
          </>
        ) : (
          <Button onClick={handleCapture} disabled={!!error}>
            Capture
          </Button>
        )}
      </div>
    </Modal>
  );
}
