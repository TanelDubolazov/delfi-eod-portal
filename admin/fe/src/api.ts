import axios from 'axios';
import router from './router';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && router.currentRoute.value.name !== 'Login') {
      router.push('/login');
    }
    return Promise.reject(err);
  },
);

export default api;
