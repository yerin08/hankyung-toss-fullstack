
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// 1. 정적 파일 설정 (CSS, JS, 이미지, 폰트 등)
app.use('/static', express.static(path.join(__dirname, 'static')));

// 2. 라우팅 설정
// 메인 홈 (Home)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'home.html'));
});

// MBTI 테스트 페이지
app.get('/mbti', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'mbti.html'));
});

// 아티클 페이지
app.get('/article', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'article.html'));
});

// 3. 서버 실행
app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(` Dev-Log 서버가 포트 ${PORT}에서 작동 중입니다.`);
  console.log(`================================================`);
});
