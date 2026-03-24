<script setup lang="ts">
<<<<<<< HEAD
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import { useActiveServer } from '../useActiveServer';
import { useDeploy } from '../useDeploy';
import DeployErrorBanner from '../components/DeployErrorBanner.vue';
=======
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import api from "../api";
import { useActiveServer } from "../useActiveServer";
import { useDeploy } from "../useDeploy";
import DeployErrorBanner from "../components/DeployErrorBanner.vue";
>>>>>>> origin/main

const router = useRouter();
const { deployError, activeServerId } = useActiveServer();
const { toast, triggerDeploy } = useDeploy();

const articles = ref<any[]>([]);
const loading = ref(true);
const alertMessage = ref("");
const alertActive = ref(false);
const alertSaving = ref(false);
const alertToggling = ref(false);
const alertDeploying = ref(false);
const busyArticles = ref<Record<string, string>>({});

const lockByArticleId = ref<Record<string, any>>({});
const lockNotice = ref("");
const editChecking = ref<Record<string, boolean>>({});
let lockRefreshHandle: number | null = null;

function getInstallationId() {
  const key = "eod-installation-id";
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
  return Boolean(
    lock && lock.installationId && lock.installationId !== installationId,
  );
}

function lockBadgeLabel(article: any) {
  const lock = lockFor(article);
  if (!lock) return "";
  if (lock.installationId === installationId) return "Locked (this device)";
  return "Locked (other device)";
}

function lockOwnerHint(article: any) {
  const lock = lockFor(article);
  if (!lock || !lock.installationId) return "";
  return String(lock.installationId).slice(0, 8);
}

function lockBadgeClass(article: any) {
  const lock = lockFor(article);
  if (!lock) return "";
  return lock.installationId === installationId
    ? "badge-locked-self"
    : "badge-locked-other";
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
  lockNotice.value = "";
  editChecking.value = { ...editChecking.value, [article.id]: true };
  try {
    const { data } = await api.get(`/articles/${article.id}/lock`);
    const lock = data.lock || null;
    lockByArticleId.value = { ...lockByArticleId.value, [article.id]: lock };
    if (lock && lock.installationId && lock.installationId !== installationId) {
      lockNotice.value = `This article is currently being edited on another device (${String(lock.installationId).slice(0, 8)}).`;
      return;
    }
    router.push(`/articles/${article.id}`);
  } catch {
    lockNotice.value = "Could not verify lock state. Please try again.";
  } finally {
    editChecking.value = { ...editChecking.value, [article.id]: false };
  }
}

function articleStatus(article: any) {
  if (article.published && article.hasPendingChanges)
    return { label: "Published + Changes Pending", className: "badge-pending" };
  if (article.published)
    return { label: "Published", className: "badge-published" };
  return { label: "Draft", className: "badge-draft" };
}

function publishActionLabel(article: any) {
  if (article.published && article.hasPendingChanges) return "Publish update";
  if (article.published) return "Unpublish";
  return "Publish";
}

