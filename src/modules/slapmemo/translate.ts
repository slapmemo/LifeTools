export {};

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type Pair = { sourceLanguage: string; targetLanguage: string };
interface OnDeviceTranslator { translate(text: string): Promise<string> }

declare global {
  var Translator: {
    availability(options: Pair): Promise<Availability>;
    create(options: Pair & { monitor?: (monitor: { addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void }) => void }): Promise<OnDeviceTranslator>;
  };
  var LanguageDetector: {
    create(): Promise<{ detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>> }>;
  };
}

const translators = new Map<string, Promise<OnDeviceTranslator>>();
export function getTranslator(pair: Pair, progress: (loaded: number) => void): Promise<OnDeviceTranslator> {
  const key = `${pair.sourceLanguage}:${pair.targetLanguage}`;
  let translator = translators.get(key);
  if (!translator) {
    translator = Translator.create({ ...pair, monitor: monitor => monitor.addEventListener('downloadprogress', event => progress(event.loaded)) });
    translators.set(key, translator);
    void translator.catch(() => { if (translators.get(key) === translator) translators.delete(key); });
  }
  return translator;
}
