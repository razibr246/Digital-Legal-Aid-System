const url = 'wss://legal-voice-agent.adribmahmud.workers.dev/v1/tts?model=tts-rt-v2&language=bn&encoding=linear16&sample_rate=24000';
const ws = new WebSocket(url);
ws.binaryType='arraybuffer';
ws.onopen=()=>{console.log('open'); ws.send(JSON.stringify({type:'Speak', text:'জি, সাধারণ তথ্যের জন্য আপনার প্রশ্নটি বলুন।'}));};
let n=0;
ws.onmessage=(e)=>{ n++; if(typeof e.data==='string') console.log('TXT', e.data.slice(0,300)); else console.log('BIN', e.data.byteLength); };
ws.onclose=(e)=>console.log('CLOSE', e.code, e.reason, 'bins=', n);
ws.onerror=(e)=>console.log('ERR', e.message||e.error||'');
setTimeout(()=>{try{ws.close()}catch{}},15000);
