import http from 'http';

http.get('http://localhost:3000/api/autotrader/state', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status code:', res.statusCode);
    console.log('Body:', d);
  });
});
