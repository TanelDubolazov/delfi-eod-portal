<script setup lang="ts">
// TODO: user info + logout button
</script>

<template>
  <nav class="navbar">
    <div class="navbar-inner">
      <router-link to="/" class="navbar-brand">
        <img src="/delfi.png" alt="Delfi" class="brand-logo" />
        EOD Admin
      </router-link>
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

.user-name {
  color: var(--text-secondary);
  font-size: 14px;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
}
</style>
