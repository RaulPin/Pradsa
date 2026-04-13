import * as SecureStore from 'expo-secure-store';

const KEYS = {
  TOKEN: 'pradsa_token',
  USER: 'pradsa_user',
  BASE_URL: 'pradsa_base_url',
};

export const storage = {
  // Token
  async saveToken(token) {
    await SecureStore.setItemAsync(KEYS.TOKEN, token);
  },
  async getToken() {
    return await SecureStore.getItemAsync(KEYS.TOKEN);
  },
  async removeToken() {
    await SecureStore.deleteItemAsync(KEYS.TOKEN);
  },

  // User info
  async saveUser(user) {
    await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
  },
  async getUser() {
    const raw = await SecureStore.getItemAsync(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  },
  async removeUser() {
    await SecureStore.deleteItemAsync(KEYS.USER);
  },

  // Base URL override
  async saveBaseUrl(url) {
    await SecureStore.setItemAsync(KEYS.BASE_URL, url);
  },
  async getBaseUrl() {
    return await SecureStore.getItemAsync(KEYS.BASE_URL);
  },
  async removeBaseUrl() {
    await SecureStore.deleteItemAsync(KEYS.BASE_URL);
  },

  // Clear all auth data on logout
  async clearAll() {
    await SecureStore.deleteItemAsync(KEYS.TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER);
  },
};
