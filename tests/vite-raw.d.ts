// Masaüstü görünüm testleri desktop/src'yi içe aktarır; Vite'ın `?raw` içe aktarmaları kök tsc'de de tanınsın.
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
