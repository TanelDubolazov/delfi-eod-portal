<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api';
import { useActiveServer } from '../useActiveServer';

const router = useRouter();
const route = useRoute();
const previewBuilding = ref(false);
const { deployError } = useActiveServer();

async function buildPreview() {
  if (previewBuilding.value) return;
  const previewWindow = window.open('', '_blank');
  previewBuilding.value = true;
  try {
    const { data } = await api.post('/server/build-preview');
    if (data.success) {
      if (previewWindow) {
        previewWindow.location.href = 'http://localhost:4321';
        previewWindow.focus();
      } else {
        window.open('http://localhost:4321', '_blank');
      }
    } else {
      if (previewWindow) previewWindow.close();
      deployError.value = {
        action: 'building preview',
        code: data.details || 'Build failed',
        type: 'build',
        reversed: false,
      };
    }
  } catch (err: any) {
    if (previewWindow) previewWindow.close();
    deployError.value = {
      action: 'building preview',
      code: err.response?.data?.error || err.message || 'Build failed',
      type: 'build',
      reversed: false,
    };
  } finally {
    previewBuilding.value = false;
  }
}

async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // continue even if server errors
  }
  router.push('/login');
}

function toggleServer() {
  if (route.path === '/server') router.back();
  else router.push('/server');
}
</script>

<template>
  <nav class="navbar" v-if="route.name && route.name !== 'Login'">
    <div class="navbar-inner">
      <router-link to="/" class="navbar-brand">
        <img src="/delfi.png" alt="Delfi" class="brand-logo" />
        EOD Admin
      </router-link>
      <div class="navbar-actions">
        <button
          class="preview-btn"
          @click="buildPreview"
          :disabled="previewBuilding"
        >
          {{ previewBuilding ? 'Building Preview...' : 'Build Preview' }}
        </button>
        <button class="nav-link server-link" @click="toggleServer">⚙ Server</button>
        <button class="btn-secondary btn-sm" @click="logout">Log Out</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}

.navbar-brand {
  font-weight: 700;
  font-size: 18px;
  color: var(--text);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-logo {
  height: 28px;
  width: auto;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.nav-link:hover {
  color: var(--text);
}

.server-link {
  background: var(--text);
  color: var(--surface);
  border: none;
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 13px;
}

.server-link:hover {
  background: var(--text-secondary);
  color: var(--surface);
}

.preview-btn {
  border: none;
  color: var(--surface);
  font-size: 13px;
  padding: 6px 14px;
  background: #4b5563;
  border-radius: var(--radius);
}

.preview-btn:hover {
  background: #374151;
}

.preview-btn:disabled {
  opacity: 0.6;
}

.user-name {
  color: var(--text-secondary);
  font-size: 14px;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
}
</style>
