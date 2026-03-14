<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';

const router = useRouter();
const loading = ref(true);
const isSetup = ref(false);
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const submitting = ref(false);

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/status');
    if (data.authenticated) {
      router.replace('/');
      return;
    }
    isSetup.value = !data.setupRequired;
  } catch {
    error.value = 'Cannot connect to server';
  } finally {
    loading.value = false;
  }
});

async function handleSetup() {
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  submitting.value = true;
  error.value = '';

  try {
    await api.post('/auth/setup', { password: password.value, credentials: {} });
    router.replace('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Setup failed';
  } finally {
    submitting.value = false;
  }
}

async function handleLogin() {
  if (!password.value) {
    error.value = 'Password required';
    return;
  }

  submitting.value = true;
  error.value = '';

  try {
    await api.post('/auth/login', { password: password.value });
    router.replace('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Login failed';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card" v-if="!loading">
      <h1>{{ isSetup ? 'EOD Admin Login' : 'EOD Admin Setup' }}</h1>
      <p class="subtitle" v-if="!isSetup">Create an admin password to get started.</p>

      <div class="error-msg" v-if="error">{{ error }}</div>

      <form @submit.prevent="isSetup ? handleLogin() : handleSetup()">
        <div class="form-group">
          <label>Password</label>
          <input
            v-model="password"
            type="password"
            :placeholder="isSetup ? 'Enter password' : 'Choose a password (min. 8 characters)'"
            autofocus
          />
        </div>

        <div class="form-group" v-if="!isSetup">
          <label>Confirm Password</label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="Repeat password"
          />
        </div>

        <button class="btn-primary" type="submit" :disabled="submitting">
          {{ submitting ? 'Please wait...' : isSetup ? 'Log In' : 'Create Admin' }}
        </button>
      </form>
    </div>

    <div class="login-card" v-else>
      <p>Loading...</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
}

.login-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 40px;
  width: 100%;
  max-width: 400px;
}

.login-card h1 {
  font-size: 22px;
  margin-bottom: 4px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.error-msg {
  background: #fef2f2;
  color: var(--danger);
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  border: 1px solid #fecaca;
  margin-bottom: 16px;
}

button[type="submit"] {
  width: 100%;
  margin-top: 4px;
}
</style>