async function fetchArticles() {
  loading.value = true;
  try {
    const { data } = await api.get("/articles");
    articles.value = data;
    await fetchArticleLocks(data);
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function fetchAlert() {
  try {
    const { data } = await api.get("/alert");
    alertActive.value = Boolean(data.active);
    alertMessage.value = data.message || "";
  } catch {
    // ignore
  }
}

async function saveAlertMessage() {
  const message = alertMessage.value.trim();
  if (!message) return;

  alertSaving.value = true;
  try {
    const { data } = await api.put("/alert", { message });
    alertActive.value = Boolean(data.active);
    alertMessage.value = data.message;
  } catch {
    // ignore
  } finally {
    alertSaving.value = false;
  }
}

async function deployAlertUpdate() {
  if (alertDeploying.value || alertSaving.value) return;
  if (!activeServerId.value) {
    deployError.value = {
      action: "deploying critical alert update",
      code: "No active server selected. Add or choose a server in Server settings.",
      type: "build",
      reversed: false,
    };
    return;
  }
  alertDeploying.value = true;
  try {
    const result = await triggerDeploy();
    if (!result.ok) {
      deployError.value = {
        action: "deploying critical alert update",
        code: result.code,
        type: result.type,
        reversed: false,
      };
    }
  } finally {
    alertDeploying.value = false;
  }
}

async function toggleAlertActive() {
  if (alertToggling.value || alertSaving.value) return;
  alertToggling.value = true;
  try {
    const { data } = await api.post("/alert/toggle");
    alertActive.value = Boolean(data.active);
  } catch {
    // ignore
  } finally {
    alertToggling.value = false;
  }
}

async function togglePublish(article: any) {
  if (isLockedByOther(article)) return;
  const wasPublished = article.published && !article.hasPendingChanges;
  const endpoint = wasPublished
    ? `/articles/${article.id}/unpublish`
    : `/articles/${article.id}/publish`;
  await api.post(endpoint);
  await fetchArticles();
  const result = await triggerDeploy();
  if (!result.ok) {
    await api.post(
      wasPublished
        ? `/articles/${article.id}/publish`
        : `/articles/${article.id}/unpublish`,
    );
    await fetchArticles();
    deployError.value = {
      action: `${wasPublished ? "unpublishing" : "publishing"} "${article.title}"`,
      code: result.code,
      type: result.type,
      reversed: true,
    };
  }
}

async function deleteArticle(article: any) {
  if (isLockedByOther(article)) return;
  if (!confirm(`Delete "${article.title}"?`)) return;
  busyArticles.value[article.id] = "Deleting...";
  try {
    await api.delete(`/articles/${article.id}`);
    await fetchArticles();
    const result = await triggerDeploy();
    if (!result.ok) {
      deployError.value = {
        action: `deleting "${article.title}"`,
        code: result.code,
        type: result.type,
        reversed: false,
      };
    }
  } finally {
    delete busyArticles.value[article.id];
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("et-EE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(async () => {
  await Promise.all([fetchArticles(), fetchAlert()]);
  lockRefreshHandle = window.setInterval(() => {
    void fetchArticleLocks(articles.value);
  }, 15000);
});

onUnmounted(() => {
  if (lockRefreshHandle !== null) {
    window.clearInterval(lockRefreshHandle);
    lockRefreshHandle = null;
  }
});
</script>

<template>
  <div class="dashboard">
    <Transition name="toast">
      <div
        v-if="toast.visible"
        :class="['deploy-toast', `deploy-toast--${toast.status}`]"
      >
        <span v-if="toast.status === 'deploying'" class="deploy-spinner" />
        {{ toast.message }}
      </div>
    </Transition>

    <h1 class="section-title">Critical Alert Banner Settings</h1>
    <div class="alert-settings">
      <input
        id="alert-message"
        v-model="alertMessage"
        type="text"
        aria-label="Critical alert banner text"
        class="alert-message-input"
        placeholder="Critical alert message shown on homepage"
      />
      <div class="alert-settings-row">
        <button
          class="btn-primary"
          @click="saveAlertMessage"
          :disabled="alertSaving || !alertMessage.trim()"
        >
          {{ alertSaving ? "Saving..." : "Save Critical Alert Banner Text" }}
        </button>
        <button
          class="critical-alert-toggle"
          :class="{ 'critical-alert-toggle--active': alertActive }"
          @click="toggleAlertActive"
          :disabled="alertToggling || alertSaving"
        >
          {{
            alertToggling
              ? "Updating..."
              : `Critical Alert Banner: ${alertActive ? "ON" : "OFF"}`
          }}
        </button>
        <button
          class="btn-secondary"
          @click="deployAlertUpdate"
          :disabled="alertDeploying || alertSaving"
        >
          {{ alertDeploying ? "Deploying..." : "Deploy Critical Alert Banner Update" }}
        </button>
      </div>
    </div>

    <div class="dashboard-header">
      <h1>Articles</h1>
      <div style="display: flex; gap: 8px; align-items: center">
        <button class="btn-primary" @click="router.push('/articles/new')">
          + New Article
        </button>
      </div>
    </div>

    <DeployErrorBanner />

    <div v-if="loading" class="loading">Loading articles...</div>

    <div v-else-if="lockNotice" class="error-msg">{{ lockNotice }}</div>

    <div v-if="!loading && articles.length === 0" class="empty-state">
      <p>No articles yet. Create your first crisis update.</p>
    </div>

    <div v-if="!loading && articles.length > 0" class="articles-list">
      <div v-for="article in articles" :key="article.id" class="article-card">
        <div class="article-info">
          <div class="article-meta">
            <span class="badge" :class="articleStatus(article).className">
              {{ articleStatus(article).label }}
            </span>
            <span
              v-if="lockFor(article)"
              class="badge"
              :class="lockBadgeClass(article)"
            >
              {{ lockBadgeLabel(article) }}
            </span>
            <div class="article-dates">
              <span v-if="article.published" class="article-date">
                Published: {{ formatDate(article.publishDate) }}
              </span>
              <span
                v-if="article.published && article.hasPendingChanges"
                class="article-date"
              >
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
            This article is currently being edited on another device ({{
              lockOwnerHint(article)
            }}).
          </p>
        </div>
        <div class="article-actions">
          <button
            class="btn-primary btn-sm"
            @click="openEditor(article)"
            :disabled="isLockedByOther(article)"
            :title="isLockedByOther(article) ? 'Locked by another device' : ''"
          >
            {{ editChecking[article.id] ? "Checking..." : "Edit" }}
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
            :disabled="isLockedByOther(article) || !!busyArticles[article.id]"
            :title="isLockedByOther(article) ? 'Locked by another device' : ''"
          >
            {{
              busyArticles[article.id] === "Deleting..."
                ? "Deleting..."
                : "Delete"
            }}
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
  font-size: 24px;
}

.section-title {
  font-size: 24px;
  margin: 0 0 12px 0;
}

.alert-settings {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.alert-message-input {
  width: 100%;
}

.alert-settings-row button {
  flex: 1;
  min-width: 180px;
  font-size: 13px;
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

@media (max-width: 720px) {
  .alert-settings-row button {
    width: 100%;
    min-width: 0;
  }
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
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #fff;
}

.deploy-toast--deploying {
  background: #2563eb;
}
.deploy-toast--success {
  background: #16a34a;
}

.deploy-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
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
