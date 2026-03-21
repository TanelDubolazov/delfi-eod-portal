<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import { useActiveServer } from '../useActiveServer';

const router = useRouter();
const { activeServerId } = useActiveServer();
const articles = ref<any[]>([]);
const loading = ref(true);
const alertActive = ref(false);
const alertLoading = ref(false);
const busyArticles = ref<Record<string, string>>({});

const toast = ref<{ visible: boolean; status: 'deploying' | 'success' | 'error'; message: string }>({
  visible: false,
  status: 'deploying',
  message: '',
});

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(status: 'deploying' | 'success' | 'error', message: string) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.value = { visible: true, status, message };
  if (status !== 'deploying') {
    toastTimer = setTimeout(() => { toast.value.visible = false; }, 6000);
  }
}

async function triggerDeploy() {
  const id = activeServerId.value;
  if (!id) return;
  showToast('deploying', 'Building and deploying...');
  try {
    const { data } = await api.post(`/server/${id}/deploy`);
    if (data.success) {
      showToast('success', `Deployed in ${(data.ms / 1000).toFixed(1)}s`);
    } else {
      showToast('error', data.details || 'Deploy failed');
    }
  } catch (err: any) {
    showToast('error', err.response?.data?.error || 'Deploy failed');
  }
}

async function fetchArticles() {
  loading.value = true;
  try {
    const { data } = await api.get('/articles');
    articles.value = data;
  } catch (err) {
    console.error('Failed to fetch articles:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchAlert() {
  try {
    const { data } = await api.get('/alert');
    alertActive.value = data.active;
  } catch (err) {
    console.error('Failed to fetch alert state:', err);
  }
}

async function toggleAlert() {
  alertLoading.value = true;
  try {
    const { data } = await api.post('/alert/toggle');
    alertActive.value = data.active;
    await triggerDeploy();
  } catch (err) {
    console.error('Failed to toggle alert:', err);
  } finally {
    alertLoading.value = false;
  }
}

async function togglePublish(article: any) {
  const action = article.published ? 'Unpublishing...' : 'Publishing...';
  busyArticles.value[article.id] = action;
  try {
    const endpoint = article.published
      ? `/articles/${article.id}/unpublish`
      : `/articles/${article.id}/publish`;
    await api.post(endpoint);
    await fetchArticles();
    await triggerDeploy();
  } finally {
    delete busyArticles.value[article.id];
  }
}

async function deleteArticle(article: any) {
  if (!confirm(`Delete "${article.title}"?`)) return;
  busyArticles.value[article.id] = 'Deleting...';
  try {
    await api.delete(`/articles/${article.id}`);
    await fetchArticles();
    await triggerDeploy();
  } finally {
    delete busyArticles.value[article.id];
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('et-EE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(async () => {
  await Promise.all([fetchArticles(), fetchAlert()]);
});
</script>

<template>
  <div class="dashboard">
    <Transition name="toast">
      <div v-if="toast.visible" :class="['deploy-toast', `deploy-toast--${toast.status}`]">
        <span v-if="toast.status === 'deploying'" class="deploy-spinner" />
        {{ toast.message }}
      </div>
    </Transition>
    <div class="dashboard-header">
      <h1>Articles</h1>
      <div style="display:flex; gap: 8px; align-items: center;">
        <button
          class="btn-primary"
          @click="toggleAlert"
          :disabled="alertLoading"
        >
          {{ alertLoading ? 'Updating...' : (alertActive ? 'Deactivate Critical Alert' : 'Activate Critical Alert') }}
        </button>
        <button class="btn-primary" @click="router.push('/articles/new')">
          + New Article
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading articles...</div>

    <div v-else-if="articles.length === 0" class="empty-state">
      <p>No articles yet. Create your first crisis update.</p>
    </div>

    <div v-else class="articles-list">
      <div
        v-for="article in articles"
        :key="article.id"
        class="article-card"
      >
        <div class="article-info">
          <div class="article-meta">
            <span class="badge" :class="article.published ? 'badge-published' : 'badge-draft'">
              {{ article.published ? 'Published' : 'Draft' }}
            </span>
            <span class="article-date">{{ formatDate(article.updatedAt) }}</span>
          </div>
          <h3 class="article-title">{{ article.title }}</h3>
          <p class="article-lead" v-if="article.lead">{{ article.lead }}</p>
        </div>
        <div class="article-actions">
          <button
            class="btn-primary btn-sm"
            @click="router.push(`/articles/${article.id}`)"
            :disabled="!!busyArticles[article.id]"
          >
            Edit
          </button>
          <button
            class="btn-secondary btn-sm"
            @click="togglePublish(article)"
            :disabled="!!busyArticles[article.id]"
          >
            {{ busyArticles[article.id] && busyArticles[article.id] !== 'Deleting...' ? busyArticles[article.id] : (article.published ? 'Unpublish' : 'Publish') }}
          </button>
          <button
            class="btn-danger btn-sm"
            @click="deleteArticle(article)"
            :disabled="!!busyArticles[article.id]"
          >
            {{ busyArticles[article.id] === 'Deleting...' ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.dashboard-header h1 {
  font-size: 28px;
}

.articles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.article-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  transition: box-shadow 0.15s;
}

.article-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.article-card.locked {
  opacity: 0.7;
}

.article-info {
  flex: 1;
  min-width: 0;
}

.article-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.badge-published {
  background: #dcfce7;
  color: #166534;
}

.badge-draft {
  background: #fef3c7;
  color: #92400e;
}

.badge-locked {
  background: #fee2e2;
  color: #991b1b;
}

.article-date {
  color: var(--text-secondary);
  font-size: 13px;
}

.article-title {
  font-size: 18px;
  margin-bottom: 4px;
}

.article-lead {
  color: var(--text-secondary);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.article-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.deploy-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  color: #fff;
}

.deploy-toast--deploying { background: #2563eb; }
.deploy-toast--success   { background: #16a34a; }
.deploy-toast--error     { background: #dc2626; }

.deploy-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>
