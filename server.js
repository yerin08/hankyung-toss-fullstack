const express = require('express');
const mysql = require('mysql2/promise'); // mysql2 사용
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(express.json());

// --- 📦 [1] DB 연결 설정 (Pool로 직접 관리) ---
const pool = mysql.createPool({
  host: 'localhost',       // 예린님의 DB 호스트
  port: 3301,
  user: 'root',            // 예린님의 DB 사용자명
  password: '0808',    // 예린님의 DB 비밀번호
  database: 'planit_db',      // 예린님의 DB 이름 (바꾼 이름 확인!)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const JWT_SECRET = 'yerin_secret_key'; // 하드코딩된 비밀키

// 서버 실행 시 DB 연결 테스트
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT NOW() AS result');
    console.log('✅ MariaDB 연결 성공! 서버 시간:', rows[0].result);
  } catch (err) {
    console.error('❌ DB 연결 실패:', err);
  }
}
testConnection();

// --- 📂 [2] 정적 파일 및 HTML 페이지 서빙 ---
// CSS 폴더 연결
app.use('/css', express.static(path.join(__dirname, 'css')));

// 페이지 이동 라우트
// 정적 파일 라우트 아래에 추가
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'start.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'signup.html')));
app.get('/calendar', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'calendar.html')));
app.get('/todo', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'todo.html')));

// --- 🔑 [3] 토큰 검증 미들웨어 (기존과 동일) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: '로그인이 필요합니다.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '유효하지 않은 토큰입니다.' });
    req.user = user;
    next();
  });
};

// --- 🚀 [4] API 로직 (예린님의 기존 기능 100% 유지) ---

// 1. 회원가입 API
// server.js의 signup API 부분을 이렇게 수정해서 로그를 보세요
app.post('/api/signup', async (req, res) => {
  const { userid, password, username } = req.body;
  console.log("받은 데이터:", req.body); // 데이터가 제대로 들어오는지 확인

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (userid, password, username) VALUES (?, ?, ?)';
    
    // 여기서 에러가 나면 아래 catch로 이동합니다.
    await pool.query(query, [userid, hashedPassword, username]);
    
    res.status(201).json({ message: '회원가입 성공!' });
  } catch (err) {
    console.log("🚨 서버 내부 에러 발생 원인:"); 
    console.error(err); // 코랩 터미널에 상세한 에러 이유가 찍힙니다!
    res.status(500).json({ message: '회원가입 실패', detail: err.message });
  }
});

// 2. 로그인 API
app.post('/api/login', async (req, res) => {
  const { userid, password } = req.body;
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE userid = ?', [userid]);
    if (users.length === 0) return res.status(401).json({ message: '가입되지 않은 아이디입니다.' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: '비밀번호가 틀렸습니다.' });

    const token = jwt.sign(
      { userid: user.userid, username: user.username },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: '로그인 성공!',
      token,
      user: { userid: user.userid, username: user.username }
    });
  } catch (err) {
    res.status(500).json({ message: '서버 에러' });
  }
});

