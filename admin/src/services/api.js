import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api', // Shared backend URL
  withCredentials: true,
});

export default api;
