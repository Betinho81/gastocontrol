import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xmwzaukyxtkeatemaoel.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtd3phdWt5eHRrZWF0ZW1hb2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDQ5MDcsImV4cCI6MjA5NTQyMDkwN30.Ggqnf0B3pX5GerTvjqDhvyf9SclvifTcU5iY72iC4s4';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function login(email, password, sedeId) {
  const { data: usuarios } = await sb
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .eq('activo', true)
    .single();

  if (!usuarios) return { ok: false, error: 'Usuario no encontrado o inactivo' };

  // Verificacion simple de contrasena (en produccion usar Supabase Auth)
  const passOk = (email === 'admin@demo.com' && password === 'admin123') ||
                 (email === 'user@demo.com' && password === 'user123');
  if (!passOk) return { ok: false, error: 'Contraseña incorrecta' };

  const { data: sede } = await sb.from('sedes').select('*').eq('id', sedeId).single();

  sessionStorage.setItem('gc_user', JSON.stringify({
    id: usuarios.id,
    nombre: usuarios.nombre,
    email: usuarios.email,
    rol: usuarios.rol,
    sedeId: sedeId,
    sedeNombre: sede?.nombre || ''
  }));
  return { ok: true };
}

export function getUser() {
  const u = sessionStorage.getItem('gc_user');
  return u ? JSON.parse(u) : null;
}

export function logout() {
  sessionStorage.removeItem('gc_user');
  window.location.href = 'index.html';
}

export function requireAuth() {
  const u = getUser();
  if (!u) window.location.href = 'index.html';
  return u;
}
