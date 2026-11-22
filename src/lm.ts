import { AutoModelForCausalLM, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer, type Tensor } from "@huggingface/transformers";
import { buildTokenMap, contextText, softmaxLast, wordWeights, type TokenMap } from "./context.ts";

// SmolLM2-135M: the smallest open model that still completes everyday English well.
// q4 is 182 MB, q4f16 (WebGPU with shader-f16) 117 MB; the int8 export gave visibly
// worse continuations in a spot check, so it is not offered.
export const MODEL_ID = "onnx-community/SmolLM2-135M-ONNX";

export type Device = "webgpu" | "wasm" | "cpu";
export type DType = "q4" | "q4f16";

export class WordModel {
  private tok: PreTrainedTokenizer;
  private model: PreTrainedModel;
  readonly map: TokenMap;
  readonly device: Device;

  private constructor(tok: PreTrainedTokenizer, model: PreTrainedModel, map: TokenMap, device: Device) {
    this.tok = tok;
    this.model = model;
    this.map = map;
    this.device = device;
  }

  static async load(words: readonly string[], counts: ArrayLike<number>, device: Device, dtype: DType, progress?: (p: unknown) => void) {
    const tok = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: progress });
    const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, { device, dtype, progress_callback: progress });
    const vocab = (model.config as unknown as { vocab_size: number }).vocab_size;
    const first = (s: string) => tok.encode(s, { add_special_tokens: false })[0];
    return new WordModel(tok, model, buildTokenMap(words, counts, vocab, first), device);
  }

  async nextToken(text: string): Promise<Float32Array> {
    const enc = this.tok(text, { add_special_tokens: false });
    const out = (await this.model(enc)) as { logits: Tensor };
    const [, rows, vocab] = out.logits.dims;
    return softmaxLast(out.logits.data as Float32Array, rows, vocab);
  }

  async predict(words: readonly string[], history: readonly string[] = []): Promise<Float64Array> {
    return wordWeights(this.map, await this.nextToken(contextText(words, history)), words.length === 0);
  }
}
