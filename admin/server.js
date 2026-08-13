require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_CONFIG = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

const tokens = new Map();

function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (token && tokens.has(token)) {
    req.user = tokens.get(token);
    return next();
  }
  res.status(401).json({ error: 'Não autorizado' });
}

function makeToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  try {
    const pool = await sql.connect(DB_CONFIG);
    const result = await pool.request()
      .input('username', sql.NVarChar(100), username)
      .query('SELECT id, username, password_hash FROM dbo.Admins WHERE username = @username');
    const row = result.recordset[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    const token = makeToken();
    tokens.set(token, { username: row.username, id: row.id });
    res.json({ token, username: row.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao acessar o banco' });
  }
});

app.get('/api/jogos', requireAuth, async (req, res) => {
  try {
    const pool = await sql.connect(DB_CONFIG);
    const result = await pool.request()
      .query(`SELECT id, titulo, descricao, FORMAT(data_jogo, 'yyyy-MM-dd') AS data_jogo,
                     hora, local_jogo, FORMAT(criado_em, 'yyyy-MM-dd HH:mm') AS criado_em
              FROM dbo.Jogos ORDER BY data_jogo DESC, hora DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar jogos' });
  }
});

app.post('/api/jogos', requireAuth, async (req, res) => {
  const { titulo, descricao, data, hora, local } = req.body || {};
  if (!titulo || !data || !hora) return res.status(400).json({ error: 'Título, data e hora são obrigatórios' });
  try {
    const pool = await sql.connect(DB_CONFIG);
    await pool.request()
      .input('titulo', sql.NVarChar(200), titulo)
      .input('descricao', sql.NVarChar(1000), descricao || null)
      .input('data', sql.Date, data)
      .input('hora', sql.NVarChar(5), hora)
      .input('local', sql.NVarChar(300), local || null)
      .query(`INSERT INTO dbo.Jogos (titulo, descricao, data_jogo, hora, local_jogo)
              VALUES (@titulo, @descricao, @data, @hora, @local)`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao agendar jogo' });
  }
});

app.delete('/api/jogos/:id', requireAuth, async (req, res) => {
  try {
    const pool = await sql.connect(DB_CONFIG);
    await pool.request()
      .input('id', sql.Int, parseInt(req.params.id, 10))
      .query('DELETE FROM dbo.Jogos WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover jogo' });
  }
});

app.get('/api/proxima-partida', async (req, res) => {
  try {
    const pool = await sql.connect(DB_CONFIG);
    const result = await pool.request().query(`
      SELECT TOP 1 titulo, descricao, FORMAT(data_jogo, 'dd/MM/yyyy') AS data_jogo, hora, local_jogo
      FROM dbo.Jogos WHERE data_jogo >= CAST(GETDATE() AS DATE)
      ORDER BY data_jogo ASC, hora ASC`);
    res.json(result.recordset[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar próxima partida' });
  }
});

app.post('/api/publicar', requireAuth, async (req, res) => {
  try {
    const pool = await sql.connect(DB_CONFIG);
    const result = await pool.request().query(`
      SELECT TOP 1 titulo, FORMAT(data_jogo, 'dd/MM/yyyy') AS data_jogo, hora, local_jogo
      FROM dbo.Jogos WHERE data_jogo >= CAST(GETDATE() AS DATE)
      ORDER BY data_jogo ASC, hora ASC`);
    const jogo = result.recordset[0];
    const indexPath = path.join(__dirname, '..', 'legiao-pg', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');

    const nextText = jogo
      ? `${jogo.data_jogo} — ${jogo.hora} · ${jogo.titulo}${jogo.local_jogo ? ' · ' + jogo.local_jogo : ''}`
      : 'Aguardando partida agendada';

    html = html.replace(/(<li id="next-match">).*?(<\/li>)/s, `$1${nextText}$2`);

    fs.writeFileSync(indexPath, html, 'utf8');
    res.json({ ok: true, publicado: jogo ? nextText : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao publicar no site' });
  }
});

app.listen(process.env.PORT || 3000, '127.0.0.1', () => {
  console.log(`Admin AirsoftPG em http://127.0.0.1:${process.env.PORT || 3000}`);
});
