'use strict';
import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { storage } from './src/storage';
import { initBaseUrl, locationApi } from './src/api';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import ForceChangePasswordScreen from './src/screens/ForceChangePasswordScreen';

const LOCATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState(null);
  const locationTimer = useRef(null);

  useEffect(() => {
    (async () => {
      await initBaseUrl();
      const savedUser = await storage.getUser();
      const savedToken = await storage.getToken();
      if (savedUser && savedToken) {
        setUser(savedUser);
        startLocationTracking();
      }
      setBootstrapping(false);
    })();
    return () => stopLocationTracking();
  }, []);

  function startLocationTracking() {
    stopLocationTracking();
    locationTimer.current = setInterval(reportLocation, LOCATION_INTERVAL_MS);
    // Report immediately on start
    reportLocation();
  }

  function stopLocationTracking() {
    if (locationTimer.current) {
      clearInterval(locationTimer.current);
      locationTimer.current = null;
    }
  }

  async function reportLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await locationApi.report(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
    } catch {
      // Silently fail — best-effort location reporting
    }
  }

  function handleLoginSuccess(loggedUser) {
    setUser(loggedUser);
    // Don't start GPS tracking until password is changed
    if (!loggedUser.must_change_password) {
      startLocationTracking();
    }
  }

  function handlePasswordChanged(updatedUser) {
    setUser(updatedUser);
    startLocationTracking();
  }

  async function handleLogout() {
    stopLocationTracking();
    await storage.clearAll();
    setUser(null);
  }

  if (bootstrapping) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (user.must_change_password) {
    return <ForceChangePasswordScreen user={user} onPasswordChanged={handlePasswordChanged} />;
  }

  return <AppNavigator user={user} onLogout={handleLogout} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
  },
});
