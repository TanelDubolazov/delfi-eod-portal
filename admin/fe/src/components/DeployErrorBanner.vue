<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useActiveServer } from '../useActiveServer';

withDefaults(defineProps<{ showChangeServer?: boolean }>(), { showChangeServer: true });

const router = useRouter();
const { deployError } = useActiveServer();

function copyError() {
  if (deployError.value) navigator.clipboard.writeText(deployError.value.code);
}

function changeServer() {
  deployError.value = null;
  router.push('/server');
}
</script>

<template>
  <div v-if="deployError" class="deploy-error-banner">
    <div class="deploy-error-main">
      <strong>Latest build failed</strong> while trying {{ deployError.action }}.
      {{ deployError.reversed ? 'Changes have been reversed.' : 'The live site was not updated.' }}
    </div>
    <div class="deploy-error-code">
      <span class="deploy-error-label">Error:</span>
      <code class="deploy-error-text">{{ deployError.code }}</code>
      <button class="deploy-error-copy" @click="copyError">Copy</button>
    </div>
    <div class="deploy-error-actions">
      <template v-if="showChangeServer">
        <button class="btn-secondary btn-sm" @click="changeServer">Change server</button>
        <span class="deploy-error-sep">or</span>
        <a href="mailto:dev@example.com" class="deploy-error-contact">Contact developer</a>
      </template>
      <button class="deploy-error-dismiss" @click="deployError = null">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.deploy-error-banner {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.deploy-error-main { font-size: 14px; color: #7f1d1d; }

.deploy-error-code { display: flex; align-items: center; gap: 8px; }

.deploy-error-label { font-size: 12px; font-weight: 600; color: #991b1b; flex-shrink: 0; }

.deploy-error-text {
  font-size: 12px;
  font-family: monospace;
  background: #fee2e2;
  color: #7f1d1d;
  padding: 3px 8px;
  border-radius: 4px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deploy-error-copy {
  font-size: 12px;
  padding: 3px 10px;
  background: none;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  color: #991b1b;
  cursor: pointer;
  flex-shrink: 0;
}
.deploy-error-copy:hover { background: #fee2e2; }

.deploy-error-actions { display: flex; align-items: center; gap: 8px; margin-top: 2px; }

.deploy-error-sep { font-size: 13px; color: #991b1b; }

.deploy-error-contact { font-size: 13px; color: #991b1b; text-decoration: underline; }

.deploy-error-dismiss {
  margin-left: auto;
  font-size: 12px;
  color: #991b1b;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
}
</style>
