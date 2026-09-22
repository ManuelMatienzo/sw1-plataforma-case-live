import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioRecorderState {
  isRecording: boolean;
  duration: number; // en segundos
  audioLevel: number; // 0 a 1 para visualización
  frequencyBars: number[]; // 7 bandas normalizadas (0 a 1) para ecualizador
  error: string | null;
  isSupported: boolean;
  mimeType: string;
}

export interface UseAudioRecorderOptions {
  autoStopSilenceMs?: number;
  onSilenceDetected?: () => void;
}

export interface UseAudioRecorderReturn extends AudioRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  cancelRecording: () => void;
  clearError: () => void;
}

/**
 * Selecciona el formato de audio más compatible soportado por el navegador.
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useAudioRecorder(options?: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState<number[]>([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // VAD: Detección de voz y silencio
  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSilenceDetectedRef = useRef(options?.onSilenceDetected);
  onSilenceDetectedRef.current = options?.onSilenceDetected;
  const autoStopSilenceMs = options?.autoStopSilenceMs || 0;

  const isSupported = typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && window.MediaRecorder);

  const detectedMimeType = useRef<string>(getSupportedMimeType());

  // Limpieza total de recursos de audio y tracks del micrófono
  const cleanupStreams = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignorar fallo al detener pista
        }
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setAudioLevel(0);
    setFrequencyBars([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    hasSpokenRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      cleanupStreams();
    };
  }, [cleanupStreams]);

  const clearError = useCallback(() => setError(null), []);

  const startRecording = useCallback(async () => {
    clearError();
    cleanupStreams();
    setDuration(0);
    audioChunksRef.current = [];
    hasSpokenRef.current = false;

    if (!isSupported) {
      setError('Tu navegador no soporta grabación de audio nativa con MediaRecorder.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Configurar AnalyserNode para visualización de audio en tiempo real y VAD
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          audioContextRef.current = audioCtx;
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            const barsCount = 7;
            const newBars: number[] = [];
            const step = Math.floor(dataArray.length / barsCount) || 1;

            for (let b = 0; b < barsCount; b++) {
              let bSum = 0;
              for (let i = 0; i < step; i++) {
                const idx = b * step + i;
                if (idx < dataArray.length) {
                  bSum += dataArray[idx];
                }
              }
              const bAvg = bSum / step;
              newBars.push(Math.max(0.1, Math.min(1, bAvg / 180)));
            }

            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const level = Math.min(1, average / 128);
            setAudioLevel(level);
            setFrequencyBars(newBars);

            // Voice Activity Detection (VAD)
            if (autoStopSilenceMs > 0) {
              if (level > 0.08) {
                // Usuario está hablando
                hasSpokenRef.current = true;
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              } else if (hasSpokenRef.current && level < 0.035) {
                // Silencio tras haber hablado
                if (!silenceTimerRef.current) {
                  silenceTimerRef.current = setTimeout(() => {
                    if (onSilenceDetectedRef.current) {
                      onSilenceDetectedRef.current();
                    }
                  }, autoStopSilenceMs);
                }
              }
            }

            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch {
        // AnalyserNode es opcional para efectos visuales; no bloquea la grabación si falla
      }

      const mimeType = detectedMimeType.current;
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (e) => {
        setError(`Error en la grabación: ${(e as unknown as { error?: { message?: string } }).error?.message || 'Fallo desconocido'}`);
        cleanupStreams();
        setIsRecording(false);
      };

      recorder.start(100); // colecta chunks cada 100ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      const startTime = Date.now();
      durationTimerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 250);
    } catch (err: unknown) {
      cleanupStreams();
      setIsRecording(false);
      const errObj = err as { name?: string; message?: string };
      if (errObj.name === 'NotAllowedError' || errObj.name === 'PermissionDeniedError') {
        setError('Acceso al micrófono denegado. Permite el micrófono en tu navegador para dictar por voz.');
      } else if (errObj.name === 'NotFoundError' || errObj.name === 'DevicesNotFoundError') {
        setError('No se detectó ningún micrófono conectado en tu equipo.');
      } else {
        setError(`No fue posible acceder al micrófono: ${errObj.message || 'Verifica los permisos del sistema.'}`);
      }
    }
  }, [clearError, cleanupStreams, isSupported, autoStopSilenceMs]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupStreams();
        setIsRecording(false);
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mime = recorder.mimeType || detectedMimeType.current || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        audioChunksRef.current = [];
        cleanupStreams();
        setIsRecording(false);
        resolve(blob);
      };

      try {
        recorder.stop();
      } catch {
        cleanupStreams();
        setIsRecording(false);
        resolve(null);
      }
    });
  }, [cleanupStreams]);

  const cancelRecording = useCallback(() => {
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignorar
      }
    }
    cleanupStreams();
    setIsRecording(false);
    setDuration(0);
  }, [cleanupStreams]);

  return {
    isRecording,
    duration,
    audioLevel,
    frequencyBars,
    error,
    isSupported,
    mimeType: detectedMimeType.current,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  };
}
