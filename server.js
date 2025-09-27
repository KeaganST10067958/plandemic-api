import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';

const { Pool } = pkg;

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY; // set on Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon requires SSL
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Simple API key guard
app.use((req, res, next) => {
  const key = req.get('x-api-key');
  if (!API_KEY || key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

// Health check
app.get('/', (_req, res) => res.json({ ok: true }));

// ===== TASKS =====

// GET /tasks?userId=UID
app.get('/tasks', async (req, res) => {
  const uid = req.query.userId;
  if (!uid) return res.status(400).json({ error: 'Missing userId' });

  const { rows } = await pool.query(
    `SELECT id::text, title, tag, done, created_at
     FROM tasks WHERE user_id = $1 ORDER BY created_at DESC`, [uid]
  );
  res.json(rows);
});

// POST /tasks { userId, title, tag? }
app.post('/tasks', async (req, res) => {
  const { userId, title, tag = 'study' } = req.body || {};
  if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, title, tag) VALUES ($1,$2,$3)
     RETURNING id::text, title, tag, done, created_at`,
    [userId, title.trim(), tag]
  );
  res.status(201).json(rows[0]);
});

// PATCH /tasks/:id { userId, done?, title?, tag? }
app.patch('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { userId, title, tag, done } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const fields = [];
  const values = [];
  let i = 1;
  if (title !== undefined) { fields.push(`title = $${++i}`); values.push(title); }
  if (tag   !== undefined) { fields.push(`tag   = $${++i}`); values.push(tag); }
  if (done  !== undefined) { fields.push(`done  = $${++i}`); values.push(done); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const sql = `UPDATE tasks SET ${fields.join(', ')}
               WHERE id = $1 AND user_id = $2
               RETURNING id::text, title, tag, done, created_at`;
  const params = [id, userId, ...values];

  const { rows } = await pool.query(sql, params);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /tasks/:id?userId=UID
app.delete('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const uid = req.query.userId;
  if (!uid) return res.status(400).json({ error: 'Missing userId' });

  await pool.query(`DELETE FROM tasks WHERE id = $1 AND user_id = $2`, [id, uid]);
  res.status(204).send();
});

app.listen(PORT, () => console.log(`API listening on ${PORT}`));
