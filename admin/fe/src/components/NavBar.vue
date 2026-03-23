<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api';
import { useDeploy } from '../useDeploy';
import { useActiveServer } from '../useActiveServer';

const router = useRouter();
const route = useRoute();
const alertActive = ref(false);
const alertToggling = ref(false);
const { triggerDeploy } = useDeploy();
const { deployError, activeServerId, workOffline } = useActiveServer();

async function fetchAlert() {
  try {
    const { data } = await api.get('/alert');
    alertActive.value = Boolean(data.active);
  } catch {
    // ignore
  }
}

async function toggleAlert() {
  if (alertToggling.value) return;
  alertToggling.value = true;
  try {
    const previous = alertActive.value;
    const { data } = await api.post('/alert/toggle');
    alertActive.value = Boolean(data.active);

    const result = await triggerDeploy();
    if (!result.ok) {
      const { data: reverted } = await api.post('/alert/toggle');
      alertActive.value = Boolean(reverted.active);
      deployError.value = {
        action: 'toggling critical alert',
        code: result.code,
        type: result.type,
        reversed: true,
      };
      if (alertActive.value !== previous) alertActive.value = previous;
    }
  } catch {
    // ignore
  } finally {
    alertToggling.value = false;
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

onMounted(fetchAlert);
</script>

<template>
  <nav class="navbar" v-if="route.name !== 'Login'">
    <div class="navbar-inner">
      <router-link to="/" class="navbar-brand">
        <img src="/delfi.png" alt="Delfi" class="brand-logo" />
        EOD Admin
      </router-link>
      <div class="navbar-actions">
        <button
          class="critical-alert-toggle"
          :class="{ 'critical-alert-toggle--active': alertActive }"
          @click="toggleAlert"
          :disabled="alertToggling || (!activeServerId && !workOffline)"
          :title="(!activeServerId && !workOffline) ? 'Select an active server first' : ''"
        >
          {{ alertToggling ? 'Updating + Deploying...' : `Critical Alert: ${alertActive ? 'ON' : 'OFF'}` }}
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

.critical-alert-toggle {
  border: none;
  color: var(--surface);
  font-size: 13px;
  padding: 6px 14px;
  background: #4b5563;
  border-radius: var(--radius);
}

.critical-alert-toggle:hover {
  background: #374151;
}

.critical-alert-toggle--active {
  background: #b42318;
}

.critical-alert-toggle--active:hover {
  background: #912018;
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
