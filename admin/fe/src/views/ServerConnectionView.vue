<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';

const router = useRouter();

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const error = ref('');
const success = ref('');
const testResult = ref<{ success: boolean; ms: number; details: string } | null>(null);

const type = ref<'s3' | 'sftp'>('s3');

const s3 = ref({
  endpoint: '',
  bucket: '',
  accessKey: '',
  secretKey: '',
  region: '',
});

const sftp = ref({
  host: '',
  port: 22,
  username: '',
  password: '',
  path: '/',
});

const hasExisting = ref(false);

async function fetchConfig() {
  loading.value = true;
  try {
    const { data } = await api.get('/server');
    if (data.type) {
      type.value = data.type;
      hasExisting.value = true;
      if (data.type === 's3') {
        s3.value = {
          endpoint: data.s3Endpoint || '',
          bucket: data.s3Bucket || '',
          accessKey: data.s3AccessKey || '',
          secretKey: '',
          region: data.s3Region || '',
        };
      } else if (data.type === 'sftp') {
        sftp.value = {
          host: data.sftpHost || '',
          port: data.sftpPort || 22,
          username: data.sftpUsername || '',
          password: '',
          path: data.sftpPath || '/',
        };
      }
    }
  } catch (err: any) {
    console.error('Failed to load server config:', err);
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  success.value = '';

  const payload: Record<string, any> = { type: type.value };

  if (type.value === 's3') {
    payload.s3Endpoint = s3.value.endpoint;
    payload.s3Bucket = s3.value.bucket;
    payload.s3AccessKey = s3.value.accessKey;
    payload.s3SecretKey = s3.value.secretKey;
    payload.s3Region = s3.value.region;
  } else {
    payload.sftpHost = sftp.value.host;
    payload.sftpPort = sftp.value.port;
    payload.sftpUsername = sftp.value.username;
    payload.sftpPassword = sftp.value.password;
    payload.sftpPath = sftp.value.path;
  }

  try {
    await api.put('/server', payload);
    success.value = 'Settings saved';
    hasExisting.value = true;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  error.value = '';

  try {
    const { data } = await api.post('/server/test');
    testResult.value = data;
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Test failed';
  } finally {
    testing.value = false;
  }
}

onMounted(fetchConfig);
</script>

<template>
  <div class="server-page">
    <div class="server-header">
      <div>
        <h1>Server Connection</h1>
        <p class="subtitle">Configure where the static portal gets deployed.</p>
      </div>
      <button class="btn-close" @click="router.back()">✕</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else class="server-form">
      <div class="type-selector">
        <button
          :class="['type-btn', { active: type === 's3' }]"
          @click="type = 's3'"
        >
          S3 / Object Storage
        </button>
        <button
          :class="['type-btn', { active: type === 'sftp' }]"
          @click="type = 'sftp'"
        >
          SFTP
        </button>
      </div>

      <div class="info-box" v-if="hasExisting">
        Connection saved. Leave secret fields blank to keep existing values.
      </div>

      <form @submit.prevent="save">
        <template v-if="type === 's3'">
          <div class="form-group">
            <label>Endpoint URL</label>
            <input v-model="s3.endpoint" placeholder="https://s3.eu-central-1.amazonaws.com" />
          </div>
          <div class="form-group">
            <label>Bucket Name</label>
            <input v-model="s3.bucket" placeholder="eod-portal-bucket" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Access Key</label>
              <input v-model="s3.accessKey" placeholder="AKIA..." />
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input v-model="s3.secretKey" type="password" placeholder="Enter secret key" />
            </div>
          </div>
          <div class="form-group">
            <label>Region <span class="optional">(optional)</span></label>
            <input v-model="s3.region" placeholder="eu-central-1" />
          </div>
        </template>

        <template v-if="type === 'sftp'">
          <div class="form-row">
            <div class="form-group" style="flex: 2">
              <label>Host</label>
              <input v-model="sftp.host" placeholder="sftp.example.com" />
            </div>
            <div class="form-group" style="flex: 1">
              <label>Port</label>
              <input v-model.number="sftp.port" type="number" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Username</label>
              <input v-model="sftp.username" placeholder="deploy-user" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input v-model="sftp.password" type="password" placeholder="Enter password" />
            </div>
          </div>
          <div class="form-group">
            <label>Remote Path</label>
            <input v-model="sftp.path" placeholder="/var/www/portal" />
          </div>
        </template>

        <div class="error-msg" v-if="error">{{ error }}</div>
        <div class="success-msg" v-if="success">{{ success }}</div>

        <div class="form-actions">
          <button class="btn-primary" type="submit" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Connection' }}
          </button>
          <button
            class="btn-secondary"
            type="button"
            :disabled="testing || !hasExisting"
            @click="testConnection"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
        </div>

        <div v-if="testResult" :class="['test-result', testResult.success ? 'test-success' : 'test-fail']">
          <strong>{{ testResult.success ? 'Connected' : 'Failed' }}</strong>
          <span class="test-ms">({{ testResult.ms }}ms)</span>
          <p>{{ testResult.details }}</p>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.server-page h1 {
  font-size: 28px;
  margin-bottom: 4px;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
}

.btn-close {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: 36px;
  height: 36px;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-close:hover {
  background: var(--bg);
  color: var(--text);
}

.server-form {
  max-width: 600px;
}

.type-selector {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.type-btn {
  flex: 1;
  padding: 10px 16px;
  background: var(--surface);
  color: var(--text-secondary);
  border: none;
  border-radius: 0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.type-btn + .type-btn {
  border-left: 1px solid var(--border);
}

.type-btn.active {
  background: var(--primary);
  color: white;
}

.info-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
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

.optional {
  font-weight: 400;
  color: var(--text-secondary);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.form-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}

.test-result {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: var(--radius);
  font-size: 13px;
}

.test-result p {
  margin-top: 4px;
}

.test-ms {
  color: inherit;
  opacity: 0.7;
  margin-left: 4px;
}

.test-success {
  background: #dcfce7;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.test-fail {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.error-msg {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  margin-bottom: 12px;
}

.success-msg {
  background: #dcfce7;
  color: #166534;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  margin-bottom: 12px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>
