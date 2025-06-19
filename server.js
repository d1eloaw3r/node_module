const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const pool = require('./db');
const path = require('path');
const hbs = require('hbs');

const app = express();

// Подключаем public/ и шаблонизатор
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'demo-drive', 'views'));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist')));

// Регистрируем хелпер сравнения
hbs.registerHelper('ifEquals', function (arg1, arg2, options) {
  return arg1 === arg2 ? options.fn(this) : options.inverse(this);
});
/* aboba */
app.use(session({
  secret: 'testdrive-secret',
  resave: false,
  saveUninitialized: true
}));

// Маршруты
app.get('/', (req, res) => res.redirect('/login'));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { full_name, phone, email, login, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO users (full_name, phone, email, login, password) VALUES ($1, $2, $3, $4, $5)', 
      [full_name, phone, email, login, hash]);
    res.redirect('/login');
  } catch (err) {
    res.send('Ошибка при регистрации: ' + err.message);
  }
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  // Проверка администратора
  const adminResult = await pool.query('SELECT * FROM admins WHERE login = $1', [login]);
  const admin = adminResult.rows[0];
  if (admin && password === admin.password) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  // Проверка пользователя
  const result = await pool.query('SELECT * FROM users WHERE login = $1', [login]);
  const user = result.rows[0];
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = user;
    res.redirect('/dashboard');
  } else {
    res.send('Неверный логин или пароль');
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const apps = await pool.query(`
    SELECT tdr.*, c.brand AS car_brand, c.model AS car_model
    FROM test_drive_requests tdr
    JOIN cars c ON tdr.car_id = c.id
    WHERE tdr.user_id = $1
    ORDER BY tdr.created_at DESC
  `, [req.session.user.id]);
  res.render('dashboard', { apps: apps.rows });
});

app.get('/form', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const cars = await pool.query('SELECT * FROM cars ORDER BY brand, model');
  res.render('form', { cars: cars.rows });
});

app.post('/form', async (req, res) => {
  const {
    address, phone, license_series, license_number, license_date,
    car_id, desired_date, desired_time, payment_type
  } = req.body;
  await pool.query(`
    INSERT INTO test_drive_requests (
      user_id, car_id, address, contact_phone, license_series, license_number, license_issue_date,
      desired_date, desired_time, payment_type
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [req.session.user.id, car_id, address, phone, license_series, license_number, license_date,
      desired_date, desired_time, payment_type]);
  res.redirect('/dashboard');
});

app.get('/admin', async (req, res) => {
  if (!req.session.admin) return res.send('Доступ запрещен');
  const apps = await pool.query(`
    SELECT tdr.*, u.full_name, u.phone AS user_phone, u.email, c.brand AS car_brand, c.model AS car_model
    FROM test_drive_requests tdr
    JOIN users u ON tdr.user_id = u.id
    JOIN cars c ON tdr.car_id = c.id
    ORDER BY tdr.created_at DESC
  `);
  res.render('admin', { apps: apps.rows });
});

app.post('/admin/update', async (req, res) => {
  const { id, status, reason } = req.body;
  await pool.query('UPDATE test_drive_requests SET status = $1, rejection_reason = $2 WHERE id = $3', [status, reason, id]);
  res.redirect('/admin');
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.send('Ошибка при выходе');
    }
    res.redirect('/login');
  });
});


app.listen(3000, () => console.log('Сервер запущен на http://localhost:3000'));
