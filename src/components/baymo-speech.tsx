import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { BrandColors, Radii } from '@/constants/brand';
import { BayMoSpeechAudio, synthesizeBayMoSpeech } from '@/lib/baymo-chat';

export function useBayMoSpeech(onError: (message: string | null) => void) {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const audioRef = useRef<BayMoSpeechAudio | null>(null);
  const requestRef = useRef(0);

  const clearAudio = useCallback(() => {
    audioRef.current?.cleanup();
    audioRef.current = null;
  }, []);

  const playSpeech = useCallback(async (key: string, text: string) => {
    if (speakingKey === key) {
      requestRef.current += 1;
      player.pause();
      player.replace(null);
      setSpeakingKey(null);
      clearAudio();
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    player.pause();
    player.replace(null);
    clearAudio();
    onError(null);
    setSpeakingKey(key);
    const result = await synthesizeBayMoSpeech(text);
    if (requestRef.current !== requestId) {
      result.audio?.cleanup();
      return;
    }
    if (result.error || !result.audio) {
      setSpeakingKey(null);
      onError(result.error ?? 'Could not play this BayMo reply.');
      return;
    }
    audioRef.current = result.audio;
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (requestRef.current !== requestId) {
        clearAudio();
        return;
      }
      player.replace(result.audio.uri);
      player.play();
    } catch {
      if (requestRef.current === requestId) {
        setSpeakingKey(null);
        clearAudio();
        onError('Could not play this reply. Check your phone volume and try again.');
      }
    }
  }, [clearAudio, onError, player, speakingKey]);

  useEffect(() => {
    if (!speakingKey || (!status.error && !status.didJustFinish)) return;

    const completionTimer = setTimeout(() => {
      setSpeakingKey(null);
      player.replace(null);
      clearAudio();
      if (status.error) {
        onError('Could not play this reply. Check your phone volume and try again.');
      }
    }, 0);

    return () => clearTimeout(completionTimer);
  }, [clearAudio, onError, player, speakingKey, status.didJustFinish, status.error]);

  useEffect(() => () => {
    requestRef.current += 1;
    player.pause();
    player.replace(null);
    clearAudio();
  }, [clearAudio, player]);

  return { speakingKey, playSpeech };
}

export function BayMoSpeechButton({
  speaking,
  disabled,
  onPress,
}: {
  speaking: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop BayMo voice' : 'Listen to BayMo'}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.button, disabled && styles.disabled]}>
      <Ionicons
        name={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
        size={18}
        color={BrandColors.navy}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.cream200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
