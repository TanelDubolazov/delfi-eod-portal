<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';

const router = useRouter();
const articles = ref<any[]>([]);
const loading = ref(true);
const alertActive = ref(false);
const alertLoading = ref(false);
const lockByArticleId = ref<Record<string, any>>({});
const lockNotice = ref('');
const editChecking = ref<Record<string, boolean>>({});

function getInstallationId() {
  const key = 'eod-installation-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

const installationId = getInstallationId();

function lockFor(article: any) {
  return lockByArticleId.value[article.id] || null;
}

function isLockedByOther(article: any) {
  const lock = lockFor(article);
  return Boolean(lock && lock.installationId && lock.installationId !== installationId);
}

function lockBadgeLabel(article: any) {
  const lock = lockFor(article);
  if (!lock) return '';
  if (lock.installationId === installationId) return 'Locked (this device)';
  return 'Locked (other device)';
}

function lockOwnerHint(article: any) {
  const lock = lockFor(article);
  if (!lock || !lock.installationId) return '';
  return String(lock.installationId).slice(0, 8);
}

function lockBadgeClass(article: any) {
  const lock = lockFor(article);
  if (!lock) return '';
  return lock.installationId === installationId ? 'badge-locked-self' : 'badge-locked-other';
}

async function fetchArticleLocks(articleList: any[]) {
  const entries = await Promise.all(
    articleList.map(async (article) => {
      try {
        const { data } = await api.get(`/articles/${article.id}/lock`);
        return [article.id, data.lock || null] as const;
      } catch {
        return [article.id, null] as const;
      }
    }),
  );

  lockByArticleId.value = Object.fromEntries(entries);
}

async function openEditor(article: any) {
  lockNotice.value = '';
  editChecking.value = { ...editChecking.value, [article.id]: true };

  try {
    const { data } = await api.get(`/articles/${article.id}/lock`);
    const lock = data.lock || null;
    lockByArticleId.value = { ...lockByArticleId.value, [article.id]: lock };

    if (lock && lock.installationId && lock.installationId !== installationId) {
      const ownerHint = String(lock.installationId).slice(0, 8);
      lockNotice.value = `This article is currently being edited on another device (${ownerHint}).`;
      return;
    }

    router.push(`/articles/${article.id}`);
  } catch {
    lockNotice.value = 'Could not verify lock state. Please try again.';
  } finally {
    editChecking.value = { ...editChecking.value, [article.id]: false };
  }
}

function articleStatus(article: any) {
  if (article.published && article.hasPendingChanges) {
    return {
      label: 'Published + Changes Pending',
      className: 'badge-pending',
    };
  }

  if (article.published) {
    return {
      label: 'Published',
      className: 'badge-published',
    };
  }

  return {
    label: 'Draft',
    className: 'badge-draft',
  };
}

function publishActionLabel(article: any) {
  if (article.published && article.hasPendingChanges) return 'Publish update';
  if (article.published) return 'Unpublish';
  return 'Publish';
}

async function fetchArticles() {
  loading.value = true;
  try {
    const { data } = await api.get('/articles');
    articles.value = data;
    await fetchArticleLocks(data);
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
  } catch (err) {
    console.error('Failed to toggle alert:', err);
  } finally {
    alertLoading.value = false;
  }
}

async function togglePublish(article: any) {
  if (isLockedByOther(article)) return;
  const endpoint = article.published && !article.hasPendingChanges
    ? `/articles/${article.id}/unpublish`
    : `/articles/${article.id}/publish`;
  await api.post(endpoint);
  await fetchArticles();
}

async function deleteArticle(article: any) {
  if (isLockedByOther(article)) return;
  if (!confirm(`Delete "${article.title}"?`)) return;
  await api.delete(`/articles/${article.id}`);
  await fetchArticles();
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
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

    <div v-else-if="lockNotice" class="error-msg">{{ lockNotice }}</div>

    <div v-if="!loading && articles.length === 0" class="empty-state">
      <p>No articles yet. Create your first crisis update.</p>
    </div>

    <div v-if="!loading && articles.length > 0" class="articles-list">
      <div
        v-for="article in articles"
        :key="article.id"
        class="article-card"
      >
        <div class="article-info">
          <div class="article-meta">
            <span class="badge" :class="articleStatus(article).className">
              {{ articleStatus(article).label }}
            </span>
            <span v-if="lockFor(article)" class="badge" :class="lockBadgeClass(article)">
              {{ lockBadgeLabel(article) }}
            </span>
            <div class="article-dates">
              <span v-if="article.published" class="article-date">
                Published: {{ formatDate(article.publishDate) }}
              </span>
              <span v-if="article.published && article.hasPendingChanges" class="article-date">
                Draft saved: {{ formatDate(article.updatedAt) }}
              </span>
              <span v-if="!article.published" class="article-date">
                Last saved: {{ formatDate(article.updatedAt) }}
              </span>
            </div>
          </div>
          <h3 class="article-title">{{ article.title }}</h3>
          <p class="article-lead" v-if="article.lead">{{ article.lead }}</p>
          <p v-if="isLockedByOther(article)" class="article-lock-note">
            This article is currently being edited on another device ({{ lockOwnerHint(article) }}).
          </p>
        </div>
        <div class="article-actions">
          <button
            class="btn-primary btn-sm"
            @click="openEditor(article)"
            :disabled="isLockedByOther(article)"
            :title="isLockedByOther(article) ? 'Locked by another device' : ''"
          >
            {{ editChecking[article.id] ? 'Checking...' : 'Edit' }}
          </button>
          <button
            class="btn-secondary btn-sm"
            @click="togglePublish(article)"
            :disabled="isLockedByOther(article)"
            :title="isLockedByOther(article) ? 'Locked by another device' : ''"
          >
            {{ publishActionLabel(article) }}
          </button>
          <button
            class="btn-danger btn-sm"
            @click="deleteArticle(article)"
            :disabled="isLockedByOther(article)"
            :title="isLockedByOther(article) ? 'Locked by another device' : ''"
          >
            Delete
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
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.article-dates {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.badge-pending {
  background: #dbeafe;
  color: #1e40af;
}

.badge-locked {
  background: #fee2e2;
  color: #991b1b;
}

.badge-locked-self {
  background: #e0f2fe;
  color: #075985;
}

.badge-locked-other {
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

.article-lock-note {
  color: #991b1b;
  font-size: 13px;
  margin-top: 6px;
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

.loading {
  text-align: center;
  padding: 40px;
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
</style>
