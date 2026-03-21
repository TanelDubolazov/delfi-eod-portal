<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import { useActiveServer } from '../useActiveServer';

const router = useRouter();
const { activeServerId, workOffline } = useActiveServer();

function setActive(id: string) {
  activeServerId.value = id;
  workOffline.value = false;
}

const loading = ref(true);
const saving = ref(false);
const testing = ref<string | null>(null);
const deploying = ref<string | null>(null);
const error = ref('');
const testResults = ref<Record<string, { success: boolean; ms: number; details: string }>>({})
const deployResults = ref<Record<string, { success: boolean; ms: number; details: string }>>({})

function getTestResult(id: string) {
  return testResults.value[id] || null;
}

function getDeployResult(id: string) {
  return deployResults.value[id] || null;
}

interface Server {
  id: string;
  name: string;
  type: 's3' | 'sftp';
  [key: string]: any;
}

const servers = ref<Server[]>([]);
const editing = ref<string | null>(null);

const name = ref('');
const type = ref<'s3' | 'sftp'>('sftp');
const s3 = ref({ endpoint: '', bucket: '', accessKey: '', secretKey: '', region: '' });
const sftp = ref({ host: '', port: 22, username: '', password: '', path: '/' });

async function fetchServers() {
  loading.value = true;
  try {
    const { data } = await api.get('/server');
    servers.value = data;
    if (!data.length) startNew();
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

function startNew() {
  editing.value = 'new';
  name.value = '';
  type.value = 'sftp';
  s3.value = { endpoint: '', bucket: '', accessKey: '', secretKey: '', region: '' };
  sftp.value = { host: '', port: 22, username: '', password: '', path: '/' };
  error.value = '';
}

function startEdit(server: Server) {
  editing.value = server.id;
  name.value = server.name;
  type.value = server.type;
  error.value = '';
  if (server.type === 's3') {
    s3.value = {
      endpoint: server.s3Endpoint || '',
      bucket: server.s3Bucket || '',
      accessKey: server.s3AccessKey || '',
      secretKey: '',
      region: server.s3Region || '',
    };
  } else {
    sftp.value = {
      host: server.sftpHost || '',
      port: server.sftpPort || 22,
      username: server.sftpUsername || '',
      password: '',
      path: server.sftpPath || '/',
    };
  }
}

function cancelEdit() {
  editing.value = null;
  error.value = '';
}

async function save() {
  saving.value = true;
  error.value = '';

  const payload: Record<string, any> = { name: name.value, type: type.value };
  if (editing.value !== 'new') payload.id = editing.value;

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
    editing.value = null;
    await fetchServers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function deleteServer(id: string) {
  try {
    await api.delete(`/server/${id}`);
    if (editing.value === id) editing.value = null;
    if (activeServerId.value === id) activeServerId.value = null;
    delete testResults.value[id];
    delete deployResults.value[id];
    await fetchServers();
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Delete failed';
  }
}

async function testServer(id: string) {
  testing.value = id;
  delete testResults.value[id];
  try {
    const { data } = await api.post(`/server/${id}/test`);
    testResults.value[id] = data;
  } catch (err: any) {
    testResults.value[id] = { success: false, ms: 0, details: err.response?.data?.error || 'Test failed' };
  } finally {
    testing.value = null;
  }
}

async function deployServer(id: string) {
  deploying.value = id;
  delete deployResults.value[id];
  try {
    const { data } = await api.post(`/server/${id}/deploy`);
    deployResults.value[id] = data;
  } catch (err: any) {
    deployResults.value[id] = { success: false, ms: 0, details: err.response?.data?.error || 'Deploy failed' };
  } finally {
    deploying.value = null;
  }
}

onMounted(fetchServers);
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

    <template v-else>
      <div class="server-list" v-if="servers.length">
        <div v-for="s in servers" :key="s.id" :class="['server-card', { 'server-card--active': activeServerId === s.id }]">
          <label class="server-top" :for="'radio-' + s.id">
            <input
              type="radio"
              name="activeServer"
              :id="'radio-' + s.id"
              :checked="activeServerId === s.id"
              @change="setActive(s.id)"
            />
            <div class="server-name-group">
              <strong>{{ s.name }}</strong>
              <span class="type-badge">{{ s.type.toUpperCase() }}</span>
              <span v-if="activeServerId === s.id" class="active-badge">Active</span>
            </div>
            <div class="server-actions">
              <button class="btn-secondary btn-sm" @click.prevent="testServer(s.id)" :disabled="testing === s.id || deploying === s.id">
                {{ testing === s.id ? 'Testing...' : 'Test' }}
              </button>
              <button class="btn-primary btn-sm" @click.prevent="deployServer(s.id)" :disabled="deploying === s.id || testing === s.id">
                {{ deploying === s.id ? 'Deploying...' : 'Deploy' }}
              </button>
              <button class="btn-secondary btn-sm" @click.prevent="editing === s.id ? cancelEdit() : startEdit(s)">{{ editing === s.id ? 'Close' : 'Edit' }}</button>
              <button class="btn-danger btn-sm" @click.prevent="deleteServer(s.id)">Delete</button>
            </div>
          </label>
          <div v-if="getTestResult(s.id)" :class="['result-banner', getTestResult(s.id)?.success ? 'result-ok' : 'result-err']">
            {{ getTestResult(s.id)?.success ? '✓ Connected' : '✗ Failed' }}
            <span class="result-ms">({{ getTestResult(s.id)?.ms }}ms)</span>
            — {{ getTestResult(s.id)?.details }}
          </div>
          <div v-if="getDeployResult(s.id)" :class="['result-banner', getDeployResult(s.id)?.success ? 'result-ok' : 'result-err']">
            {{ getDeployResult(s.id)?.success ? '✓ Deployed' : '✗ Deploy failed' }}
            <span class="result-ms">({{ ((getDeployResult(s.id)?.ms ?? 0) / 1000).toFixed(1) }}s)</span>
            — {{ getDeployResult(s.id)?.details }}
          </div>
        </div>
      </div>

      <button v-if="!editing && servers.length" class="btn-primary" @click="startNew">+ Add Server</button>

      <div v-if="editing" class="server-form">
        <h2>{{ editing === 'new' ? 'Add Server' : 'Edit Server' }}</h2>

        <form @submit.prevent="save">
          <div class="form-group">
            <label>Server Name</label>
            <input v-model="name" placeholder="e.g. Production, Staging" />
          </div>

          <div class="type-selector">
            <button
              :class="['type-btn', { active: type === 's3' }]"
              type="button"
              @click="type = 's3'"
            >S3 / Object Storage</button>
            <button
              :class="['type-btn', { active: type === 'sftp' }]"
              type="button"
              @click="type = 'sftp'"
            >SFTP</button>
          </div>

          <template v-if="type === 's3'">
            <div class="form-group">
              <label>Endpoint URL <span class="optional">(optional, leave blank for AWS)</span></label>
              <input v-model="s3.endpoint" placeholder="https://minio.example.com" />
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

          <div class="form-actions">
            <button class="btn-primary" type="submit" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
            <button class="btn-secondary" type="button" @click="cancelEdit">Cancel</button>
          </div>
        </form>
      </div>
    </template>
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

.server-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.server-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
}

.server-card--active {
  border-color: var(--primary);
  background: #f0f6ff;
}

.server-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
}

.server-top input[type="radio"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
  flex-shrink: 0;
}

.server-name-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.server-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.result-banner {
  padding: 8px 16px;
  font-size: 13px;
  border-top: 1px solid var(--border);
}

.result-ok {
  background: #dcfce7;
  color: #166534;
}

.result-err {
  background: #fee2e2;
  color: #991b1b;
}

.result-ms {
  opacity: 0.7;
  margin-left: 2px;
}

.type-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.server-form {
  max-width: 600px;
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 20px;
}

.server-form h2 {
  font-size: 20px;
  margin-bottom: 16px;
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

.error-msg {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  margin-bottom: 12px;
}

.active-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--primary);
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>
