import { Image } from 'expo-image';
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/ui/text-field';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { BrandColors, CardShadow, TypeScale } from '@/constants/brand';

const baymoAvatar = require('../../assets/brand/baymo-head.png');

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
        behavior="padding"
        automaticOffset>
        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={baymoAvatar} style={styles.baymo} contentFit="contain" />
            <Image source={require('../../assets/brand/logo.png')} style={{ width: 156, height: 56 }} contentFit="contain" accessibilityLabel="BaMo — Real Estate Made Simple" />
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.subtitle}>Kumusta! Your leads and appointments are waiting.</Text>

            <View style={styles.field}>
              <TextField
                label="Email"
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
              <TextField
                label="Password"
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
              loading={submitting}
              style={styles.submit}
            />

            <Link href="/forgot-password" style={styles.forgot}>
              Forgot password?
            </Link>

            <View style={styles.footer}>
              <Text style={styles.helper}>No account yet? </Text>
              <Link href="/signup" style={styles.link}>
                Create one — it&apos;s free
              </Link>
            </View>
          </View>
        </KeyboardAwareScrollView>
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
    gap: 12,
  },
  baymo: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: BrandColors.white,
    ...CardShadow,
  },
  card: {
    backgroundColor: BrandColors.white,
    borderRadius: 24,
    padding: 20,
    gap: 18,
    ...CardShadow,
  },
  welcome: {
    ...TypeScale.h2,
    color: BrandColors.ink,
  },
  subtitle: {
    ...TypeScale.body,
    color: BrandColors.textBody,
  },
  field: {
    gap: 6,
  },
  error: {
    ...TypeScale.formError,
    color: BrandColors.error,
  },
  submit: {
    marginTop: 4,
  },
  forgot: {
    ...TypeScale.label,
    color: BrandColors.navy,
    textAlign: 'center',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  helper: {
    ...TypeScale.helper,
    color: BrandColors.textMuted,
    textAlign: 'center',
  },
  link: {
    ...TypeScale.bodyBold,
    color: BrandColors.navy,
  },
});
