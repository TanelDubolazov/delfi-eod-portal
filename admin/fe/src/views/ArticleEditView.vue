<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import api from '../api';

const router = useRouter();
const route = useRoute();
const isNew = computed(() => route.name === 'NewArticle');
const articleId = computed(() => route.params.id as string);
const saving = ref(false);
const error = ref('');
const lockToken = ref('');
const lockHeartbeatHandle = ref<number | null>(null);
const lockReady = ref(false);
const releasingLock = ref(false);

function getInstallationId() {
  const key = 'eod-installation-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

const installationId = getInstallationId();

const articleSlug = ref('');
const markdownInput = ref<HTMLTextAreaElement | null>(null);
const markdownEditor = ref<EasyMDE | null>(null);

function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const form = ref({
  title: '',
  lead: '',
  leadImage: null as string | null,
  leadImageAlt: '',
  body: '',
  author: '',
  published: false,
  publishDate: toDatetimeLocalValue(new Date().toISOString()),
});

function setupMarkdownEditor() {
  if (!markdownInput.value) return;

  markdownEditor.value = new EasyMDE({
    element: markdownInput.value,
    spellChecker: false,
    status: false,
    minHeight: '300px',
    toolbar: [
      'bold',
      'italic',
      'heading-2',
      'heading-3',
      '|',
      'unordered-list',
      'ordered-list',
      'quote',
      '|',
      'link',
      'preview',
      'side-by-side',
      'fullscreen',
    ],
  });

  markdownEditor.value.codemirror.on('change', () => {
    form.value.body = markdownEditor.value?.value() || '';
  });
}

async function releaseLock() {
  if (releasingLock.value) return;
  if (isNew.value || !articleId.value || !lockToken.value) return;
  releasingLock.value = true;
  try {
    await api.post(`/articles/${articleId.value}/lock/release`, {
      token: lockToken.value,
    });
  } catch {
    // no-op
  } finally {
    lockToken.value = '';
    lockReady.value = false;
    if (lockHeartbeatHandle.value !== null) {
      window.clearInterval(lockHeartbeatHandle.value);
      lockHeartbeatHandle.value = null;
    }
    releasingLock.value = false;
  }
}

async function refreshLock() {
  if (isNew.value || !articleId.value || !lockToken.value) return;
  try {
    await api.post(`/articles/${articleId.value}/lock/refresh`, {
      installationId,
      token: lockToken.value,
    });
  } catch (err: any) {
    if (err.response?.status === 423) {
      error.value = 'This article lock was taken by another editor. Please reopen the article.';
      await releaseLock();
    }
  }
}

async function acquireLock() {
  if (isNew.value || !articleId.value) {
    lockReady.value = true;
    return true;
  }

  lockToken.value = crypto.randomUUID();

  try {
    await api.post(`/articles/${articleId.value}/lock/acquire`, {
      installationId,
      token: lockToken.value,
    });
    lockReady.value = true;
    lockHeartbeatHandle.value = window.setInterval(() => {
      void refreshLock();
    }, 5 * 60 * 1000);
    return true;
  } catch (err: any) {
    lockReady.value = false;
    lockToken.value = '';

    if (err.response?.status === 423) {
      const holder = err.response?.data?.lock?.installationId;
      const ownerHint = holder ? ` (${String(holder).slice(0, 8)})` : '';
      error.value = `This article is currently being edited on another device${ownerHint}.`;
    } else if (err.response?.status === 503) {
      error.value = 'Lock service is unavailable. Check server connection settings.';
    } else {
      error.value = 'Failed to acquire article lock.';
    }

    return false;
  }
}

onMounted(async () => {
  const lockOk = await acquireLock();
  if (!lockOk) return;

  if (!isNew.value && articleId.value) {
    try {
      const { data } = await api.get(`/articles/${articleId.value}`);
      articleSlug.value = data.slug || '';
      form.value.title = data.title;
      form.value.lead = data.lead;
      form.value.leadImage = data.leadImage;
      form.value.leadImageAlt = data.leadImageAlt || '';
      form.value.body = data.body;
      form.value.author = data.author || '';
      form.value.published = data.published;
      form.value.publishDate = toDatetimeLocalValue(data.publishDate) || '';
      // populate textarea before EasyMDE init so CodeMirror gets the content
      if (markdownInput.value) markdownInput.value.value = data.body || '';
    } catch (err: any) {
      error.value = 'Failed to load article.';
    }
  }
  setupMarkdownEditor();
});

onUnmounted(() => {
  void releaseLock();
  markdownEditor.value?.toTextArea();
  markdownEditor.value = null;
});

onBeforeRouteLeave(async () => {
  await releaseLock();
});

async function save() {
  if (!form.value.title.trim()) {
    error.value = 'Title is required';
    return;
  }

  saving.value = true;
  error.value = '';

  if (!lockReady.value) {
    error.value = 'Article lock is not active.';
    saving.value = false;
    return;
  }

  try {
    form.value.body = markdownEditor.value?.value() || form.value.body;

    const payload = {
      title: form.value.title,
      lead: form.value.lead,
      leadImage: form.value.leadImage,
      leadImageAlt: form.value.leadImageAlt,
      body: form.value.body,
      author: form.value.author || null,
      published: form.value.published,
      publishDate: form.value.publishDate
        ? new Date(form.value.publishDate).toISOString()
        : new Date().toISOString(),
    };

    if (isNew.value) {
      const { data } = await api.post('/articles', payload);
      articleSlug.value = data.slug;
    } else {
      await api.put(`/articles/${articleId.value}`, payload, {
        headers: {
          'x-article-lock-token': lockToken.value,
        },
      });
    }
    await releaseLock();
    router.push('/');
  } catch (err: any) {
    if (err.response?.status === 423) {
      error.value = 'Your lock expired or was replaced. Reopen the article to continue.';
    } else {
      error.value = err.response?.data?.error || 'Save failed';
    }
  } finally {
    saving.value = false;
  }
}

async function uploadImage(event: Event, context: 'lead' | 'article') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!articleSlug.value) {
    // Save article first to get a slug
    if (!form.value.title.trim()) {
      error.value = 'Save the article first (title required) before uploading images';
      return;
    }
    try {
      const { data } = await api.post('/articles', {
        title: form.value.title,
        lead: form.value.lead,
        body: form.value.body,
        author: form.value.author || null,
      });
      articleSlug.value = data.slug;
      router.replace(`/articles/${data.id}`);
    } catch {
      error.value = 'Failed to save article before image upload';
      return;
    }
  }

  const formData = new FormData();
  formData.append('image', file);
  formData.append('context', context);
  formData.append('articleSlug', articleSlug.value);

  try {
    const { data } = await api.post('/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (context === 'lead') {
      form.value.leadImage = `http://127.0.0.1:3001${data.url}`;
    } else {
      const markdownImage = `\n![${file.name.replace(/\.[^.]+$/, '')}](http://127.0.0.1:3001${data.url})\n`;
      markdownEditor.value?.codemirror.replaceSelection(markdownImage);
      form.value.body = markdownEditor.value?.value() || form.value.body;
    }
  } catch {
    error.value = 'Image upload failed';
  }
}
</script>

