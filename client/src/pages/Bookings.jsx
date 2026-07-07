import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { useAuth, can } from '../auth';
import { Badge, Money, Modal, Spinner } from '../components/ui';

const STATUS_FILTERS = ['', 'TENTATIVE', 'CONFIRMED', 'LIVE', 'WAITLIST', 'COMPLETED', 'CANCELLED'];

export default function Bookings() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(params.get('highlight') ? Number(params.get('highlight')) : null);

  function load() {
    setLoading(true);
    api.get('/bookings', { params: { status: status || undefined } })
      .then((r) => setBookings(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bookings</h1>
          <p className="text-sm text-slate-500">{user.role === 'SALES' ? 'Your bookings' : 'All bookings'}</p>
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Booking</th>
                <th className="px-4 py-2 text-left">Site</th>
                <th className="px-4 py-2 text-left">Client</th>
                <th className="px-4 py-2 text-left">Dates</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Photos</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} onClick={() => setOpenId(b.id)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-2 font-medium">{b.bookingNo}</td>
                  <td className="px-4 py-2">{b.site.code}<div className="text-xs text-slate-400 truncate max-w-[160px]">{b.site.location}</div></td>
                  <td className="px-4 py-2">{b.client.name}</td>
                  <td className="px-4 py-2 text-xs">{new Date(b.startDate).toLocaleDateString('en-IN')}<br />{new Date(b.endDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-2 text-right font-medium"><Money value={b.totalAmount} /></td>
                  <td className="px-4 py-2">{b.type === 'LOOSE' ? <span className="badge bg-purple-100 text-purple-800">Loose</span> : 'Regular'}</td>
                  <td className="px-4 py-2"><Badge status={b.status} /></td>
                  <td className="px-4 py-2">{b.photos.length > 0 ? `📷 ${b.photos.length}` : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
              {bookings.length === 0 && <tr><td colSpan="8" className="px-4 py-10 text-center text-slate-400">No bookings</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {openId && <BookingDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function BookingDetail({ id, onClose, onChanged }) {
  const { user } = useAuth();
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() { api.get(`/bookings/${id}`).then((r) => setB(r.data)); }
  useEffect(load, [id]);

  async function changeStatus(status) {
    setBusy(true);
    try { await api.post(`/bookings/${id}/status`, { status }); load(); onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={b ? `${b.bookingNo} — ${b.site.code}` : 'Booking'} wide>
      {!b ? <Spinner /> : (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge status={b.status} />
              {b.type === 'LOOSE' && <span className="badge bg-purple-100 text-purple-800">Loose</span>}
            </div>
            <dl className="space-y-2 text-sm">
              <Row k="Site">{b.site.code} — {b.site.location}</Row>
              <Row k="Client">{b.client.name} · {b.client.phone}</Row>
              <Row k="Period">{new Date(b.startDate).toLocaleDateString('en-IN')} – {new Date(b.endDate).toLocaleDateString('en-IN')} ({b.days}d)</Row>
              <Row k="Day Rate"><Money value={b.dayRate} /></Row>
              <Row k="Subtotal"><Money value={b.subtotal} /></Row>
              {b.discountPct > 0 && <Row k="Discount">{b.discountPct}%</Row>}
              {b.gstApplicable && <Row k="GST"><Money value={b.gstAmount} /></Row>}
              <Row k="Total"><span className="font-bold text-brand"><Money value={b.totalAmount} /></span></Row>
              <Row k="Created by">{b.createdBy.name}</Row>
            </dl>

            {b.invoices?.length > 0 && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-sm">
                🧾 Invoiced: {b.invoices.map((i) => i.invoiceNo).join(', ')}
              </div>
            )}

            {can(user, 'changeBookingStatus') && (
              <div className="mt-4 flex flex-wrap gap-2">
                {b.status === 'TENTATIVE' && <button className="btn-primary" disabled={busy} onClick={() => changeStatus('CONFIRMED')}>Confirm</button>}
                {b.status === 'WAITLIST' && <button className="btn-accent" disabled={busy} onClick={() => changeStatus('CONFIRMED')}>Release from waitlist</button>}
                {['CONFIRMED', 'LIVE'].includes(b.status) && <button className="btn-ghost" disabled={busy} onClick={() => changeStatus('COMPLETED')}>Mark completed</button>}
                {!['CANCELLED', 'COMPLETED'].includes(b.status) && <button className="btn-danger" disabled={busy} onClick={() => changeStatus('CANCELLED')}>Cancel</button>}
              </div>
            )}
          </div>

          <div>
            <PhotoSection booking={b} onUploaded={() => { load(); onChanged(); }} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function PhotoSection({ booking, onUploaded }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('START');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setErr('');
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('bookingId', booking.id);
    fd.append('phase', phase);
    // Attach browser geolocation if available
    try {
      const pos = await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 3000 }));
      if (pos) { fd.append('latitude', pos.coords.latitude); fd.append('longitude', pos.coords.longitude); }
    } catch {}
    try {
      await api.post('/photos', fd);
      setFile(null);
      onUploaded();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Upload failed');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Monitoring Photos</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {['START', 'MID', 'END'].map((ph) => {
          const photos = booking.photos.filter((p) => p.phase === ph);
          return (
            <div key={ph}>
              <div className="text-[10px] font-semibold text-slate-500 mb-1">{ph} DATE</div>
              {photos.length ? photos.map((p) => (
                <a key={p.id} href={p.filePath} target="_blank" rel="noreferrer">
                  <img src={p.filePath} className="rounded border border-slate-200 aspect-square object-cover w-full" />
                  <div className="text-[9px] text-slate-400">{new Date(p.takenAt).toLocaleDateString('en-IN')}{p.latitude ? ' 📍' : ''}</div>
                </a>
              )) : <div className="rounded border border-dashed border-slate-300 aspect-square flex items-center justify-center text-slate-300 text-xs">—</div>}
            </div>
          );
        })}
      </div>

      {can(user, 'uploadPhoto') ? (
        <form onSubmit={upload} className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-600">Upload photo (Ops)</div>
          {err && <div className="text-xs text-red-600">{err}</div>}
          <select className="input" value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="START">Start Date</option>
            <option value="MID">Mid Date</option>
            <option value="END">End Date</option>
          </select>
          <input type="file" accept="image/*" capture="environment" className="input" onChange={(e) => setFile(e.target.files[0])} />
          <button className="btn-primary w-full" disabled={busy || !file}>{busy ? 'Uploading…' : '📷 Upload (geo-tagged)'}</button>
        </form>
      ) : (
        <p className="text-xs text-slate-400">Only Ops can upload monitoring photos. Invoice is gated on at least one photo.</p>
      )}
    </div>
  );
}

function Row({ k, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800 text-right">{children}</dd></div>;
}
