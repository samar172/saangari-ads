// Minimal .env loader (avoids extra dependency)
(() => {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
  }
})();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { authenticate } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'saangri-api' }));

app.use('/api/auth', require('./routes/auth'));

// Everything below requires a valid token
app.use('/api', authenticate);
app.use('/api/users', require('./routes/users'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/printing-partners', require('./routes/printingPartners'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/reports', require('./routes/reports'));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Saangri API listening on http://localhost:${PORT}`));
