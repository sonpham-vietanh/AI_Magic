'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechStatus = 'idle' | 'playing' | 'paused';

export interface SpeechLine {
  speaker: string;
  text: string;
}

/** Đọc kịch bản bằng giọng của trình duyệt (speechSynthesis). Không phải tệp âm thanh. */
export function useSpeech(lines: SpeechLine[], speakers: string[]) {
  const [supported, setSupported] = useState(true);
  const [hasVi, setHasVi] = useState(true);
  const [voiceCount, setVoiceCount] = useState(0);
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const [index, setIndex] = useState(-1);
  const run = useRef(0);
  const linesRef = useRef(lines);
  const speakersRef = useRef(speakers);
  linesRef.current = lines;
  speakersRef.current = speakers;
  const posRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const synth = window.speechSynthesis;
    const load = () => {
      const vs = synth.getVoices();
      setVoiceCount(vs.length);
      setHasVi(vs.some((v) => v.lang.toLowerCase().startsWith('vi')));
    };
    // Trình duyệt thường nạp danh sách giọng chậm: chờ một lúc rồi mới kết luận "không có giọng".
    const timer = window.setTimeout(load, 1500);
    if (synth.getVoices().length) load();
    synth.addEventListener?.('voiceschanged', load);
    return () => {
      window.clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', load);
      run.current++;
      synth.cancel();
    };
  }, []);

  const speakAt = useCallback((i: number) => {
    const synth = window.speechSynthesis;
    const all = linesRef.current;
    const token = ++run.current;
    synth.cancel();
    if (i >= all.length) {
      setStatus('idle');
      setIndex(-1);
      posRef.current = 0;
      return;
    }
    posRef.current = i;
    setIndex(i);
    setStatus('playing');
    const line = all[i];
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = 'vi-VN';
    const vi = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('vi'));
    const who = Math.max(0, speakersRef.current.indexOf(line.speaker)) % 2;
    if (vi.length) u.voice = vi[who % vi.length];
    u.pitch = who === 0 ? 1.05 : 0.8; // hai người nói khác cao độ
    u.rate = 1;
    u.onend = () => {
      if (run.current === token) speakAt(i + 1);
    };
    u.onerror = () => {
      if (run.current === token) {
        setStatus('idle');
        setIndex(-1);
      }
    };
    // Chrome đôi khi bỏ qua speak() ngay sau cancel(): hoãn một nhịp ngắn.
    setTimeout(() => {
      if (run.current === token) synth.speak(u);
    }, 30);
  }, []);

  const play = useCallback(
    (from?: number) => {
      if (!supported) return;
      speakAt(from ?? (posRef.current || 0));
    },
    [speakAt, supported],
  );
  const pause = useCallback(() => {
    if (!supported) return;
    run.current++;
    window.speechSynthesis.cancel();
    setStatus('paused');
  }, [supported]);
  const stop = useCallback(() => {
    if (!supported) return;
    run.current++;
    window.speechSynthesis.cancel();
    posRef.current = 0;
    setStatus('idle');
    setIndex(-1);
  }, [supported]);
  const next = useCallback(() => {
    if (!supported) return;
    speakAt(Math.min(linesRef.current.length - 1, posRef.current + 1));
  }, [speakAt, supported]);

  return { supported, hasVi, voiceCount, status, index, play, pause, stop, next };
}
