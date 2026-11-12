import axios from 'axios'

const base = import.meta.env.VITE_API_BASE || '/api'
const http = axios.create({ baseURL: base })

http.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('hq_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

// Resolve to the response body { status, data, message }; reject with the body too.
http.interceptors.response.use(
  (r) => r.data,
  (e) => Promise.reject(e.response?.data || { status: 'error', message: e.message || 'Network error' })
)

export const token = {
  get: () => localStorage.getItem('hq_token'),
  set: (t) => localStorage.setItem('hq_token', t),
  clear: () => localStorage.removeItem('hq_token'),
}

export const api = {
  // auth
  login: (email, password) => http.post('/auth/login', { email, password }),
  verify: (email, code) => http.post('/auth/verify', { email, code }),
  me: () => http.get('/auth/me'),
  logout: () => http.post('/auth/logout'),
  // group
  overview: () => http.get('/overview'),
  audit: (params) => http.get('/audit', { params }),
  // schools registry
  schools: () => http.get('/schools'),
  discover: () => http.get('/schools/discover'),
  register: (d) => http.post('/schools', d),
  updateSchool: (id, d) => http.put(`/schools/${id}`, d),
  suspend: (id, d) => http.post(`/schools/${id}/suspend`, d),
  resume: (id) => http.post(`/schools/${id}/resume`),
  // per-school
  detail: (id) => http.get(`/schools/${id}/detail`),
  settings: (id) => http.get(`/schools/${id}/settings`),
  saveSettings: (id, d) => http.put(`/schools/${id}/settings`, d),
  students: (id, params) => http.get(`/schools/${id}/students`, { params }),
  updateStudent: (id, sid, d) => http.put(`/schools/${id}/students/${sid}`, d),
  deleteStudent: (id, sid) => http.delete(`/schools/${id}/students/${sid}`),
  staff: (id) => http.get(`/schools/${id}/staff`),
  updateStaff: (id, sid, d) => http.put(`/schools/${id}/staff/${sid}`, d),
  deleteStaff: (id, sid) => http.delete(`/schools/${id}/staff/${sid}`),
  classes: (id) => http.get(`/schools/${id}/classes`),
  createClass: (id, d) => http.post(`/schools/${id}/classes`, d),
  updateClass: (id, cid, d) => http.put(`/schools/${id}/classes/${cid}`, d),
  deleteClass: (id, cid) => http.delete(`/schools/${id}/classes/${cid}`),
  fees: (id) => http.get(`/schools/${id}/fees`),
  createFee: (id, d) => http.post(`/schools/${id}/fees`, d),
  updateFee: (id, fid, d) => http.put(`/schools/${id}/fees/${fid}`, d),
  deleteFee: (id, fid) => http.delete(`/schools/${id}/fees/${fid}`),
  results: (id) => http.get(`/schools/${id}/results`),
}
