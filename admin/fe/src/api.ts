import axios from 'axios';

// TODO: auth token interceptor

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
});

export default api;
