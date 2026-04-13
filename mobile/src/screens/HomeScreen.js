import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { attendanceApi } from '../api';

const PRIMARY = '#2563eb';

function formatTime(isoString) {
  if (!isoString) return '--:--';
  // SQLite returns timestamps without timezone suffix — treat as UTC
  const normalized = isoString.replace(' ', 'T').replace(/Z?$/, 'Z');
  const d = new Date(normalized);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function calcHoursWorked(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const diff = new Date(clockOut) - new Date(clockIn);
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Se requiere permiso de ubicación para registrar asistencia.');
  }
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
  };
}

export default function HomeScreen({ user }) {
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAttendance = useCallback(async () => {
    try {
      setError('');
      const res = await attendanceApi.getToday();
      setAttendance(res.data);
    } catch (err) {
      // 404 or empty means no record yet today — that's fine
      if (err.message && err.message.includes('404')) {
        setAttendance(null);
      } else {
        setError(err.message || 'Error al cargar asistencia.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAttendance();
  };

  const handleClockIn = async () => {
    setActionLoading(true);
    setError('');
    try {
      const coords = await getCurrentLocation();
      await attendanceApi.clockIn(coords.lat, coords.lng);
      await loadAttendance();
      Alert.alert('¡Entrada registrada!', 'Tu entrada ha sido registrada correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo registrar la entrada.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);
    setError('');
    try {
      const coords = await getCurrentLocation();
      await attendanceApi.clockOut(coords.lat, coords.lng);
      await loadAttendance();
      Alert.alert('¡Salida registrada!', 'Tu salida ha sido registrada correctamente.');
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo registrar la salida.');
    } finally {
      setActionLoading(false);
    }
  };

  const hasClockedIn = !!(attendance && attendance.clock_in);
  const hasClockedOut = !!(attendance && attendance.clock_out);
  const hoursWorked = calcHoursWorked(attendance?.clock_in, attendance?.clock_out);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY]} />
      }
    >
      {/* Date header */}
      <View style={styles.dateCard}>
        <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'empleado'} 👋</Text>
        <Text style={styles.dateText}>{formatDate(new Date())}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Cargando asistencia...</Text>
        </View>
      ) : (
        <>
          {/* Status Card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Estado de hoy</Text>

            <View style={styles.timeRow}>
              <View style={styles.timeBlock}>
                <Text style={styles.timeLabel}>Entrada</Text>
                <Text style={[styles.timeValue, hasClockedIn && styles.timeValueActive]}>
                  {formatTime(attendance?.clock_in)}
                </Text>
              </View>
              <View style={styles.timeDivider} />
              <View style={styles.timeBlock}>
                <Text style={styles.timeLabel}>Salida</Text>
                <Text style={[styles.timeValue, hasClockedOut && styles.timeValueActive]}>
                  {formatTime(attendance?.clock_out)}
                </Text>
              </View>
            </View>

            {hoursWorked && (
              <View style={styles.hoursBox}>
                <Text style={styles.hoursLabel}>Tiempo trabajado</Text>
                <Text style={styles.hoursValue}>{hoursWorked}</Text>
              </View>
            )}

            {!hasClockedIn && !hasClockedOut && (
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.statusBadgeText}>Sin registros hoy</Text>
              </View>
            )}
            {hasClockedIn && !hasClockedOut && (
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} />
                <Text style={styles.statusBadgeText}>Trabajando</Text>
              </View>
            )}
            {hasClockedIn && hasClockedOut && (
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: '#6b7280' }]} />
                <Text style={styles.statusBadgeText}>Jornada completada</Text>
              </View>
            )}
          </View>

          {/* Error message */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Registrar asistencia</Text>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.clockInBtn,
                (hasClockedIn || actionLoading) && styles.btnDisabled,
              ]}
              onPress={handleClockIn}
              disabled={hasClockedIn || actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.actionBtnIcon}>→</Text>
                  <Text style={styles.actionBtnText}>Registrar entrada</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.clockOutBtn,
                (!hasClockedIn || hasClockedOut || actionLoading) && styles.btnDisabled,
              ]}
              onPress={handleClockOut}
              disabled={!hasClockedIn || hasClockedOut || actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.actionBtnIcon}>←</Text>
                  <Text style={styles.actionBtnText}>Registrar salida</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Info note */}
          <Text style={styles.infoNote}>
            Se usará tu ubicación GPS al registrar entrada o salida.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4ff',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    alignItems: 'center',
    paddingTop: 48,
  },
  loadingText: {
    color: '#64748b',
    marginTop: 12,
    fontSize: 14,
  },
  dateCard: {
    backgroundColor: PRIMARY,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  greeting: {
    color: '#bfdbfe',
    fontSize: 14,
    marginBottom: 4,
  },
  dateText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
  },
  timeDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e2e8f0',
  },
  timeLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#cbd5e1',
  },
  timeValueActive: {
    color: '#1e293b',
  },
  hoursBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  hoursLabel: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
  },
  hoursValue: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusBadgeText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 14,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  clockInBtn: {
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
  },
  clockOutBtn: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
  },
  btnDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  actionBtnIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  infoNote: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    paddingHorizontal: 16,
  },
});
