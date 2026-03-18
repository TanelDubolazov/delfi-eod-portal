import { createRouter, createWebHistory } from 'vue-router';
import api from './api';
import DashboardView from './views/DashboardView.vue';
import ArticleEditView from './views/ArticleEditView.vue';
import LoginView from './views/LoginView.vue';
import ServerConnectionView from './views/ServerConnectionView.vue';

const routes = [
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'Dashboard', component: DashboardView },
  { path: '/articles/new', name: 'NewArticle', component: ArticleEditView },
  { path: '/articles/:id', name: 'EditArticle', component: ArticleEditView },
  { path: '/server', name: 'ServerConnection', component: ServerConnectionView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  try {
    const { data } = await api.get('/auth/status');
    if (data.setupRequired) return { name: 'Login' };
    if (!data.authenticated) return { name: 'Login' };
    return true;
  } catch {
    return { name: 'Login' };
  }
});

export default router;
