# Third-party components shipped in the built site

- `vendor/wasm/vision_wasm_internal.*`, bundled code from `@mediapipe/tasks-vision` 1.2.3: Apache License 2.0, Copyright Google LLC. https://github.com/google-ai-edge/mediapipe
- `vendor/face_landmarker.task`: MediaPipe Face Landmarker model (float16, v1), Apache License 2.0, Google LLC. https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
- `words.txt`, `lang/words-*.txt`: from hermitdave/FrequencyWords (OpenSubtitles 2018), CC BY-SA 4.0, Hermit Dave. https://github.com/hermitdave/FrequencyWords
- `lm/lm-worker.js`, bundled code from `@huggingface/transformers` 4.3.2 (Apache License 2.0, Hugging Face, https://github.com/huggingface/transformers.js) and `onnxruntime-web` (MIT License, Microsoft, https://github.com/microsoft/onnxruntime). ONNX Runtime notice in `lm/lm-worker.js.LEGAL.txt`.
- `lm/ort-wasm-simd-threaded.asyncify.*`: ONNX Runtime Web, MIT License, Microsoft Corporation.
- Not shipped, downloaded by the browser only if context-aware predictions are turned on: SmolLM2-135M (ONNX export `onnx-community/SmolLM2-135M-ONNX`), Apache License 2.0, Hugging Face. https://huggingface.co/HuggingFaceTB/SmolLM2-135M
