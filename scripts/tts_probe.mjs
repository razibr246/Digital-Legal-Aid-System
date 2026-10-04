import 'dotenv/config';
const key = process.env.SONIOX_API_KEY;
for (const url of ["wss://tts-rt.soniox.com/tts-websocket"]) {
  await new Promise((res) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { console.log(url, 'TIMEOUT'); ws.close(); res(); }, 8000);
    ws.onopen = () => { console.log('OPEN', url); ws.send(JSON.stringify({ api_key: key, stream_id: 's1', model: 'tts-rt-v2-ck', language: 'bn', voice: 'Priya', audio_format: 'pcm_s16le', sample_rate: 24000 })); ws.send(JSON.stringify({ stream_id: 's1', text: 'জি', text_end: true })); };
    ws.onmessage = (e) => { console.log('MSG typeof', typeof e.data, (typeof e.data==='string'? e.data.slice(0,200) : 'bin ' + e.data?.constructor?.name)); };
    let holes = 0;
    ws.onclose = (e) => { console.log('CLOSE', url, e.code, e.reason); clearTimeout(t); res(); };
    ws.onerror = (e) => console.log('ERR', url, e.message||e.error);
  });
}