<template>
  <div class="article-edit">
    <div class="edit-header">
      <button class="btn-secondary" @click="router.push('/')">← Back</button>
      <h1>{{ isNew ? 'New Article' : 'Edit Article' }}</h1>
      <div class="edit-actions">
        <button class="btn-primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <div class="lock-msg" v-if="!isNew && lockReady && !error">
      Editing lock active for this article.
    </div>

    <div class="error-msg" v-if="error">{{ error }}</div>

    <div class="edit-form">
      <div class="form-group">
        <label>Title *</label>
        <input v-model="form.title" type="text" placeholder="Article title" />
      </div>

      <div class="form-group">
        <label>Lead</label>
        <textarea v-model="form.lead" rows="3" placeholder="Brief summary..."></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Author (optional)</label>
          <input v-model="form.author" type="text" placeholder="Author name" />
        </div>
        <div class="form-group">
          <label>Publish Date</label>
          <input v-model="form.publishDate" type="datetime-local" />
        </div>
      </div>

      <div class="form-group">
        <label>Lead Image</label>
        <div class="image-upload">
          <img v-if="form.leadImage" :src="form.leadImage" class="lead-preview" />
          <label class="upload-btn btn-secondary">
            {{ form.leadImage ? 'Change Image' : 'Upload Lead Image' }}
            <input type="file" accept="image/*" @change="uploadImage($event, 'lead')" hidden />
          </label>
          <button v-if="form.leadImage" class="btn-danger btn-sm" @click="form.leadImage = null">
            Remove
          </button>
        </div>
      </div>

      <div class="form-group">
        <label>Lead Image Alt Text</label>
        <input
          v-model="form.leadImageAlt"
          type="text"
          placeholder="Short image description for accessibility"
        />
      </div>

      <div class="form-group">
        <label>Body</label>
        <div class="md-toolbar">
          <label class="toolbar-btn" title="Insert Image">
            📷 Image
            <input type="file" accept="image/*" @change="uploadImage($event, 'article')" hidden />
          </label>
        </div>
        <textarea ref="markdownInput" class="markdown-input"></textarea>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.edit-header h1 {
  flex: 1;
  font-size: 24px;
}

.edit-form {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.image-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lead-preview {
  max-width: 300px;
  max-height: 180px;
  border-radius: var(--radius);
  object-fit: cover;
  border: 1px solid var(--border);
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 13px;
}

.md-toolbar {
  display: flex;
  margin-bottom: 8px;
}

.toolbar-btn {
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.toolbar-btn:hover {
  background: var(--border);
}

.markdown-input {
  min-height: 300px;
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

.lock-msg {
  background: #eff6ff;
  color: #1d4ed8;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  border: 1px solid #bfdbfe;
  margin-bottom: 16px;
}
</style>
