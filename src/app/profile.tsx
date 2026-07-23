import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, CardShadow, Radii, TypeScale } from '@/constants/brand';
import psgc from '@/constants/psgc.json';
import { Profile, useAuth } from '@/contexts/auth-context';
import { updateProfile, uploadProfileImage } from '@/lib/settings';

const PROVINCES = psgc.map((p) => p.province);

const citiesOf = (province: string | null): string[] =>
  psgc.find((p) => p.province === province)?.cities ?? [];

export default function ProfileScreen() {
  const { profile } = useAuth();
  // Keying by profile id seeds the form from the loaded profile exactly once —
  // a context refresh mid-edit never clobbers what the user has typed.
  return <ProfileForm key={profile?.id ?? 'loading'} profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id ?? null;

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [prcNumber, setPrcNumber] = useState(profile?.prc_number ?? '');
  const [company, setCompany] = useState(profile?.company ?? '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '');
  const [province, setProvince] = useState<string | null>(profile?.location_province ?? null);
  const [city, setCity] = useState<string | null>(profile?.location_city ?? null);
  const [serviceArea, setServiceArea] = useState(profile?.service_area ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(profile?.company_logo_url ?? null);

  const [uploading, setUploading] = useState<'avatar' | 'logo' | null>(null);
  const [saving, setSaving] = useState(false);

  const pickImage = async (kind: 'avatar' | 'logo') => {
    if (!userId) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.6,
      allowsEditing: kind === 'avatar',
      aspect: kind === 'avatar' ? [1, 1] : undefined,
    });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    setUploading(kind);
    const { url, error } = await uploadProfileImage(userId, kind, asset);
    setUploading(null);
    if (error || !url) {
      Alert.alert('Upload failed', error ?? 'Please try again.');
      return;
    }
    if (kind === 'avatar') setAvatarUrl(url);
    else setLogoUrl(url);
  };

  const save = async () => {
    if (!userId) return;
    if (!fullName.trim()) {
      Alert.alert('Add your name', 'Please enter your name.');
      return;
    }
    setSaving(true);
    const { error } = await updateProfile(userId, {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      avatar_url: avatarUrl,
      prc_number: prcNumber.trim() || null,
      company: company.trim() || null,
      company_logo_url: logoUrl,
      whatsapp: whatsapp.trim() || null,
      location_province: province,
      location_city: city,
      service_area: serviceArea.trim() || null,
    });
    if (!error) await refreshProfile();
    setSaving(false);
    if (error) Alert.alert('Could not save', error);
    else Alert.alert('Saved', 'Your profile has been updated.');
  };

  return (
    <Screen title="My Profile" onBack={() => router.back()}>
      {/* Photo & logo */}
      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <Pressable onPress={() => pickImage('avatar')} disabled={uploading !== null}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Avatar name={fullName || profile?.full_name || '?'} size={96} />
            )}
            <View style={styles.cameraBadge}>
              {uploading === 'avatar' ? (
                <ActivityIndicator size="small" color={BrandColors.white} />
              ) : (
                <Ionicons name="camera" size={16} color={BrandColors.white} />
              )}
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change your photo</Text>
        </View>

        <Pressable
          style={styles.logoRow}
          onPress={() => pickImage('logo')}
          disabled={uploading !== null}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="business-outline" size={20} color={BrandColors.textMuted} />
            </View>
          )}
          <View style={styles.logoText}>
            <Text style={styles.logoLabel}>Company logo</Text>
            <Text style={styles.logoHint}>
              {uploading === 'logo' ? 'Uploading…' : logoUrl ? 'Tap to replace' : 'Tap to upload'}
            </Text>
          </View>
          <Ionicons name="image-outline" size={18} color={BrandColors.navy} />
        </Pressable>
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your details</Text>
        <TextField
          label="Name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Juan Dela Cruz"
          autoCapitalize="words"
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="0917 123 4567"
          keyboardType="phone-pad"
        />
        <TextField
          label="Email"
          value={profile?.email ?? session?.user.email ?? ''}
          onChangeText={() => {}}
          editable={false}
        />
        <TextField
          label="PRC License No."
          value={prcNumber}
          onChangeText={setPrcNumber}
          placeholder="e.g. 0012345"
          autoCapitalize="none"
        />
        <TextField
          label="Company / Brokerage"
          value={company}
          onChangeText={setCompany}
          placeholder="e.g. BaMo Realty"
          autoCapitalize="words"
        />
        <TextField
          label="WhatsApp"
          value={whatsapp}
          onChangeText={setWhatsapp}
          placeholder="0917 123 4567"
          keyboardType="phone-pad"
        />
        {phone.trim() && whatsapp.trim() !== phone.trim() ? (
          <Pressable onPress={() => setWhatsapp(phone.trim())}>
            <Text style={styles.sameAsPhone}>Same as phone</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location</Text>
        <SelectField
          label="Province"
          value={province}
          options={PROVINCES}
          placeholder="Select province"
          onSelect={(p) => {
            if (p !== province) setCity(null);
            setProvince(p);
          }}
        />
        <SelectField
          label="City / Municipality"
          value={city}
          options={citiesOf(province)}
          placeholder="Select city or municipality"
          onSelect={setCity}
          disabled={!province}
          disabledHint="Pick a province first"
        />
        <TextField
          label="Servicing area"
          value={serviceArea}
          onChangeText={setServiceArea}
          placeholder="e.g. Cavite, Laguna, and Tagaytay area"
          multiline
          numberOfLines={2}
        />
      </View>

      {saving ? (
        <ActivityIndicator color={BrandColors.navy} />
      ) : (
        <Button label="Save changes" onPress={save} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BrandColors.white,
    ...CardShadow,
    borderRadius: Radii.card,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    ...TypeScale.h4,
    color: BrandColors.textHeading,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: 8,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BrandColors.cream100,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BrandColors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BrandColors.white,
  },
  avatarHint: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: BrandColors.border,
    borderRadius: Radii.button,
    padding: 10,
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: BrandColors.cream50,
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: BrandColors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    flex: 1,
    gap: 1,
  },
  logoLabel: {
    ...TypeScale.bodyBold,
    color: BrandColors.textHeading,
  },
  logoHint: {
    ...TypeScale.bodySmall,
    color: BrandColors.textMuted,
  },
  sameAsPhone: {
    ...TypeScale.label,
    color: BrandColors.navy,
  },
});
