// Takeover audio relay: MediaRecorder chunks (~250ms) out, MediaSource playback in.
// Used by the visitor page and the takeover page. Hold and transfer stop a stream and start a
// fresh one later (new 'audio-start' + new WebM header), so the far side can always decode it.
window.AudioRelay = function (ws, audioEl, onNeedTap) {
  var recorder = null, stream = null, sendChain = Promise.resolve(), gen = 0;
  var MS = window.ManagedMediaSource || window.MediaSource;
  var ms = null, sb = null, queue = [], mime = '', msUrl = null;
  var stats = { sent: 0, received: 0, mimeOut: '', mimeIn: '', streamsOut: 0, streamsIn: 0 };

  function pickMime() {
    var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < c.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i];
    return '';
  }

  async function startSending() {
    if (recorder) return;
    var my = ++gen;
    var s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (my !== gen) { s.getTracks().forEach(function (t) { t.stop(); }); return; } // stopped while the mic was opening
    stream = s;
    var m = pickMime();
    recorder = new MediaRecorder(stream, m ? { mimeType: m } : {});
    stats.mimeOut = recorder.mimeType || m;
    stats.streamsOut++;
    ws.send(JSON.stringify({ type: 'audio-start', mime: stats.mimeOut }));
    recorder.ondataavailable = function (e) {
      if (!e.data || !e.data.size) return;
      // Chain so chunks go out in order. A stopped stream's last chunk is dropped, not mixed into the next one.
      sendChain = sendChain.then(function () { return e.data.arrayBuffer(); }).then(function (buf) {
        if (my === gen && ws.readyState === 1) { ws.send(buf); stats.sent++; }
      });
    };
    recorder.start(250);
  }
  // Mic off (hold / transferred away). startSending() begins a fresh stream.
  function stopSending() {
    gen++;
    try { recorder && recorder.state !== 'inactive' && recorder.stop(); } catch (e) {}
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    recorder = null; stream = null;
  }
  function restartSending() { stopSending(); return startSending(); }

  function pump() {
    if (!sb || sb.updating) return;
    // Stay near live: skip ahead if we fall behind.
    try {
      var b = audioEl.buffered;
      if (b.length) {
        var end = b.end(b.length - 1);
        if (end - audioEl.currentTime > 1.2) audioEl.currentTime = end - 0.3;
        if (audioEl.currentTime - b.start(0) > 30) { sb.remove(0, audioEl.currentTime - 10); return; }
      }
    } catch (e) {}
    if (queue.length) {
      try { sb.appendBuffer(queue.shift()); } catch (e) { console.warn('append failed', e); }
    }
  }

  // Each 'audio-start' is a new stream from the far side: start a fresh MediaSource for it.
  function startReceiving(m) {
    stopReceiving();
    mime = m || 'audio/webm;codecs=opus';
    stats.mimeIn = mime;
    stats.streamsIn++;
    if (!MS) return console.warn('No MediaSource in this browser');
    ms = new MS();
    var mine = ms;
    audioEl.disableRemotePlayback = true;
    audioEl.src = msUrl = URL.createObjectURL(ms);
    ms.addEventListener('sourceopen', function () {
      if (mine !== ms) return;
      var types = [mime, mime.indexOf('mp4') >= 0 ? 'audio/mp4; codecs="mp4a.40.2"' : 'audio/webm; codecs="opus"'];
      for (var i = 0; i < types.length && !sb; i++) {
        try { sb = ms.addSourceBuffer(types[i]); } catch (e) {}
      }
      if (!sb) return console.warn('Cannot play', mime);
      sb.mode = 'sequence';
      sb.addEventListener('updateend', pump);
      pump();
    });
    var p = audioEl.play();
    if (p && p.catch) p.catch(function () { onNeedTap && onNeedTap(); });
  }

  function receive(buf) {
    stats.received++;
    if (!ms) return; // no stream open (on hold): drop it
    queue.push(buf);
    pump();
  }
  // Speaker off for the far side's stream (hold / transferred away).
  function stopReceiving() {
    if (!ms) return;
    try { audioEl.pause(); } catch (e) {}
    if (sb) sb.removeEventListener('updateend', pump);
    ms = null; sb = null; queue = [];
    audioEl.removeAttribute('src');
    try { audioEl.load(); } catch (e) {}
    if (msUrl) { URL.revokeObjectURL(msUrl); msUrl = null; }
  }

  function stop() {
    stopSending();
    stopReceiving();
    try { audioEl.pause(); } catch (e) {}
  }

  return { startSending: startSending, stopSending: stopSending, restartSending: restartSending, startReceiving: startReceiving, stopReceiving: stopReceiving, receive: receive, stop: stop, stats: stats, sending: function () { return !!recorder; }, receiving: function () { return !!ms; } };
};

// Unlock an <audio> element during a tap so it can play later (Safari/iOS).
window.unlockAudio = function (audioEl) {
  var rate = 8000, n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  audioEl.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  var p = audioEl.play();
  if (p && p.catch) p.catch(function () {});
};
