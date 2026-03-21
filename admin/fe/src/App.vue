<script setup lang="ts">
import { RouterView } from 'vue-router';
import NavBar from './components/NavBar.vue';
</script>

<template>
  <div id="app">
    <NavBar />
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
</style>
