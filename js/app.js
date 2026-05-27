import { sb, getUser, logout, requireAuth } from './supabase.js';

const user = requireAuth();
document.getElementById('sedeChip').textContent = user.sedeNombre;
document.getElementById('userName').textContent = user.nombre;

const esAdmin = user.rol === 'admin';
const esGestion = user.rol === 'gestion';

if (esAdmin) {
  ['tabReportes','tabProveedores','tabAdmin'].forEach(id => document.getElementById(id).classList.remove('hidden'));
}

let cats = [], subs = [], provs = [], gastos = [], sedes = [];
let wStep = 0, wData = {}, editProvId = null, editCatId = null, editSubId = null;

const COLORS = ['#1A5276','#1a7a4a','#7d4e00','#7f1d1d','#4c1d95','#9a3412','#065f46','#831843','#334155','#0e6655'];
const CAT_CLASS = {
  'Insumos de Aseo':'b-aseo','Papelería':'b-papeleria','Cafetería':'b-cafeteria',
  'Seguridad':'b-seguridad','Mantenimiento':'b-mantenimiento','Gasolina':'b-gasolina',
  'Servicios públicos':'b-servicios','Insumos':'b-insumos','Nóminas':'b-nominas','Fletes':'b-papeleria'
};

async function init() {
  const [c, s, p, g, sd] = await Promise.all([
    sb.from('categorias').select('*').order('nombre'),
    sb.from('subcategorias').select('*').order('nombre'),
    sb.from('proveedores').select('*, categorias(nombre)').eq('activo', true).order('nombre_comercial'),
    sb.from('gastos').select(`*, categorias(nombre), subcategorias(nombre), proveedores(nit,razon_social,nombre_comercial), sedes(nombre)`).eq('sede_id', user.sedeId).order('fecha', { ascending: false }),
    sb.from('sedes').select('*').eq('activa', true).order('nombre'),
  ]);
  cats = c.data || []; subs = s.data || []; provs = p.data || []; gastos = g.data || []; sedes = sd.data || [];
  renderGastos(); renderMetrics();
  if (esAdmin) initFiltros();
}
init();

window.showTab = function(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['panelGastos','panelReportes','panelProveedores','panelAdmin'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== 'panel' + name.charAt(0).toUpperCase() + name.slice(1));
  });
  if (name === 'reportes') { initFiltros(); applyFilters(); }
  if (name === 'proveedores') renderProveedores();
  if (name === 'admin') renderAdmin();
};

window.gc = window.gc || {};
window.gc.logout = logout;

// ── GASTOS ───────────────────────────────────────────────────
function renderMetrics() {
  const total = gastos.reduce((s, g) => s + Number(g.valor), 0);
  const hoy = new Date().toISOString().slice(0, 7);
  const mes = gastos.filter(g => g.fecha?.startsWith(hoy)).reduce((s, g) => s + Number(g.valor), 0);
  document.getElementById('metricCards').innerHTML = `
    <div class="metric-card"><div class="m-label">Registros</div><div class="m-value">${gastos.length}</div><div class="m-sub">${user.sedeNombre}</div></div>
    <div class="metric-card"><div class="m-label">Total acumulado</div><div class="m-value">$${total.toLocaleString('es-CO')}</div></div>
    <div class="metric-card"><div class="m-label">Este mes</div><div class="m-value">$${mes.toLocaleString('es-CO')}</div></div>
    <div class="metric-card"><div class="m-label">Categorías</div><div class="m-value">${[...new Set(gastos.map(g => g.categoria_id))].length}</div></div>`;
}

