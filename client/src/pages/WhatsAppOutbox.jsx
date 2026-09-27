import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Send, MessageCircle, CheckCircle, Clock, Settings } from 'lucide-react';
import api from '../api';
import { useCompany } from '../CompanyContext';
import { Money, Spinner, StatTile } from '../components/ui';

// Indian numbers are stored with/without country code; wa.me wants 91XXXXXXXXXX.
const waDigits = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d.replace(/^0+/, ''); };
const fDate = (d) => (d ? dayjs(d).format('D MMM YYYY') : '');
const fDateTime = (d) => (d ? dayjs(d).format('D MMM, h:mm A') : '');

function SentPill({ sentAt }) {
  return sentAt
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium"><CheckCircle size={12} /> Sent · {fDate(sentAt)}</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[11px] font-medium"><Clock size={12} /> Not sent</span>;
}

export default function WhatsAppOutbox() {
  const navigate = useNavigate();
  const { activeCompany, companies } = useCompany();
  const [companyId, setCompanyId] = useState(activeCompany?.id ? String(activeCompany.id) : '');
  const [tab, setTab] = useState('tosend');
  const [data, setData] = useState(null);
  const [log, setLog] = useState(null);
  const [onlyUnsent, setOnlyUnsent] = useState(true);
  const [sending, setSending] = useState(null); // `${kind}:${id}` currently sending

  useEffect(() => { setCompanyId(activeCompany?.id ? String(activeCompany.id) : ''); }, [activeCompany]);

  function loadOutbox() {
    setData(null);
    api.get('/whatsapp/outbox', { params: { companyId: companyId || undefined } })
      .then((r) => setData(r.data))
      .catch(() => setData({ invoices: [], bookings: [] }));
  }
  function loadLog() {
    setLog(null);
    api.get('/whatsapp/log').then((r) => setLog(r.data)).catch(() => setLog([]));
  }
  useEffect(loadOutbox, [companyId]);
  useEffect(() => { if (tab === 'log') loadLog(); }, [tab]);

  async function send(kind, row) {
    if (!row.phone) return;
    const key = `${kind}:${row.id}`;
    setSending(key);
    const text = kind === 'INVOICE'
      ? `Dear ${row.client}, please find invoice ${row.invoiceNo} for ₹${Number(row.total || 0).toLocaleString('en-IN')} from Saangari Ads.`
      : `Dear ${row.client}, your booking ${row.orderNo} (${row.sites} site${row.sites !== 1 ? 's' : ''}) is confirmed. — Saangari Ads`;
    window.open(`https://wa.me/${waDigits(row.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    try {
      await api.post('/whatsapp/log', {
        kind, entityType: kind === 'INVOICE' ? 'invoice' : 'order', entityId: row.id,
        toName: row.client, toNumber: row.phone, channel: 'WHATSAPP',
        label: kind === 'INVOICE' ? row.invoiceNo : row.orderNo,
      });
      loadOutbox();
    } catch { /* the message still opened; the log write isn't worth blocking on */ }
    finally { setSending(null); }
  }

  const invoices = data?.invoices || [];
  const bookings = data?.bookings || [];
  const invSent = invoices.filter((i) => i.sentAt).length;
  const bkSent = bookings.filter((b) => b.sentAt).length;
  const filt = (rows) => (onlyUnsent ? rows.filter((r) => !r.sentAt) : rows);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><MessageCircle size={22} className="text-emerald-600" /> WhatsApp Outbox</h1>
          <p className="text-sm text-slate-500">Send invoices &amp; booking confirmations on WhatsApp and track what's gone out.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1.5" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">All businesses</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-ghost text-sm flex items-center gap-1.5" onClick={() => navigate('/settings/whatsapp')}><Settings size={16} /> Settings</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatTile label="Invoices sent" value={`${invSent} / ${invoices.length}`} accent="text-emerald-600" />
        <StatTile label="Invoices pending" value={invoices.length - invSent} accent={invoices.length - invSent > 0 ? 'text-amber-600' : 'text-slate-700'} />
        <StatTile label="Bookings sent" value={`${bkSent} / ${bookings.length}`} accent="text-emerald-600" />
        <StatTile label="Bookings pending" value={bookings.length - bkSent} accent={bookings.length - bkSent > 0 ? 'text-amber-600' : 'text-slate-700'} />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {[['tosend', 'To send'], ['log', 'Sent log']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'tosend' && (
        !data ? <Spinner /> : (
          <div className="space-y-6">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={onlyUnsent} onChange={(e) => setOnlyUnsent(e.target.checked)} /> Show only not-sent
            </label>

            <OutboxTable
              title="Invoices" numLabel="Invoice"
              rows={filt(invoices)}
              cols={(r) => [r.invoiceNo, r.client, r.phone || '—', <Money value={r.total} />]}
              headers={['Invoice', 'Client', 'Phone', 'Amount']}
              onSend={(r) => send('INVOICE', r)} sending={sending} kind="INVOICE"
            />
            <OutboxTable
              title="Bookings" numLabel="Order"
              rows={filt(bookings)}
              cols={(r) => [r.orderNo, r.client, r.phone || '—', `${r.sites} site${r.sites !== 1 ? 's' : ''}`]}
              headers={['Order', 'Client', 'Phone', 'Sites']}
              onSend={(r) => send('BOOKING', r)} sending={sending} kind="BOOKING"
            />
          </div>
        )
      )}

      {tab === 'log' && (
        !log ? <Spinner /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Kind</th>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">By</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">{fDateTime(r.sentAt)}</td>
                    <td className="px-4 py-2"><span className="badge bg-slate-100 text-slate-600 text-[10px]">{r.kind}</span></td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.label || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{[r.toName, r.toNumber].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{r.channel}</td>
                    <td className="px-4 py-2 text-slate-500">{r.sentBy?.name || '—'}</td>
                  </tr>
                ))}
                {log.length === 0 && <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-400">Nothing sent yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function OutboxTable({ title, rows, cols, headers, onSend, sending, kind }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-700 mb-2">{title} ({rows.length})</div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              {headers.map((h, i) => <th key={i} className={`px-4 py-2 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Send</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = cols(r);
              return (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {c.map((v, i) => <td key={i} className={`px-4 py-2 ${i >= 3 ? 'text-right' : 'text-left'} ${i === 0 ? 'font-medium text-slate-800' : 'text-slate-600'}`}>{v}</td>)}
                  <td className="px-4 py-2"><SentPill sentAt={r.sentAt} /></td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="btn-primary text-xs py-1 px-2.5 inline-flex items-center gap-1 disabled:opacity-40"
                      disabled={!r.phone || sending === `${kind}:${r.id}`}
                      title={r.phone ? 'Open WhatsApp' : 'No phone number on file'}
                      onClick={() => onSend(r)}
                    >
                      <Send size={13} /> {r.sentAt ? 'Resend' : 'Send'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={headers.length + 2} className="px-4 py-8 text-center text-slate-400">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
