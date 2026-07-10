import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 'request' | 'reset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset, verifyRecoveryOtp, updatePassword } = useAuth();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async () => {
    if (submitting) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const { error: reqError } = await requestPasswordReset(email);
    setSubmitting(false);
    if (reqError) {
      setError(reqError);
      return;
    }
    setNotice('If that email has an account, a reset code is on its way.');
    setStep('reset');
  };

  const handleReset = async () => {
    if (submitting) return;
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    // Verifying the recovery code signs the user in; updateUser then sets the new password.
    const { error: verifyError } = await verifyRecoveryOtp(email, code);
    if (verifyError) {
      setSubmitting(false);
      setError(
        /expired|invalid/i.test(verifyError)
          ? 'That code is invalid or expired. Please request a new one.'
          : verifyError,
      );
      return;
    }
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    // Password changed and the session is live — go into the app.
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={baymoAvatar} style={styles.baymo} contentFit="contain" />
            <Text style={styles.wordmark}>Reset password 🔑</Text>
          </View>

          <View style={styles.card}>
            {step === 'request' ? (
              <>
                <Text style={styles.subtitle}>
                  Enter your email and we&apos;ll send you a 6-digit code to reset your password.
                </Text>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!submitting}
                  onSubmitEditing={handleRequest}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  label={submitting ? 'Sending…' : 'Send reset code'}
                  onPress={handleRequest}
                  style={styles.submit}
                />
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  Enter the code sent to <Text style={styles.email}>{email.trim()}</Text> and choose a
                  new password.
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
                />
                <TextField
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoComplete="new-password"
                  editable={!submitting}
                />
                <TextField
                  label="Confirm new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Re-enter your password"
                  secureTextEntry
                  autoComplete="new-password"
                  editable={!submitting}
                  onSubmitEditing={handleReset}
                />
                {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  label={submitting ? 'Saving…' : 'Set new password'}
                  onPress={handleReset}
                  style={styles.submit}
                />
                <Pressable onPress={handleRequest} disabled={submitting}>
                  <Text style={styles.backLink}>Resend code</Text>
                </Pressable>
              </>
            )}

            <View style={styles.footer}>
              <Text style={styles.helper}>Remembered it? </Text>
              <Link href="/login" replace style={styles.link}>
                Sign in
              </Link>
            </View>
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
