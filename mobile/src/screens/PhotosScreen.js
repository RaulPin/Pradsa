import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert, TextInput, Modal, RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { getBaseUrl } from '../api';
import { storage } from '../storage';

const PRIMARY = '#2563eb';

async function fetchPhotos(token) {
  const res = await fetch(`${getBaseUrl()}/photos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar fotos');
  return res.json();
}

async function uploadPhoto(uri, caption, token) {
  const form = new FormData();
  const filename = uri.split('/').pop();
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';
  form.append('photo', { uri, name: filename, type });
  if (caption) form.append('caption', caption);

  const res = await fetch(`${getBaseUrl()}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al subir foto');
  return data;
}

async function deletePhoto(id, token) {
  const res = await fetch(`${getBaseUrl()}/photos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al eliminar foto');
}

function formatDate(str) {
  if (!str) return '';
  const normalized = str.replace(' ', 'T').replace(/Z?$/, 'Z');
  return new Date(normalized).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PhotosScreen({ user }) {
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captionModal, setCaptionModal] = useState(false);
  const [pendingUri, setPendingUri] = useState(null);
  const [caption, setCaption]     = useState('');
  const [preview, setPreview]     = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await storage.getToken();
      const data  = await fetchPhotos(token);
      setPhotos(data);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
  }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  async function pickImage(source) {
    let result;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara.'); return; }
      result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso requerido', 'Se necesita acceso a la galería.'); return; }
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    }

    if (!result.canceled && result.assets?.[0]) {
      setPendingUri(result.assets[0].uri);
      setCaption('');
      setCaptionModal(true);
    }
  }

  async function confirmUpload() {
    setCaptionModal(false);
    setUploading(true);
    try {
      const token = await storage.getToken();
      await uploadPhoto(pendingUri, caption, token);
      await load();
      Alert.alert('¡Listo!', 'Foto subida correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setUploading(false);
      setPendingUri(null);
    }
  }

  async function handleDelete(photo) {
    Alert.alert('Eliminar foto', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          const token = await storage.getToken();
          await deletePhoto(photo.id, token);
          setPhotos(prev => prev.filter(p => p.id !== photo.id));
        } catch (err) {
          Alert.alert('Error', err.message);
        }
      }},
    ]);
  }

  function renderPhoto({ item }) {
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setPreview(item)} activeOpacity={0.85}>
          <PhotoImage photoId={item.id} />
        </TouchableOpacity>
        <View style={styles.cardBody}>
          {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteBtnText}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={p => String(p.id)}
        renderItem={renderPhoto}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={styles.emptyText}>No hay fotos. Sube la primera.</Text>
          </View>
        }
      />

      {/* Upload FAB */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={[styles.fab, { marginRight: 12 }]} onPress={() => pickImage('camera')} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fabIcon}>📸</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={() => pickImage('gallery')} disabled={uploading}>
          <Text style={styles.fabIcon}>🖼️</Text>
        </TouchableOpacity>
      </View>

      {/* Caption modal */}
      <Modal visible={captionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {pendingUri && <Image source={{ uri: pendingUri }} style={styles.modalPreview} />}
            <Text style={styles.modalTitle}>Agregar descripción (opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Visita cliente, obra norte..."
              placeholderTextColor="#9ca3af"
              value={caption}
              onChangeText={setCaption}
              maxLength={200}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => { setCaptionModal(false); setPendingUri(null); }}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnOk]} onPress={confirmUpload}>
                <Text style={styles.modalBtnOkText}>Subir foto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen preview */}
      <Modal visible={!!preview} transparent animationType="fade">
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreview(null)}>
          {preview && <PhotoImage photoId={preview.id} style={styles.previewImg} resizeMode="contain" />}
          <Text style={styles.previewHint}>Toca para cerrar</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Load photo using ?_token= query param (server accepts it as Bearer token)
function PhotoImage({ photoId, style, resizeMode = 'cover' }) {
  const [uri, setUri] = useState(null);

  React.useEffect(() => {
    (async () => {
      const token = await storage.getToken();
      setUri(`${getBaseUrl()}/photos/${photoId}/file?_token=${encodeURIComponent(token)}`);
    })();
  }, [photoId]);

  return (
    <View style={[{ aspectRatio: 1, backgroundColor: '#f1f5f9', overflow: 'hidden' }, style]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode={resizeMode} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={PRIMARY} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, paddingBottom: 100 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  card: {
    width: '48.5%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  cardBody: { padding: 8 },
  caption: { fontSize: 12, color: '#334155', fontWeight: '600', marginBottom: 2 },
  date: { fontSize: 11, color: '#94a3b8', marginBottom: 6 },
  deleteBtn: { alignSelf: 'flex-start', backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  deleteBtnText: { color: '#dc2626', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  fabRow: {
    position: 'absolute', bottom: 24, right: 24,
    flexDirection: 'row',
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 },
  modalPreview: { width: '100%', aspectRatio: 1.5, borderRadius: 10, marginBottom: 14, backgroundColor: '#f1f5f9' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 10 },
  modalInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, fontSize: 14, color: '#1e293b', marginBottom: 14 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#f1f5f9' },
  modalBtnCancelText: { color: '#64748b', fontWeight: '700' },
  modalBtnOk: { backgroundColor: PRIMARY },
  modalBtnOkText: { color: '#fff', fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.92)', justifyContent: 'center', alignItems: 'center' },
  previewImg: { width: '100%', height: '80%' },
  previewHint: { color: 'rgba(255,255,255,.5)', marginTop: 16, fontSize: 13 },
});
