<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import api from '../api';

const router = useRouter();
const route = useRoute();
const isNew = computed(() => route.name === 'NewArticle');
const articleId = computed(() => route.params.id as string);
const saving = ref(false);
const error = ref('');

const articleSlug = ref('');

const form = ref({
  title: '',
  lead: '',
  leadImage: null as string | null,
  body: '',
  author: '',
  published: false,
  publishDate: new Date().toISOString().slice(0, 16),
});

const editor = useEditor({
  extensions: [
    StarterKit,
    Image.configure({ inline: false, allowBase64: true }),
  ],
  content: '',
  onUpdate: ({ editor: e }) => {
    form.value.body = e.getHTML();
  },
});

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
      editor.value?.commands.setContent(data.body || '');
    } catch (err: any) {
      error.value = 'Failed to load article.';
    }
  }
});

async function save() {
  if (!form.value.title.trim()) {
    error.value = 'Title is required';
    return;
  }

  saving.value = true;
  error.value = '';

  try {
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
      router.replace(`/articles/${data.id}`);
    } else {
      await api.put(`/articles/${articleId.value}`, payload);
    }
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
      editor.value?.chain().focus().setImage({ src: `http://localhost:3001${data.url}` }).run();
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
        <label>Body</label>
        <div class="editor-toolbar" v-if="editor">
          <button
            :class="{ active: editor.isActive('bold') }"
            @click="editor.chain().focus().toggleBold().run()"
            title="Bold"
          ><b>B</b></button>
          <button
            :class="{ active: editor.isActive('italic') }"
            @click="editor.chain().focus().toggleItalic().run()"
            title="Italic"
          ><i>I</i></button>
          <button
            :class="{ active: editor.isActive('heading', { level: 2 }) }"
            @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
            title="Heading"
          >H2</button>
          <button
            :class="{ active: editor.isActive('heading', { level: 3 }) }"
            @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
            title="Heading 3"
          >H3</button>
          <button
            :class="{ active: editor.isActive('bulletList') }"
            @click="editor.chain().focus().toggleBulletList().run()"
            title="Bullet List"
          >• List</button>
          <button
            :class="{ active: editor.isActive('orderedList') }"
            @click="editor.chain().focus().toggleOrderedList().run()"
            title="Ordered List"
          >1. List</button>
          <button
            :class="{ active: editor.isActive('blockquote') }"
            @click="editor.chain().focus().toggleBlockquote().run()"
            title="Quote"
          >" Quote</button>
          <span class="toolbar-divider"></span>
          <label class="toolbar-btn" title="Insert Image">
            📷 Image
            <input type="file" accept="image/*" @change="uploadImage($event, 'article')" hidden />
          </label>
        </div>
        <EditorContent :editor="editor" class="editor-content" />
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

/* Editor */
.editor-toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  background: #f9fafb;
  flex-wrap: wrap;
}

.editor-toolbar button,
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

.editor-toolbar button:hover,
.toolbar-btn:hover {
  background: var(--border);
}

.editor-toolbar button.active {
  background: var(--primary);
  color: white;
}

.toolbar-divider {
  width: 1px;
  background: var(--border);
  margin: 0 4px;
}

.editor-content {
  border: 1px solid var(--border);
  border-radius: 0 0 var(--radius) var(--radius);
  min-height: 300px;
}

.editor-content :deep(.tiptap) {
  padding: 16px;
  min-height: 300px;
  outline: none;
}

.editor-content :deep(.tiptap p) {
  margin-bottom: 12px;
}

.editor-content :deep(.tiptap h2) {
  font-size: 22px;
  margin: 20px 0 10px;
}

.editor-content :deep(.tiptap h3) {
  font-size: 18px;
  margin: 16px 0 8px;
}

.editor-content :deep(.tiptap img) {
  max-width: 100%;
  border-radius: var(--radius);
  margin: 12px 0;
}

.editor-content :deep(.tiptap blockquote) {
  border-left: 3px solid var(--primary);
  padding-left: 16px;
  color: var(--text-secondary);
  margin: 12px 0;
}

.editor-content :deep(.tiptap ul),
.editor-content :deep(.tiptap ol) {
  padding-left: 24px;
  margin-bottom: 12px;
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
