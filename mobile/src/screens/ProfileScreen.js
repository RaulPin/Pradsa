import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { authApi, setBaseUrl, getBaseUrl, DEFAULT_BASE_URL } from '../api';
import { storage } from '../storage';

const PRIMARY = '#2563eb';

export default function ProfileScreen({ user, onLogout }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const [serverUrl, setServerUrl] = useState(getBaseUrl());
  const [savingUrl, setSavingUrl] = useState(false);

  async function handleChangePassword() {
    if (!currentPwd.trim() || !newPwd.trim()) {
      Alert.alert('Campos requeridos', 'Por favor llena todos los campos.');
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert('Contraseña corta', 'La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setSavingPwd(true);
    try {
      await authApi.updateMe(currentPwd, newPwd);
      setCurrentPwd('');
      setNewPwd('');
      Alert.alert('¡Listo!', 'Contraseña actualizada correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSavingPwd(false);
    }
  }

  async function handleSaveUrl() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url.startsWith('http')) {
      Alert.alert('URL inválida', 'La URL debe comenzar con http:// o https://');
      return;
    }
    setSavingUrl(true);
    try {
      setBaseUrl(url);
      await storage.saveBaseUrl(url);
      setServerUrl(url);
      Alert.alert('¡Guardado!', 'URL del servidor actualizada.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleResetUrl() {
    setBaseUrl(DEFAULT_BASE_URL);
    await storage.removeBaseUrl();
    setServerUrl(DEFAULT_BASE_URL);
    Alert.alert('Restablecido', 'Se restauró la URL por defecto.');
  }

  function handleLogout() {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: onLogout },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* User info */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name || '—'}</Text>
        <Text style={styles.userEmail}>{user?.email || '—'}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role === 'admin' ? 'Administrador' : 'Empleado'}</Text>
        </View>
      </View>

      {/* Change password */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Cambiar contraseña</Text>

        <Text style={styles.label}>Contraseña actual</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#9ca3af"
          value={currentPwd}
          onChangeText={setCurrentPwd}
          secureTextEntry
          editable={!savingPwd}
        />

        <Text style={styles.label}>Nueva contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 caracteres"
          placeholderTextColor="#9ca3af"
          value={newPwd}
          onChangeText={setNewPwd}
          secureTextEntry
          editable={!savingPwd}
        />

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, savingPwd && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={savingPwd}
          activeOpacity={0.8}
        >
          {savingPwd ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Guardar contraseña</Text>}
        </TouchableOpacity>
      </View>

      {/* Server URL */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Servidor</Text>
        <Text style={styles.hint}>URL base de la API del servidor Pradsa.</Text>

        <TextInput
          style={styles.input}
          placeholder="http://10.0.2.2:3000/api"
          placeholderTextColor="#9ca3af"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { flex: 1, marginRight: 8 }, savingUrl && styles.btnDisabled]}
            onPress={handleSaveUrl}
            disabled={savingUrl}
            activeOpacity={0.8}
          >
            {savingUrl ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Guardar</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { flex: 1 }]}
            onPress={handleResetUrl}
            activeOpacity={0.8}
          >
            <Text style={styles.btnOutlineText}>Restablecer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.btnDangerText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
  userCard: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  userName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  userEmail: { color: '#bfdbfe', fontSize: 13, marginBottom: 10 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  hint: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1e293b', backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  row: { flexDirection: 'row' },
  btn: {
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
    marginBottom: 8,
  },
  btnPrimary: {
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnOutline: { borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  btnOutlineText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  btnDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', marginTop: 8 },
  btnDangerText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
