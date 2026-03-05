import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from './views/DashboardView.vue';
import ArticleEditView from './views/ArticleEditView.vue';

// TODO: login route + auth guards

const routes = [
  { path: '/', name: 'Dashboard', component: DashboardView },
  { path: '/articles/new', name: 'NewArticle', component: ArticleEditView },
  { path: '/articles/:id', name: 'EditArticle', component: ArticleEditView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
