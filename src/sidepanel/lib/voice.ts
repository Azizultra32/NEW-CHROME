export { parseIntent } from '../intent';
export type { Intent } from '../intent';

let ttsSpeaking = false;
export function speak(text: string) {
  try {
    ttsSpeaking = true;
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => { ttsSpeaking = false; };
    utter.onerror = () => { ttsSpeaking = false; };
    speechSynthesis.speak(utter);
  } catch {}
}

export function isTtsSpeaking() {
  return ttsSpeaking;
}
