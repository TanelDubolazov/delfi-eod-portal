<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import NavBar from './components/NavBar.vue';
import { useActiveServer } from './useActiveServer';

const route = useRoute();
const router = useRouter();
const { activeServerId, workOffline } = useActiveServer();

const showPrompt = computed(() =>
  route.name &&
  route.name !== 'Login' &&
  route.name !== 'ServerConnection' &&
  !activeServerId.value &&
  !workOffline.value
);

function chooseOffline() { workOffline.value = true; }
</script>

<template>
  <div id="app">
    <NavBar />
    <div v-if="showPrompt" class="server-prompt-overlay">
      <div class="server-prompt">
        <h3>No active server</h3>
        <p>Without an active server, publishing articles and toggling alerts won't deploy to your site.</p>
        <div class="server-prompt-actions">
          <button class="btn-primary" @click="router.push('/server')">Choose Server</button>
          <button class="btn-secondary" @click="chooseOffline">Work Offline</button>
        </div>
      </div>
    </div>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style>
:root {
  --primary: #1a56db;
  --primary-hover: #1e40af;
  --danger: #dc2626;
  --danger-hover: #b91c1c;
  --success: #16a34a;
  --warning: #f59e0b;
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
  --radius: 8px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}

.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

button {
  cursor: pointer;
  border: none;
  border-radius: var(--radius);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}
.btn-primary:hover { background: var(--primary-hover); }

.btn-danger {
  background: var(--danger);
  color: white;
}
.btn-danger:hover { background: var(--danger-hover); }

.btn-success {
  background: var(--success);
  color: white;
}

.btn-secondary {
  background: var(--border);
  color: var(--text);
}

input, textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 14px;
  font-family: inherit;
}

input:focus, textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.1);
}

/* global input/textarea styles above break CodeMirror's hidden textarea */
.CodeMirror textarea,
.CodeMirror textarea:focus {
  width: auto;
  padding: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.server-prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.server-prompt {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}

.server-prompt h3 {
  font-size: 20px;
  margin-bottom: 10px;
}

.server-prompt p {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
  line-height: 1.6;
}

.server-prompt-actions {
  display: flex;
  gap: 10px;
}
</style>
