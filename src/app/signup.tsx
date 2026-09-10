import { Image } from 'expo-image';
import { Link, Redirect, useRouter } from 'expo-router';
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

export default function SignUpScreen() {
  const router = useRouter();
  const { session, loading, signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Redirect href="/" />;

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    if (!agreed) return 'Please accept the Terms and Privacy Policy to continue.';
    return null;
  };

  const handleSignUp = async () => {
    if (submitting) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: signUpError, needsVerification } = await signUp({ fullName, email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    if (needsVerification) {
      router.push({ pathname: '/verify-email', params: { email: email.trim() } });
    }
    // Otherwise a session is already live — the <Redirect> above takes over.
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
            <Text style={styles.welcome}>Create your account 🚀</Text>
            <Text style={styles.subtitle}>
              Start for free — get more leads and follow up faster.
            </Text>

            <TextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Juan dela Cruz"
              autoCapitalize="words"
              autoComplete="name"
              editable={!submitting}
            />
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!submitting}
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              autoComplete="new-password"
              editable={!submitting}
            />
            <TextField
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter your password"
              secureTextEntry
              autoComplete="new-password"
              editable={!submitting}
              onSubmitEditing={handleSignUp}
            />

            <Pressable
              style={styles.consent}
              onPress={() => setAgreed((v) => !v)}
              disabled={submitting}>
              <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                {agreed ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>
                I agree to the BaMo Terms of Service and Privacy Policy.
              </Text>
            </Pressable>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={submitting ? 'Creating account…' : 'Create account'}
              onPress={handleSignUp}
              style={styles.submit}
            />

            <View style={styles.footer}>
              <Text style={styles.helper}>Already have an account? </Text>
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
    gap: 2,
  },
  baymo: {
    width: 90,
    height: 90,
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
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BrandColors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.white,
  },
  checkboxOn: {
    backgroundColor: BrandColors.orange,
    borderColor: BrandColors.orange,
  },
  checkmark: {
    color: BrandColors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  consentText: {
    ...TypeScale.bodySmall,
    color: BrandColors.textBody,
    flex: 1,
  },
  error: {
    ...TypeScale.formError,
    color: BrandColors.error,
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
});
