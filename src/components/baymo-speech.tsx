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

  const stopSpeech = useCallback(() => {
    requestRef.current += 1;
    player.pause();
    setSpeakingKey(null);
    clearAudio();
  }, [clearAudio, player]);

  const playSpeech = useCallback(async (key: string, text: string) => {
    const requestId = requestRef.current + 1;
    try {
      // expo-audio 57.0.4 throws when replace(null) crosses the native bridge.
      // Pausing is enough here; the next valid source replaces the old one.
      if (speakingKey === key) {
        requestRef.current = requestId;
        player.pause();
        setSpeakingKey(null);
        clearAudio();
        return;
      }

      requestRef.current = requestId;
      player.pause();
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
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });
      if (requestRef.current !== requestId) return;
      player.replace({ uri: result.audio.uri });
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
    if (!speakingKey || !audioRef.current || (!status.error && !status.didJustFinish)) return;

    const completionTimer = setTimeout(() => {
      setSpeakingKey(null);
      player.pause();
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
    clearAudio();
  }, [clearAudio, player]);

  return { speakingKey, playSpeech, stopSpeech };
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
        color={BrandColors.teal}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: BrandColors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});
