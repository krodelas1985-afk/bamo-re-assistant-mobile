import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { BrandColors, Radii } from '@/constants/brand';

export function useBayMoSpeech(onError: (message: string | null) => void) {
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const playSpeech = useCallback(async (key: string, text: string) => {
    if (speakingKey === key) {
      await Speech.stop();
      setSpeakingKey(null);
      return;
    }
    await Speech.stop();
    const spoken = text.replace(/[*_#`]/g, '').slice(
      0,
      Math.min(Speech.maxSpeechInputLength, 4000),
    );
    if (!spoken) return;
    onError(null);
    setSpeakingKey(key);
    Speech.speak(spoken, {
      language: 'en-PH',
      rate: 0.95,
      onDone: () => setSpeakingKey((current) => current === key ? null : current),
      onStopped: () => setSpeakingKey((current) => current === key ? null : current),
      onError: () => {
        setSpeakingKey((current) => current === key ? null : current);
        onError('Could not play this reply. Check your phone volume and try again.');
      },
    });
  }, [onError, speakingKey]);

  useEffect(() => () => {
    void Speech.stop();
  }, []);

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