function renderGastos() {
  const tb = document.getElementById('gastosTable');
  if (!gastos.length) { tb.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><p>No hay gastos registrados aún</p></div></td></tr>'; return; }
  tb.innerHTML = gastos.map(g => {
    const cat = g.categorias?.nombre || ''; const pv = g.proveedores || {};
    return `<tr>
      <td>${g.fecha}</td>
      <td><span class="badge ${CAT_CLASS[cat] || ''}">${cat}</span></td>
      <td style="color:var(--text-sec)">${g.subcategorias?.nombre || ''}</td>
      <td>${pv.nombre_comercial || pv.razon_social || ''}</td>
      <td style="font-size:11px;color:var(--text-sec);font-family:'DM Mono',monospace">${pv.nit || ''}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.descripcion}</td>
      <td style="font-weight:600;font-family:'DM Mono',monospace">$${Number(g.valor).toLocaleString('es-CO')}</td>
      <td>${g.foto_url ? `<img class="foto-thumb" src="${g.foto_url}" onclick="window.open('${g.foto_url}')">` : '<span style="color:var(--text-ter);font-size:12px">—</span>'}</td>
      <td><span class="lock-badge">🔒</span></td>
    </tr>`;
  }).join('');
}

// ── WIZARD ───────────────────────────────────────────────────
const WSTEPS = ['Categoría', 'Subcategoría', 'Proveedor', 'Factura'];
window.gc.openWizard = function() { wStep = 0; wData = {}; renderWizard(); document.getElementById('wizardOverlay').classList.remove('hidden'); };
window.gc.closeWizard = function() { document.getElementById('wizardOverlay').classList.add('hidden'); };
window.gc.wizBack = function() { if (wStep > 0) { wStep--; renderWizard(); } };
window.gc.wizNext = async function() {
  if (wStep === 0 && !wData.catId) return;
  if (wStep === 1 && !wData.subId) return;
  if (wStep === 2 && !wData.provId) return;
  if (wStep === 3) { await saveGasto(); return; }
  wStep++; renderWizard();
};
function renderWizard() {
  document.getElementById('wizSteps').innerHTML = WSTEPS.map((s, i) =>
    `<div class="wiz-step ${i < wStep ? 'done' : i === wStep ? 'active' : ''}"><div class="wiz-num">${i < wStep ? '✓' : i + 1}</div>${s}</div>`).join('');
  document.getElementById('wizBtnBack').style.visibility = wStep === 0 ? 'hidden' : 'visible';
  document.getElementById('wizBtnNext').textContent = wStep === 3 ? 'Guardar gasto' : 'Siguiente';
  const body = document.getElementById('wizBody');
  if (wStep === 0) {
    body.innerHTML = `<p style="font-size:13px;color:var(--text-sec);margin-bottom:1rem">Selecciona la categoría del gasto</p>
      <div class="opt-grid">${cats.map(c => `<button class="opt-btn ${wData.catId === c.id ? 'sel' : ''}" onclick="window.gc.selW('catId','${c.id}','catNombre','${c.nombre}')"><div class="opt-name">${c.nombre}</div></button>`).join('')}</div>`;
  } else if (wStep === 1) {
    const filtSubs = subs.filter(s => s.categoria_id === wData.catId);
    body.innerHTML = `<p style="font-size:13px;color:var(--text-sec);margin-bottom:1rem">Subcategoría en <strong>${wData.catNombre}</strong></p>
      <div class="opt-grid">${filtSubs.map(s => `<button class="opt-btn ${wData.subId === s.id ? 'sel' : ''}" onclick="window.gc.selW('subId','${s.id}','subNombre','${s.nombre}')"><div class="opt-name">${s.nombre}</div></button>`).join('')}</div>`;
  } else if (wStep === 2) {
    const filtProvs = provs.filter(p => !p.categoria_id || p.categorias?.nombre === wData.catNombre);
    const lista = filtProvs.length ? filtProvs : provs;
    body.innerHTML = `<p style="font-size:13px;color:var(--text-sec);margin-bottom:1rem">Selecciona el proveedor</p>
      ${lista.map(p => `<div class="prov-opt ${wData.provId === p.id ? 'sel' : ''}" onclick="window.gc.selProv('${p.id}')">
        <div class="pn">${p.nombre_comercial || p.razon_social}</div><div class="ps">NIT: ${p.nit} · ${p.razon_social}</div></div>`).join('')}`;
  } else if (wStep === 3) {
    const pv = provs.find(p => p.id === wData.provId) || {};
    body.innerHTML = `
      <div class="prov-info-card"><strong>${pv.razon_social}</strong>NIT: ${pv.nit}${pv.ciudad ? ' · ' + pv.ciudad : ''}</div>
      <div class="form-row">
        <div class="form-group"><label>Fecha de la factura</label><input type="date" id="wFecha" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Valor ($)</label><input type="number" id="wValor" placeholder="0" min="0"></div>
      </div>
      <div class="form-group"><label>Descripción del gasto</label><textarea id="wDesc" placeholder="Describe el gasto realizado..."></textarea></div>
      <div class="form-group"><label>Foto de la factura</label>
        <div class="upload-area" onclick="document.getElementById('fileInput').click()">📷 Toca para subir foto de la factura</div>
        <img id="fotoPreview" class="upload-preview hidden" alt="vista previa">
      </div>
      <div class="info-note">🔒 Una vez guardado, el registro no podrá ser modificado ni eliminado</div>`;
  }
}
window.gc.selW = function(k1, v1, k2, v2) { wData[k1] = v1; wData[k2] = v2; renderWizard(); };
window.gc.selProv = function(id) { wData.provId = id; renderWizard(); };
window.gc.handlePhoto = function(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { wData.fotoData = ev.target.result; wData.fotoFile = file; const pr = document.getElementById('fotoPreview'); if (pr) { pr.src = ev.target.result; pr.classList.remove('hidden'); } };
  reader.readAsDataURL(file);
};
async function saveGasto() {
  const desc = document.getElementById('wDesc')?.value?.trim();
  const valor = parseFloat(document.getElementById('wValor')?.value) || 0;
  const fecha = document.getElementById('wFecha')?.value;
  if (!desc || valor <= 0) { alert('Completa descripción y valor'); return; }
  document.getElementById('wizBtnNext').disabled = true; document.getElementById('wizBtnNext').textContent = 'Guardando...';
  let foto_url = null;
  if (wData.fotoFile) {
    const ext = wData.fotoFile.name.split('.').pop();
    const path = `facturas/${Date.now()}.${ext}`;
    const { data: upData } = await sb.storage.from('fotos').upload(path, wData.fotoFile, { upsert: true });
    if (upData) { const { data: urlData } = sb.storage.from('fotos').getPublicUrl(path); foto_url = urlData?.publicUrl; }
  }
  const { data, error } = await sb.from('gastos').insert({
    sede_id: user.sedeId, usuario_id: user.id, categoria_id: wData.catId, subcategoria_id: wData.subId,
    proveedor_id: wData.provId, descripcion: desc, valor, fecha, foto_url
  }).select(`*, categorias(nombre), subcategorias(nombre), proveedores(nit,razon_social,nombre_comercial), sedes(nombre)`).single();
  if (!error && data) { gastos.unshift(data); renderGastos(); renderMetrics(); window.gc.closeWizard(); }
  else { alert('Error al guardar. Intenta de nuevo.'); document.getElementById('wizBtnNext').disabled = false; document.getElementById('wizBtnNext').textContent = 'Guardar gasto'; }
}

// ── REPORTES ─────────────────────────────────────────────────
async function initFiltros() {
  const sedeEl = document.getElementById('fSede'); if (!sedeEl) return;
  sedeEl.innerHTML = '<option value="">Todas las sedes</option>';
  const sedesDisp = esAdmin ? sedes : sedes.filter(s => s.id === user.sedePropiaId);
  sedesDisp.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.nombre; sedeEl.appendChild(o); });
  const catEl = document.getElementById('fCat'); catEl.innerHTML = '<option value="">Todas</option>';
  cats.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; catEl.appendChild(o); });
  const subEl = document.getElementById('fSub'); subEl.innerHTML = '<option value="">Todas</option>';
  subs.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.nombre; subEl.appendChild(o); });
  const provEl = document.getElementById('fProv'); provEl.innerHTML = '<option value="">Todos</option>';
  provs.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.nombre_comercial || p.razon_social; provEl.appendChild(o); });
}
async function getFiltered() {
  let q = sb.from('gastos').select(`*, categorias(nombre), subcategorias(nombre), proveedores(nit,razon_social,nombre_comercial,direccion,correo), sedes(nombre)`);
  if (esGestion) { q = q.eq('sede_id', user.sedePropiaId); }
  else { const vs = document.getElementById('fSede')?.value; if (vs) q = q.eq('sede_id', vs); }
  const vc = document.getElementById('fCat')?.value; const vsu = document.getElementById('fSub')?.value;
  const vp = document.getElementById('fProv')?.value; const vd = document.getElementById('fDesde')?.value; const vh = document.getElementById('fHasta')?.value;
  if (vc) q = q.eq('categoria_id', vc); if (vsu) q = q.eq('subcategoria_id', vsu);
  if (vp) q = q.eq('proveedor_id', vp); if (vd) q = q.gte('fecha', vd); if (vh) q = q.lte('fecha', vh);
  const { data } = await q.order('fecha', { ascending: false }); return data || [];
}
window.gc.applyFilters = async function() {
  const data = await getFiltered();
  const total = data.reduce((s, g) => s + Number(g.valor), 0);
  const sedesU = [...new Set(data.map(g => g.sedes?.nombre))].filter(Boolean);
  document.getElementById('rMetrics').innerHTML = `
    <div class="metric-card"><div class="m-label">Registros</div><div class="m-value">${data.length}</div></div>
    <div class="metric-card"><div class="m-label">Total</div><div class="m-value">$${total.toLocaleString('es-CO')}</div></div>
    <div class="metric-card"><div class="m-label">Sedes</div><div class="m-value">${sedesU.length}</div></div>
    <div class="metric-card"><div class="m-label">Promedio</div><div class="m-value">$${data.length ? Math.round(total / data.length).toLocaleString('es-CO') : '0'}</div></div>`;
  renderBar('chartCat', cats.map(c => ({ label: c.nombre, val: data.filter(g => g.categoria_id === c.id).reduce((s, g) => s + Number(g.valor), 0) })));
  renderBar('chartSede', sedes.map(s => ({ label: s.nombre, val: data.filter(g => g.sede_id === s.id).reduce((a, g) => a + Number(g.valor), 0) })));
  const provTotals = provs.map(p => ({ label: p.nombre_comercial || p.razon_social, val: data.filter(g => g.proveedor_id === p.id).reduce((s, g) => s + Number(g.valor), 0) })).filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 5);
  renderBarData('chartProv', provTotals);
  document.getElementById('reporteTable').innerHTML = data.length ? data.map(g => {
    const cat = g.categorias?.nombre || ''; const pv = g.proveedores || {};
    return `<tr><td>${g.fecha}</td><td><span style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:20px">${g.sedes?.nombre || ''}</span></td>
      <td><span class="badge ${CAT_CLASS[cat] || ''}">${cat}</span></td><td style="color:var(--text-sec)">${g.subcategorias?.nombre || ''}</td>
      <td>${pv.nombre_comercial || pv.razon_social || ''}</td><td style="font-family:'DM Mono',monospace;font-size:11px">${pv.nit || ''}</td>
      <td style="font-size:12px">${pv.razon_social || ''}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.descripcion}</td>
      <td style="font-weight:600;font-family:'DM Mono',monospace">$${Number(g.valor).toLocaleString('es-CO')}</td></tr>`;
  }).join('') : '<tr><td colspan="9"><div class="empty-state"><p>Sin resultados</p></div></td></tr>';
};
window.gc.limpiarFiltros = function() {
  ['fSede','fCat','fSub','fProv'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['fDesde','fHasta'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  window.gc.applyFilters();
};
window.gc.exportCSV = async function() {
  const data = await getFiltered();
  const header = 'Fecha,Sede,Categoría,Subcategoría,Proveedor,NIT,Razón Social,Dirección,Correo,Descripción,Valor\n';
  const rows = data.map(g => { const pv = g.proveedores || {};
    return `${g.fecha},${g.sedes?.nombre || ''},${g.categorias?.nombre || ''},${g.subcategorias?.nombre || ''},${pv.nombre_comercial || ''},${pv.nit || ''},${pv.razon_social || ''},${pv.direccion || ''},${pv.correo || ''},"${g.descripcion}",${g.valor}`;
  }).join('\n');
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'reporte_gastos.csv'; a.click();
};
function renderBar(elId, items) {
  const mx = Math.max(...items.map(x => x.val), 1);
  document.getElementById(elId).innerHTML = items.filter(x => x.val > 0).map((x, i) => {
    const pct = Math.round(x.val / mx * 100);
    return `<div class="bar-row"><div class="bar-label">${x.label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${COLORS[i % COLORS.length]}">${pct > 18 ? '$' + x.val.toLocaleString('es-CO') : ''}</div></div><div class="bar-val">$${x.val.toLocaleString('es-CO')}</div></div>`;
  }).join('') || '<p style="font-size:12px;color:var(--text-ter)">Sin datos</p>';
}
function renderBarData(elId, arr) {
  const mx = Math.max(...arr.map(x => x.val), 1);
  document.getElementById(elId).innerHTML = arr.map((x, i) => {
    const pct = Math.round(x.val / mx * 100);
    return `<div class="bar-row"><div class="bar-label">${x.label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${COLORS[i % COLORS.length]}">${pct > 18 ? '$' + x.val.toLocaleString('es-CO') : ''}</div></div><div class="bar-val">$${x.val.toLocaleString('es-CO')}</div></div>`;
  }).join('') || '<p style="font-size:12px;color:var(--text-ter)">Sin datos</p>';
}

// ── PROVEEDORES ──────────────────────────────────────────────
function renderProveedores() {
  if (!provs.length) { document.getElementById('provTable').innerHTML = '<p style="color:var(--text-sec)">No hay proveedores.</p>'; return; }
  document.getElementById('provTable').innerHTML = `<div class="table-card"><table><thead><tr>
    <th>NIT</th><th>Razón Social</th><th>Nombre comercial</th><th>Ciudad</th><th>Correo</th><th>Teléfono</th><th>Categoría</th><th></th>
  </tr></thead><tbody>${provs.map(p => `<tr>
    <td style="font-family:'DM Mono',monospace;font-weight:500">${p.nit}</td><td>${p.razon_social}</td>
    <td style="color:var(--text-sec)">${p.nombre_comercial || '—'}</td><td>${p.ciudad || '—'}</td>
    <td style="color:var(--azul-med);font-size:12px">${p.correo || '—'}</td><td>${p.telefono || '—'}</td>
    <td><span class="badge ${CAT_CLASS[p.categorias?.nombre] || ''}">${p.categorias?.nombre || '—'}</span></td>
    <td><button class="btn-sec" style="padding:4px 10px;font-size:12px" onclick="window.gc.editProv('${p.id}')">Editar</button></td>
  </tr>`).join('')}</tbody></table></div>`;
}
window.gc.openProvModal = function(id) {
  editProvId = id || null;
  document.getElementById('provModalTitle').textContent = id ? 'Editar proveedor' : 'Nuevo proveedor';
  const catSel = document.getElementById('pCat');
  catSel.innerHTML = '<option value="">Seleccionar...</option>' + cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  if (id) {
    const p = provs.find(x => x.id === id);
    document.getElementById('pNit').value = p.nit; document.getElementById('pRs').value = p.razon_social;
    document.getElementById('pNombre').value = p.nombre_comercial || ''; document.getElementById('pDir').value = p.direccion || '';
    document.getElementById('pCiudad').value = p.ciudad || ''; document.getElementById('pCorreo').value = p.correo || '';
    document.getElementById('pTel').value = p.telefono || ''; catSel.value = p.categoria_id || '';
  } else { ['pNit','pRs','pNombre','pDir','pCiudad','pCorreo','pTel'].forEach(id => document.getElementById(id).value = ''); catSel.value = ''; }
  document.getElementById('provErr').style.display = 'none';
  document.getElementById('provOverlay').classList.remove('hidden');
};
window.gc.editProv = id => window.gc.openProvModal(id);
window.gc.closeProvModal = () => document.getElementById('provOverlay').classList.add('hidden');
window.gc.saveProv = async function() {
  const nit = document.getElementById('pNit').value.trim(); const rs = document.getElementById('pRs').value.trim();
  if (!nit || !rs) { document.getElementById('provErr').style.display = 'block'; return; }
  const obj = { nit, razon_social: rs, nombre_comercial: document.getElementById('pNombre').value.trim() || rs,
    direccion: document.getElementById('pDir').value.trim(), ciudad: document.getElementById('pCiudad').value.trim(),
    correo: document.getElementById('pCorreo').value.trim(), telefono: document.getElementById('pTel').value.trim(),
    categoria_id: document.getElementById('pCat').value || null };
  if (editProvId) { const { data } = await sb.from('proveedores').update(obj).eq('id', editProvId).select('*, categorias(nombre)').single(); if (data) { const idx = provs.findIndex(p => p.id === editProvId); provs[idx] = data; } }
  else { const { data } = await sb.from('proveedores').insert(obj).select('*, categorias(nombre)').single(); if (data) provs.push(data); }
  window.gc.closeProvModal(); renderProveedores();
};

// ── ADMIN ────────────────────────────────────────────────────
async function renderAdmin() {
  const { data: usuarios } = await sb.from('usuarios').select('*, sedes(nombre)');
  document.getElementById('adminUsers').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn-new" onclick="window.gc.openUserModal()">+ Nuevo usuario</button>
    </div>` +
    (usuarios || []).map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--azul-clar);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--azul)">${u.nombre[0]}</div>
        <div><div style="font-size:13px;font-weight:500">${u.nombre}</div>
        <div style="font-size:11px;color:var(--text-sec)">${u.email} · <strong>${u.rol.toUpperCase()}</strong> · ${u.sedes?.nombre || '—'}</div></div>
      </div></div>`).join('');

  // CATEGORÍAS
  document.getElementById('adminCats').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn-new" onclick="window.gc.openCatModal()">+ Nueva categoría</button>
    </div>
    <div class="table-card"><table><thead><tr><th>Categoría</th><th>Subcategorías</th><th></th></tr></thead><tbody>
    ${cats.map(c => {
      const mySubs = subs.filter(s => s.categoria_id === c.id);
      return `<tr>
        <td style="font-weight:500">${c.nombre}</td>
        <td style="font-size:12px;color:var(--text-sec)">${mySubs.map(s => s.nombre).join(', ') || '—'}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-sec" style="padding:4px 10px;font-size:12px" onclick="window.gc.editCat('${c.id}')">Editar</button>
          <button class="btn-sec" style="padding:4px 10px;font-size:12px" onclick="window.gc.openSubModal('${c.id}','${c.nombre}')">+ Sub</button>
        </td></tr>`;
    }).join('')}
    </tbody></table></div>`;

  document.getElementById('adminSedes').innerHTML = sedes.map(s => {
    const n = (gastos || []).filter(g => g.sede_id === s.id).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px">
      <span style="font-size:13px;font-weight:500">${s.nombre}</span>
      <span style="font-size:12px;color:var(--text-sec)">${n} registros</span></div>`;
  }).join('');

  const { data: todosGastos } = await sb.from('gastos').select('*, categorias(nombre)');
  renderBar('adminChart', cats.map(c => ({ label: c.nombre, val: (todosGastos || []).filter(g => g.categoria_id === c.id).reduce((s, g) => s + Number(g.valor), 0) })));
}

