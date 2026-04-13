import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { authApi } from '../api';
import { storage } from '../storage';

const PRIMARY = '#2563eb';

// ISO 27001:2022 password policy
const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/;
const PWD_RULES = [
  { test: p => p.length >= 8,              label: 'Mínimo 8 caracteres' },
  { test: p => /[A-Z]/.test(p),            label: 'Al menos una mayúscula' },
  { test: p => /[a-z]/.test(p),            label: 'Al menos una minúscula' },
  { test: p => /[^a-zA-Z0-9]/.test(p),     label: 'Al menos un carácter especial (!@#$%...)' },
];

export default function ForceChangePasswordScreen({ user, onPasswordChanged }) {
  const [currentPwd, setCurrentPwd]   = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit() {
    setError('');

    if (!PWD_REGEX.test(newPwd)) {
      setError('La contraseña no cumple con la política de seguridad.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await authApi.updateMe(currentPwd, newPwd);
      // Clear must_change_password flag in storage
      const updatedUser = { ...user, must_change_password: false };
      await storage.saveUser(updatedUser);
      onPasswordChanged(updatedUser);
    } catch (err) {
      setError(err.message || 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🔒</Text>
          </View>
          <Text style={styles.title}>Cambio de contraseña requerido</Text>
          <Text style={styles.subtitle}>
            Por política de seguridad (ISO 27001:2022) debes establecer una contraseña personal antes de continuar.
          </Text>
        </View>

        <View style={styles.card}>
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Contraseña temporal (actual)</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            value={currentPwd}
            onChangeText={setCurrentPwd}
            secureTextEntry
            editable={!loading}
          />

          <Text style={styles.label}>Nueva contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            value={newPwd}
            onChangeText={setNewPwd}
            secureTextEntry
            editable={!loading}
          />

          {/* Live policy checklist */}
          <View style={styles.policyBox}>
            {PWD_RULES.map((rule, i) => {
              const ok = newPwd.length > 0 && rule.test(newPwd);
              return (
                <View key={i} style={styles.policyRow}>
                  <Text style={[styles.policyDot, ok ? styles.policyOk : styles.policyPending]}>
                    {ok ? '✓' : '○'}
                  </Text>
                  <Text style={[styles.policyLabel, ok ? styles.policyLabelOk : {}]}>
                    {rule.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <TextInput
            style={[
              styles.input,
              confirmPwd.length > 0 && confirmPwd !== newPwd && styles.inputError,
            ]}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            value={confirmPwd}
            onChangeText={setConfirmPwd}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Establecer contraseña</Text>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff3cd', alignItems: 'center',
    justifyContent: 'center', marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  iconText: { fontSize: 34 },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 4,
  },
  errorBox: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 8, padding: 12, marginBottom: 14,
  },
  errorText: { color: '#dc2626', fontSize: 13, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1e293b', backgroundColor: '#f8fafc', marginBottom: 12,
  },
  inputError: { borderColor: '#fca5a5' },
  policyBox: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    marginBottom: 14, gap: 6,
  },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyDot: { fontSize: 13, fontWeight: '700', width: 16, textAlign: 'center' },
  policyOk: { color: '#16a34a' },
  policyPending: { color: '#cbd5e1' },
  policyLabel: { fontSize: 12, color: '#94a3b8' },
  policyLabelOk: { color: '#16a34a' },
  btn: {
    backgroundColor: PRIMARY, borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 6,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
