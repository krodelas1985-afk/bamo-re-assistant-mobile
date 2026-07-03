import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo.png');

export default function LoginScreen() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Redirect href="/" />;

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) {
      setError(
        signInError === 'Invalid login credentials'
          ? 'Hindi tugma ang email o password. Please try again.'
          : signInError,
      );
    }
    // On success the session updates and <Redirect> above takes over.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={baymoAvatar} style={styles.baymo} contentFit="contain" />
            <Text style={styles.wordmark}>BaMo</Text>
            <Text style={styles.tagline}>REAL ESTATE MADE SIMPLE</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>Maligayang pagbabalik! 👋</Text>
            <Text style={styles.subtitle}>Sign in to see your leads and appointments.</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={BrandColors.textMuted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                editable={!submitting}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={BrandColors.textMuted}
                secureTextEntry
                autoComplete="password"
                editable={!submitting}
                onSubmitEditing={handleSignIn}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={submitting ? 'Signing in…' : 'Sign in'}
              onPress={handleSignIn}
              style={styles.submit}
            />

            <Text style={styles.helper}>
              No account yet? Your BaMo onboarding specialist sets this up for you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BrandColors.cream100,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 2,
  },
  baymo: {
    width: 110,
    height: 110,
  },
  wordmark: {
    ...TypeScale.h1,
    color: BrandColors.navy,
  },
  tagline: {
    ...TypeScale.labelSmall,
    color: BrandColors.orangeDark,
    letterSpacing: 2,
  },
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 20,
    gap: 14,
  },
  welcome: {
    ...TypeScale.h3,
    color: BrandColors.textHeading,
  },
  subtitle: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  field: {
    gap: 6,
  },
  label: {
    ...TypeScale.label,
    color: BrandColors.textSecondary,
  },
  input: {
    ...TypeScale.input,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    borderRadius: Radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: BrandColors.textHeading,
    backgroundColor: BrandColors.white,
  },
  error: {
    ...TypeScale.formError,
    color: BrandColors.error,
  },
  submit: {
    marginTop: 4,
  },
  helper: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
    textAlign: 'center',
  },
});
