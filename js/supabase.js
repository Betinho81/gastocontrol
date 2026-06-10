import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xmwzaukyxtkeatemaoel.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtd3phdWt5eHRrZWF0ZW1hb2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDQ5MDcsImV4cCI6MjA5NTQyMDkwN30.Ggqnf0B3pX5GerTvjqDhvyf9SclvifTcU5iY72iC4s4';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PASSWORDS = {
  'jorgehrueda@hotmail.com': 'admin123',
  'maria_victoria_trujillo@hotmail.com': 'gestion123',
  'umipereira@opticasvisionysol.com.co': 'UMI-PEI',
  'comexc@opticasvisionysol.com.co': 'BGA-CENTRO',
  'opticasvisionysolarmenia@gmail.com': 'Palacio-2',
  'opticasvisionysolpereira@gmail.com': 'VYS-PEREIRA',
  'opticasvisionysolbarranquilla@gmail.com': 'BQUILLA',
  'comint@opticasvisionysol.com.co': 'CABECERA',
  'cajamenorarm3@gmail.com': 'Palacio-3',
  'opticasvisionysol.auxadmon1@gmail.com': 'PAL-PEI',
  'memohrueda_19@hotmail.com': 'memo123'
};

export async function login(email, password, sedeId) {
  const emailLower = email.toLowerCase().trim();
  const { data: usuario } = await sb
    .from('usuarios')
    .select('*, sedes(nombre)')
    .eq('email', emailLower)
    .eq('activo', true)
    .single();

  if (!usuario) return { ok: false, error: 'Usuario no encontrado o inactivo' };

  const passCorrecta = PASSWORDS[emailLower];
  if (!passCorrecta || password !== passCorrecta) {
    return { ok: false, error: 'Contraseña incorrecta' };
  }

  if (usuario.rol !== 'admin' && usuario.sede_id !== sedeId) {
    return { ok: false, error: 'No tienes acceso a esa sede' };
  }

  const sedeSeleccionada = usuario.rol === 'admin'
    ? (await sb.from('sedes').select('nombre').eq('id', sedeId).single()).data
    : usuario.sedes;

  sessionStorage.setItem('gc_user', JSON.stringify({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    sedeId: usuario.rol === 'admin' ? sedeId : usuario.sede_id,
    sedeNombre: sedeSeleccionada?.nombre || '',
    sedePropiaId: usuario.sede_id
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
  if (!u) {
    window.location.href = 'index.html';
    return null;
  }
  return u;
}
