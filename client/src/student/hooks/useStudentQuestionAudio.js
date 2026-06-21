import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  pickRecorderMimeType,
  recordingExtensionFromBlobType,
  validateRecordedAudioBlob,
} from '../../utils/qaQuestionValidation';

function formatCountdown(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * In-browser voice recording only — no file upload / drag-drop.
 */
export function useStudentQuestionAudio({ disabled = false } = {}) {
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);

  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);
  const [blob, setBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined' &&
      Boolean(pickRecorderMimeType());
    setSupported(ok);
  }, []);

  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const stopTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback(() => {
    clearTimer();
    stopTracks();
    setRecording(false);
    const recorded = new Blob(chunksRef.current, {
      type: mediaRecorderRef.current?.mimeType || pickRecorderMimeType() || 'audio/webm',
    });
    chunksRef.current = [];
    const elapsed = Math.min(
      MAX_RECORDING_SECONDS,
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    );
    const validationError = validateRecordedAudioBlob(recorded, elapsed);
    if (validationError) {
      setError(validationError);
      setBlob(null);
      setDurationSec(0);
      return;
    }
    setError('');
    setBlob(recorded);
    setDurationSec(elapsed);
    setSecondsLeft(MAX_RECORDING_SECONDS);
  }, [clearTimer, stopTracks]);

  const startRecording = useCallback(async () => {
    if (disabled || recording) return;
    setError('');
    setBlob(null);
    setDurationSec(0);
    chunksRef.current = [];

    if (!supported) {
      setError('Voice recording is not supported in this browser. Try Chrome or Edge on desktop.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finalizeRecording();
      recorder.onerror = () => {
        setError('Recording failed. Please try again.');
        clearTimer();
        stopTracks();
        setRecording(false);
      };

      startedAtRef.current = Date.now();
      setSecondsLeft(MAX_RECORDING_SECONDS);
      setRecording(true);
      recorder.start(250);

      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        const left = MAX_RECORDING_SECONDS - elapsed;
        setSecondsLeft(left);
        if (left <= 0 && recorder.state === 'recording') {
          recorder.stop();
        }
      }, 250);
    } catch {
      stopTracks();
      setError('Microphone access was denied or is unavailable. Check your browser permissions.');
      setRecording(false);
    }
  }, [clearTimer, disabled, finalizeRecording, recording, stopTracks, supported]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }
    try {
      recorder.requestData();
    } catch {
      // ignore — flush pending chunks when supported
    }
    const stopPromise = new Promise((resolve) => {
      const priorOnStop = recorder.onstop;
      recorder.onstop = (event) => {
        try {
          priorOnStop?.call(recorder, event);
        } finally {
          resolve();
        }
      };
      try {
        recorder.stop();
      } catch {
        recorder.onstop = priorOnStop;
        finalizeRecording();
        resolve();
      }
    });
    return stopPromise;
  }, [finalizeRecording]);

  const cancelRecording = useCallback(() => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
    }
    stopTracks();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setRecording(false);
    setBlob(null);
    setDurationSec(0);
    setSecondsLeft(MAX_RECORDING_SECONDS);
    setError('');
  }, [clearTimer, stopTracks]);

  const clearRecording = useCallback(() => {
    clearTimer();
    stopTracks();
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    setRecording(false);
    setBlob(null);
    setDurationSec(0);
    setSecondsLeft(MAX_RECORDING_SECONDS);
    setError('');
  }, [clearTimer, stopTracks]);

  useEffect(
    () => () => {
      clearTimer();
      stopTracks();
      if (mediaRecorderRef.current?.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore on unmount
        }
      }
    },
    [clearTimer, stopTracks]
  );

  return {
    supported,
    recording,
    secondsLeft,
    countdownLabel: formatCountdown(secondsLeft),
    blob,
    previewUrl,
    durationSec,
    hasRecording: Boolean(blob),
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearRecording,
    setError,
  };
}
