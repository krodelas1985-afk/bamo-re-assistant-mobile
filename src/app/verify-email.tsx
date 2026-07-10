import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, Radii, TypeScale } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo.png');

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { session, loading, verifyEmailOtp, resendEmailOtp } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  // Once verifyOtp establishes a session, drop into the app (onboarding gate handles the rest).
  if (!loading && session) return <Redirect href="/" />;

  // Reached directly without an email in params — nothing to verify.
  if (!email) return <Redirect href="/signup" />;

  const handleVerify = async () => {
    if (submitting) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const { error: verifyError } = await verifyEmailOtp(email, code);
    setSubmitting(false);
    if (verifyError) {
      setError(
        /expired|invalid/i.test(verifyError)
          ? 'That code is invalid or expired. Please request a new one.'
          : verifyError,
      );
      return;
    }
    // Success — the <Redirect> above takes over as the session updates.
  };

  const handleResend = async () => {
    if (resending) return;
    setError(null);
    setNotice(null);
    setResending(true);
    const { error: resendError } = await resendEmailOtp(email);
    setResending(false);
    setNotice(resendError ? null : 'A new code is on its way.');
    if (resendError) setError(resendError);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={baymoAvatar} style={styles.baymo} contentFit="contain" />
            <Text style={styles.wordmark}>Check your email 📩</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to <Text style={styles.email}>{email}</Text>. Enter it below to
              confirm your account.
            </Text>

            <TextField
              label="Verification code"
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              editable={!submitting}
              style={styles.codeInput}
              onSubmitEditing={handleVerify}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Button
              label={submitting ? 'Verifying…' : 'Verify'}
              onPress={handleVerify}
              style={styles.submit}
            />

            <View style={styles.footer}>
              <Text style={styles.helper}>Didn&apos;t get it? </Text>
              <Pressable onPress={handleResend} disabled={resending}>
                <Text style={styles.link}>{resending ? 'Sending…' : 'Resend code'}</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => router.replace('/signup')}>
              <Text style={styles.backLink}>Use a different email</Text>
            </Pressable>
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
    gap: 8,
  },
  baymo: {
    width: 90,
    height: 90,
  },
  wordmark: {
    ...TypeScale.h2,
    color: BrandColors.navy,
    textAlign: 'center',
  },
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: Radii.card,
    padding: 20,
    gap: 14,
  },
  subtitle: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  email: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
  },
  codeInput: {
    letterSpacing: 8,
    textAlign: 'center',
    ...TypeScale.h2,
  },
  error: {
    ...TypeScale.formError,
    color: BrandColors.error,
  },
  notice: {
    ...TypeScale.formError,
    color: BrandColors.success,
  },
  submit: {
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  helper: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
  },
  link: {
    ...TypeScale.bodyBold,
    color: BrandColors.navy,
  },
  backLink: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
