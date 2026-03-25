import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View } from 'react-native';

import HomeScreen from '../screens/HomeScreen';
import TasksScreen from '../screens/TasksScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const TasksStack = createStackNavigator();

// Simple icon component using text symbols
function TabIcon({ symbol, focused, color }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, color }}>{symbol}</Text>
    </View>
  );
}

function TasksStackNavigator({ user, onLogout }) {
  return (
    <TasksStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#2563eb' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <TasksStack.Screen
        name="TasksList"
        options={{ title: 'Tareas' }}
      >
        {(props) => <TasksScreen {...props} user={user} />}
      </TasksStack.Screen>
      <TasksStack.Screen
        name="TaskDetail"
        options={{ title: 'Detalle de tarea' }}
      >
        {(props) => <TaskDetailScreen {...props} user={user} />}
      </TasksStack.Screen>
    </TasksStack.Navigator>
  );
}

export default function AppNavigator({ user, onLogout }) {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#e2e8f0',
            paddingBottom: 4,
            paddingTop: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          headerStyle: { backgroundColor: '#2563eb' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        })}
      >
        <Tab.Screen
          name="Home"
          options={{
            title: 'Inicio',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon symbol="🏠" focused={focused} color={color} />
            ),
          }}
        >
          {(props) => <HomeScreen {...props} user={user} />}
        </Tab.Screen>

        <Tab.Screen
          name="Tasks"
          options={{
            headerShown: false,
            title: 'Tareas',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon symbol="📋" focused={focused} color={color} />
            ),
          }}
        >
          {(props) => <TasksStackNavigator {...props} user={user} onLogout={onLogout} />}
        </Tab.Screen>

        <Tab.Screen
          name="Profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon symbol="👤" focused={focused} color={color} />
            ),
          }}
        >
          {(props) => <ProfileScreen {...props} user={user} onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
