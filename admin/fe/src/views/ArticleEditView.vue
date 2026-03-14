<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import EasyMDE from 'easymde';
import 'easymde/dist/easymde.min.css';
import api from '../api';

const router = useRouter();
const route = useRoute();
const isNew = computed(() => route.name === 'NewArticle');
const articleId = computed(() => route.params.id as string);
const saving = ref(false);
const error = ref('');

const articleSlug = ref('');
const markdownInput = ref<HTMLTextAreaElement | null>(null);
const markdownEditor = ref<EasyMDE | null>(null);

const form = ref({
  title: '',
  lead: '',
  leadImage: null as string | null,
  body: '',
  author: '',
  published: false,
  publishDate: new Date().toISOString().slice(0, 16),
});

// TODO: Autosave to 30 seconds before production

const AUTOSAVE_INTERVAL = 5_000;   // Autosave interval. 5 seconds for dev
const isDirty = ref(false);
const autosaving = ref(false);
const autosaveFlash = ref(false);
const lastAutosaved = ref('');
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let editorReady = false;

function markDirty() {
  if (!editorReady) return;
  isDirty.value = true;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosave, AUTOSAVE_INTERVAL);
}

async function autosave() {
  if (!isDirty.value || saving.value) return;
  if (!form.value.title.trim() && !form.value.body.trim()) return;

  autosaving.value = true;
  try {
    form.value.body = markdownEditor.value?.value() || form.value.body;

    const payload = {
      title: form.value.title,
      lead: form.value.lead,
      leadImage: form.value.leadImage,
      body: form.value.body,
      author: form.value.author || null,
      published: form.value.published,
      publishDate: form.value.publishDate
        ? new Date(form.value.publishDate).toISOString()
        : new Date().toISOString(),
    };

    if (isNew.value || !articleId.value) {
      if (!form.value.title.trim()) return;
      const { data } = await api.post('/articles', payload);
      articleSlug.value = data.slug;
      router.replace(`/articles/${data.id}`);
    } else {
      await api.put(`/articles/${articleId.value}/autosave`, payload);
    }

    isDirty.value = false;
    lastAutosaved.value = new Date().toLocaleTimeString();
    autosaveFlash.value = true;
    setTimeout(() => { autosaveFlash.value = false; }, 2500);
  } catch {
  } finally {
    autosaving.value = false;
  }
}

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
    markDirty();
  });
}

onMounted(async () => {
  if (!isNew.value && articleId.value) {
    try {
      const { data } = await api.get(`/articles/${articleId.value}`);
      articleSlug.value = data.slug || '';
      form.value.title = data.title;
      form.value.lead = data.lead;
      form.value.leadImage = data.leadImage;
      form.value.body = data.body;
      form.value.author = data.author || '';
      form.value.published = data.published;
      form.value.publishDate = data.publishDate?.slice(0, 16) || '';
      // populate textarea before EasyMDE init so CodeMirror gets the content
      if (markdownInput.value) markdownInput.value.value = data.body || '';
    } catch (err: any) {
      error.value = 'Failed to load article.';
    }
  }
  setupMarkdownEditor();
  requestAnimationFrame(() => { editorReady = true; });
});

onUnmounted(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  markdownEditor.value?.toTextArea();
  markdownEditor.value = null;
});

async function save() {
  if (!form.value.title.trim()) {
    error.value = 'Title is required';
    return;
  }

  saving.value = true;
  error.value = '';

  try {
    form.value.body = markdownEditor.value?.value() || form.value.body;

    const payload = {
      title: form.value.title,
      lead: form.value.lead,
      leadImage: form.value.leadImage,
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
      await api.put(`/articles/${articleId.value}`, payload);
    }
    isDirty.value = false;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Save failed';
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
      form.value.leadImage = `http://localhost:3001${data.url}`;
    } else {
      const markdownImage = `\n![${file.name.replace(/\.[^.]+$/, '')}](http://localhost:3001${data.url})\n`;
      markdownEditor.value?.codemirror.replaceSelection(markdownImage);
      form.value.body = markdownEditor.value?.value() || form.value.body;
    }
    markDirty();
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
        <transition name="autosave-fade">
          <span class="autosave-pill saving" v-if="autosaving" key="saving">
            <span class="autosave-dot pulse"></span> Saving
          </span>
          <span class="autosave-pill saved" v-else-if="autosaveFlash" key="saved">
            <span class="autosave-dot done"></span> Saved
          </span>
          <span class="autosave-pill idle" v-else-if="lastAutosaved" key="idle">
            {{ lastAutosaved }}
          </span>
        </transition>
        <button class="btn-primary" @click="save" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <div class="error-msg" v-if="error">{{ error }}</div>

    <div class="edit-form">
      <div class="form-group">
        <label>Title *</label>
        <input v-model="form.title" type="text" placeholder="Article title" @input="markDirty" />
      </div>

      <div class="form-group">
        <label>Lead</label>
        <textarea v-model="form.lead" rows="3" placeholder="Brief summary..." @input="markDirty"></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Author (optional)</label>
          <input v-model="form.author" type="text" placeholder="Author name" @input="markDirty" />
        </div>
        <div class="form-group">
          <label>Publish Date</label>
          <input v-model="form.publishDate" type="datetime-local" @input="markDirty" />
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
          <button v-if="form.leadImage" class="btn-danger btn-sm" @click="form.leadImage = null; markDirty()">
            Remove
          </button>
        </div>
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

.autosave-fade-enter-active,
.autosave-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.autosave-fade-enter-from { opacity: 0; transform: translateY(-4px); }
.autosave-fade-leave-to { opacity: 0; transform: translateY(4px); }

.autosave-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 20px;
  line-height: 1;
  white-space: nowrap;
}

.autosave-pill.saving {
  background: #f0f9ff;
  color: var(--primary);
}

.autosave-pill.saved {
  background: #f0fdf4;
  color: var(--success);
}

.autosave-pill.idle {
  color: var(--text-secondary);
}

.autosave-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.autosave-dot.pulse {
  background: var(--primary);
  animation: dot-pulse 1s ease-in-out infinite;
}

.autosave-dot.done {
  background: var(--success);
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
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
