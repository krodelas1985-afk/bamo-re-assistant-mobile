import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { BrandColors, Radii } from '@/constants/brand';
import { transcribeBayMoAudio } from '@/lib/baymo-chat';

type Phase = 'idle' | 'recording' | 'transcribing';

export function ChatVoiceButton({
  disabled,
  onTranscript,
  onError,
  onBusyChange,
}: {
  disabled: boolean;
  onTranscript: (text: string) => void;
  onError: (message: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const setCurrentPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    if (mountedRef.current) {
      setPhase(next);
      onBusyChange(next !== 'idle');
    }
  }, [onBusyChange]);

  const stopAndTranscribe = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setCurrentPhase('transcribing');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('No recording was created. Please try again.');
      const result = await transcribeBayMoAudio(recorder.uri);
      if (!mountedRef.current) return;
      if (result.error || !result.text) throw new Error(result.error ?? 'No speech was detected.');
      onTranscript(result.text);
      onError(null);
    } catch (error) {
      if (mountedRef.current) {
        onError(error instanceof Error ? error.message : 'Could not transcribe that recording.');
      }
    } finally {
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      setCurrentPhase('idle');
    }
  }, [onError, onTranscript, recorder, setCurrentPhase]);

  const startRecording = useCallback(async () => {
    if (disabled || phaseRef.current !== 'idle') return;
    onError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError('Microphone access is needed to record a message. You can still type to BayMo.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
      setCurrentPhase('recording');
      timerRef.current = setTimeout(() => void stopAndTranscribe(), 60_000);
    } catch {
      setCurrentPhase('idle');
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      onError('Could not start the microphone. Please try again.');
    }
  }, [disabled, onError, recorder, setCurrentPhase, stopAndTranscribe]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onBusyChange(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (phaseRef.current === 'recording') void recorder.stop();
    };
  }, [onBusyChange, recorder]);

  const seconds = Math.max(1, Math.round(recorderState.durationMillis / 1000));
  const label = phase === 'recording'
    ? `Stop recording, ${seconds} seconds`
    : phase === 'transcribing'
      ? 'Transcribing voice message'
      : 'Record voice message';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || phase === 'transcribing', busy: phase === 'transcribing' }}
      disabled={disabled || phase === 'transcribing'}
      onPress={phase === 'recording' ? stopAndTranscribe : startRecording}
      style={[
        styles.button,
        phase === 'recording' && styles.recording,
        (disabled || phase === 'transcribing') && styles.disabled,
      ]}
    >
      {phase === 'transcribing' ? (
        <ActivityIndicator color={BrandColors.white} size="small" />
      ) : (
        <Ionicons
          name={phase === 'recording' ? 'stop' : 'mic'}
          size={20}
          color={BrandColors.white}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.teal,
  },
  recording: { backgroundColor: BrandColors.error },
  disabled: { opacity: 0.45 },
});