// ── MODAL CATEGORIA ──────────────────────────────────────────
window.gc.openCatModal = function(id) {
  editCatId = id || null;
  const cat = id ? cats.find(c => c.id === id) : null;
  const html = `<div class="overlay" id="catOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:300;padding:1rem">
    <div class="modal" style="max-width:400px">
      <div class="modal-hdr"><h3>${id ? 'Editar' : 'Nueva'} categoría</h3><button class="btn-close" onclick="document.getElementById('catOverlay').remove()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Nombre de la categoría *</label><input id="cNombre" placeholder="Ej: Fletes" value="${cat?.nombre || ''}"></div>
        <div id="cErr" style="color:var(--error);font-size:12px;margin-top:6px;display:none">Ingresa el nombre</div>
      </div>
      <div class="modal-ftr">
        <button class="btn-sec" onclick="document.getElementById('catOverlay').remove()">Cancelar</button>
        <button class="btn-prim" onclick="window.gc.saveCat()">Guardar</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
window.gc.editCat = id => window.gc.openCatModal(id);
window.gc.saveCat = async function() {
  const nombre = document.getElementById('cNombre').value.trim();
  if (!nombre) { document.getElementById('cErr').style.display = 'block'; return; }
  if (editCatId) {
    const { data } = await sb.from('categorias').update({ nombre }).eq('id', editCatId).select().single();
    if (data) { const idx = cats.findIndex(c => c.id === editCatId); cats[idx] = data; }
  } else {
    const { data } = await sb.from('categorias').insert({ nombre }).select().single();
    if (data) cats.push(data);
  }
  document.getElementById('catOverlay').remove(); renderAdmin();
};

// ── MODAL SUBCATEGORIA ───────────────────────────────────────
window.gc.openSubModal = function(catId, catNombre) {
  editSubId = null;
  const html = `<div class="overlay" id="subOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:300;padding:1rem">
    <div class="modal" style="max-width:460px">
      <div class="modal-hdr"><h3>Nueva subcategoría</h3><button class="btn-close" onclick="document.getElementById('subOverlay').remove()">×</button></div>
      <div class="modal-body">
        <div style="background:var(--bg);border-radius:8px;padding:8px 12px;margin-bottom:1rem;font-size:13px">Categoría: <strong>${catNombre}</strong></div>
        <div class="form-group"><label>Nombre de la subcategoría *</label><input id="sNombre" placeholder="Ej: Fletes locales"></div>
        <div id="sErr" style="color:var(--error);font-size:12px;margin-top:6px;display:none">Ingresa el nombre</div>
      </div>
      <div class="modal-ftr">
        <button class="btn-sec" onclick="document.getElementById('subOverlay').remove()">Cancelar</button>
        <button class="btn-prim" onclick="window.gc.saveSub('${catId}')">Guardar</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
window.gc.saveSub = async function(catId) {
  const nombre = document.getElementById('sNombre').value.trim();
  if (!nombre) { document.getElementById('sErr').style.display = 'block'; return; }
  const { data } = await sb.from('subcategorias').insert({ nombre, categoria_id: catId }).select().single();
  if (data) subs.push(data);
  document.getElementById('subOverlay').remove(); renderAdmin();
};

// ── MODAL USUARIO ────────────────────────────────────────────
window.gc.openUserModal = function() {
  const html = `<div class="overlay" id="userOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:300;padding:1rem">
    <div class="modal" style="max-width:460px">
      <div class="modal-hdr"><h3>Nuevo usuario</h3><button class="btn-close" onclick="document.getElementById('userOverlay').remove()">×</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Nombre completo</label><input id="uNombre" placeholder="Nombre completo"></div>
        <div class="form-group"><label>Correo electrónico</label><input id="uEmail" type="email" placeholder="correo@empresa.com"></div>
        <div class="form-group"><label>Contraseña inicial</label><input id="uPass" type="text" placeholder="Mínimo 6 caracteres"></div>
        <div class="form-group"><label>Rol</label><select id="uRol"><option value="gestion">Gestión</option><option value="admin">Administrador</option></select></div>
        <div class="form-group"><label>Sede</label><select id="uSede">${sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}</select></div>
        <div id="uErr" style="color:var(--error);font-size:12px;margin-top:6px;display:none"></div>
      </div>
      <div class="modal-ftr">
        <button class="btn-sec" onclick="document.getElementById('userOverlay').remove()">Cancelar</button>
        <button class="btn-prim" onclick="window.gc.saveUser()">Crear usuario</button>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
window.gc.saveUser = async function() {
  const nombre = document.getElementById('uNombre').value.trim();
  const email = document.getElementById('uEmail').value.trim().toLowerCase();
  const rol = document.getElementById('uRol').value;
  const sedeId = document.getElementById('uSede').value;
  const errEl = document.getElementById('uErr');
  if (!nombre || !email || !sedeId) { errEl.textContent = 'Completa todos los campos'; errEl.style.display = 'block'; return; }
  const { data, error } = await sb.from('usuarios').insert({ nombre, email, rol, sede_id: sedeId }).select('*, sedes(nombre)').single();
  if (error) { errEl.textContent = 'Error: ' + (error.message || 'intenta de nuevo'); errEl.style.display = 'block'; return; }
  document.getElementById('userOverlay').remove(); renderAdmin();
};
