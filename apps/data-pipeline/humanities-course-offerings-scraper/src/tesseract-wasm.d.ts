declare module "tesseract-wasm" {
  type OCRBox = {
    rect: { left: number; top: number; right: number; bottom: number };
    confidence: number;
    text: string;
  };

  type OCREngine = {
    loadModel(model: Uint8Array): void;
    loadImage(image: { data: Uint8Array; width: number; height: number }): void;
    getTextBoxes(unit: string): OCRBox[];
    destroy(): void;
  };

  export function createOCREngine(options: { wasmBinary: Uint8Array }): Promise<OCREngine>;
}
