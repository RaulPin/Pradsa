import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { tasksApi } from '../api';

const PRIMARY = '#2563eb';

const PRIORITY_CONFIG = {
  alta: { label: 'Alta', bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
  media: { label: 'Media', bg: '#fffbeb', text: '#d97706', border: '#fcd34d' },
  baja: { label: 'Baja', bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
};

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', bg: '#f8fafc', text: '#64748b' },
  in_progress: { label: 'En progreso', bg: '#eff6ff', text: '#2563eb' },
  done: { label: 'Completada', bg: '#f0fdf4', text: '#16a34a' },
};

function formatDate(dateStr) {
  if (!dateStr) return 'Sin fecha';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.baja;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: cfg.bg, borderColor: cfg.border },
      ]}
    >
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function TaskItem({ task, onPress }) {
  return (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={() => onPress(task)}
      activeOpacity={0.75}
    >
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <PriorityBadge priority={task.priority} />
      </View>

      <View style={styles.taskFooter}>
        <StatusBadge status={task.status} />
        <Text style={styles.taskDueDate}>
          Vence: {formatDate(task.due_date)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TasksScreen({ navigation, user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async () => {
    try {
      setError('');
      const res = await tasksApi.getMyTasks();
      // API may return array directly or wrapped in data property
      const data = Array.isArray(res.data) ? res.data : (res.data?.tasks || []);
      setTasks(data);
    } catch (err) {
      setError(err.message || 'Error al cargar tareas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Refresh when coming back from TaskDetail
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTasks();
    });
    return unsubscribe;
  }, [navigation, loadTasks]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTasks();
  };

  const handleTaskPress = (task) => {
    navigation.navigate('TaskDetail', { task });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Cargando tareas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TaskItem task={item} onPress={handleTaskPress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[PRIMARY]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Sin tareas asignadas</Text>
            <Text style={styles.emptySubtitle}>
              No tienes tareas pendientes en este momento.
            </Text>
          </View>
        }
        ListHeaderComponent={
          tasks.length > 0 ? (
            <Text style={styles.listHeader}>
              {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'} asignadas
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4ff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4ff',
  },
  loadingText: {
    color: '#64748b',
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listHeader: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 21,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  taskDueDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    margin: 16,
    padding: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
});
