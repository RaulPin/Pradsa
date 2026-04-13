import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { tasksApi } from '../api';

const PRIMARY = '#2563eb';
const PRIORITY_COLORS = { alta: '#dc2626', media: '#d97706', baja: '#16a34a' };
const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pendiente' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'done',        label: 'Completada' },
  { value: 'cancelled',   label: 'Cancelada' },
];

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function TaskDetailScreen({ route, navigation }) {
  const { task } = route.params;
  const [selectedStatus, setSelectedStatus] = useState(task.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleUpdate() {
    if (selectedStatus === task.status && !note.trim()) {
      Alert.alert('Sin cambios', 'Selecciona un nuevo estatus o agrega una nota.');
      return;
    }
    setSaving(true);
    try {
      await tasksApi.postUpdate(task.id, selectedStatus, note.trim());
      Alert.alert('¡Actualizado!', 'La tarea fue actualizada correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo actualizar la tarea.');
    } finally {
      setSaving(false);
    }
  }

  const priorityColor = PRIORITY_COLORS[task.priority] || '#6b7280';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Task info */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '22', borderColor: priorityColor }]}>
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {task.priority?.toUpperCase() || '—'}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{task.title}</Text>
        {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}

        <View style={styles.meta}>
          <Row label="Vence" value={formatDate(task.due_date)} />
          {task.location_name ? <Row label="Ubicación" value={`📍 ${task.location_name}`} /> : null}
          <Row label="Asignado por" value={task.assigned_by_name || '—'} />
        </View>
      </View>

      {/* Update form */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Actualizar estatus</Text>

        <View style={styles.statusOptions}>
          {STATUS_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.statusOption, selectedStatus === opt.value && styles.statusOptionActive]}
              onPress={() => setSelectedStatus(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.statusOptionText, selectedStatus === opt.value && styles.statusOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Nota (opcional)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Describe el avance o agrega comentarios..."
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleUpdate}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Guardar actualización</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4ff' },
  content: { padding: 16, paddingBottom: 40 },
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
  cardHeader: { flexDirection: 'row', marginBottom: 12 },
  priorityBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  priorityText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 10 },
  desc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 14 },
  meta: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  metaLabel: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  metaValue: { fontSize: 13, color: '#334155', fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 14 },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  statusOptionActive: { borderColor: PRIMARY, backgroundColor: PRIMARY + '18' },
  statusOptionText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  statusOptionTextActive: { color: PRIMARY },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  noteInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
    minHeight: 80,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6, shadowOpacity: 0, elevation: 0 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