// 3. 투두 리스트 조회 API
app.get('/api/todos', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *, DATE_FORMAT(target_date, "%Y-%m-%d") as date 
       FROM todos 
       WHERE user_id = ? 
       ORDER BY is_routine DESC, priority DESC, target_date ASC`,
      [req.user.userid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: '데이터 조회 실패' });
  }
});

// 4. 수정 API (루틴 설정 포함)
app.put('/api/todos/:id', authenticateToken, async (req, res) => {
  const { title, description, priority, is_completed, is_routine, repeat_pattern, repeat_day } = req.body;
  const { id } = req.params;
  const user_id = req.user.userid;

  try {
    const query = `
      UPDATE todos 
      SET title = ?, description = ?, priority = ?, is_completed = ?, is_routine = ?, repeat_pattern = ?, repeat_day = ? 
      WHERE id = ? AND user_id = ?`;
    const [result] = await pool.query(query, [title, description, priority, is_completed, is_routine, repeat_pattern || null, repeat_day || null, id, user_id]);

    if (result.affectedRows === 0) return res.status(404).json({ message: '수정할 항목을 찾을 수 없습니다.' });
    res.json({ message: '수정 완료' });
  } catch (err) {
    res.status(500).json({ message: '수정 실패' });
  }
});

// 5. 투두 삭제 API (개별 & 루틴 전체)
app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { type } = req.query;
  const user_id = req.user.userid;

  try {
    if (type === 'all') {
      const [todo] = await pool.query('SELECT routine_id FROM todos WHERE id = ? AND user_id = ?', [id, user_id]);
      if (todo.length > 0 && todo[0].routine_id) {
        await pool.query('DELETE FROM todos WHERE routine_id = ? AND user_id = ?', [todo[0].routine_id, user_id]);
        return res.json({ message: '연관된 모든 루틴이 삭제되었습니다.' });
      }
    }
    const [result] = await pool.query('DELETE FROM todos WHERE id = ? AND user_id = ?', [id, user_id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: '삭제할 항목을 찾을 수 없습니다.' });
    res.json({ message: '삭제 완료' });
  } catch (err) {
    res.status(500).json({ message: '서버 삭제 오류' });
  }
});

// 6. 투두 추가 API (가장 중요한 루틴 자동 생성 로직)
app.post('/api/todos', authenticateToken, async (req, res) => {
  const { title, description, target_date, priority, is_routine, repeat_pattern, repeat_day } = req.body;
  const user_id = req.user.userid;

  try {
    if (!is_routine || is_routine === 0) {
      const query = `INSERT INTO todos (user_id, title, description, target_date, priority, is_routine) VALUES (?, ?, ?, ?, ?, 0)`;
      await pool.query(query, [user_id, title, description, target_date, priority || 2]);
      return res.status(201).json({ message: '등록 완료' });
    }

    const routine_id = Date.now();
    let curr = new Date(target_date + 'T12:00:00'); 
    const endDate = new Date(curr.getFullYear(), curr.getMonth() + 1, 0); 
    let datesToInsert = [];
    const selectedDays = repeat_day ? String(repeat_day).split(',').map(Number) : [];

    while (curr <= endDate) {
      const day = curr.getDay();
      let shouldInsert = false;

      if (repeat_pattern === 'daily') shouldInsert = true;
      else if (repeat_pattern === 'weekday' && day >= 1 && day <= 5) shouldInsert = true;
      else if (repeat_pattern === 'weekend' && (day === 0 || day === 6)) shouldInsert = true;
      else if (repeat_pattern === 'weekly' && selectedDays.includes(day)) shouldInsert = true;

      if (shouldInsert) {
        const dateStr = curr.toISOString().split('T')[0];
        datesToInsert.push([user_id, title, description, dateStr, priority || 2, 1, repeat_pattern, repeat_day, routine_id]);
      }
      curr = new Date(curr.setDate(curr.getDate() + 1));
    }

    if (datesToInsert.length > 0) {
      const query = `INSERT INTO todos (user_id, title, description, target_date, priority, is_routine, repeat_pattern, repeat_day, routine_id) VALUES ?`;
      await pool.query(query, [datesToInsert]);
      res.status(201).json({ message: '루틴 등록 성공!' });
    } else {
      res.status(400).json({ message: '날짜 없음' });
    }
  } catch (err) {
    res.status(500).json({ message: '서버 에러' });
  }
});

// 7. 투두 완료 상태 업데이트 API
app.patch('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_completed } = req.body;
  try {
    await pool.query('UPDATE todos SET is_completed = ? WHERE id = ? AND user_id = ?', [is_completed, id, req.user.userid]);
    res.json({ message: '상태 업데이트 완료' });
  } catch (err) {
    res.status(500).json({ message: '업데이트 실패' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 서버 작동 중: 포트 ${PORT}`));