"""
Converts Google's SigLIP 2 (base, patch16, 224px) into the files Zen Sync loads with Transformers.js,
checks them against the original PyTorch model, and writes a manifest with SHA-256 for every file.

  python model/convert_siglip2.py out/

Output (flat, ready to upload as GitHub release assets):
  config.json, preprocessor_config.json, tokenizer.json, tokenizer_config.json, special_tokens_map.json
  vision_model.onnx            photo encoder, fp32
  vision_model_quantized.onnx  photo encoder, 8-bit (kept for accuracy comparisons)
  text_model_quantized.onnx    text encoder, 8-bit
  manifest.json                name, path inside the model folder, size, sha256
  reference.json               PyTorch reference embeddings, used by verify_in_app.mts
"""

import hashlib
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import requests
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from PIL import Image
from transformers import AutoImageProcessor, AutoModel, AutoTokenizer

MODEL = "google/siglip2-base-patch16-224"
TEXT_LENGTH = 64
CATS = "http://images.cocodataset.org/val2017/000000039769.jpg"
TEXTS = [
    "a photo of two cats lying on a sofa",
    "a photo of a bride and groom cutting a wedding cake",
    "a photo of a speaker presenting on a stage",
    "a photo of an empty car park",
]


def unit(x):
    x = np.asarray(x, dtype=np.float64)
    return x / np.linalg.norm(x, axis=-1, keepdims=True)


def cos(a, b):
    return float((unit(a) * unit(b)).sum(-1).min())


class Vision(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m.vision_model

    def forward(self, pixel_values):
        o = self.m(pixel_values=pixel_values)
        return o.last_hidden_state, o.pooler_output


class Text(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m.text_model

    def forward(self, input_ids):
        o = self.m(input_ids=input_ids)
        return o.last_hidden_state, o.pooler_output


def main(out):
    os.makedirs(out, exist_ok=True)
    model = AutoModel.from_pretrained(MODEL, torch_dtype=torch.float32).eval()
    tok = AutoTokenizer.from_pretrained(MODEL)
    proc = AutoImageProcessor.from_pretrained(MODEL)
    print("config model_type:", model.config.model_type, "| processor:", type(proc).__name__, "| tokenizer:", type(tok).__name__)

    # Configs the Transformers.js loader reads.
    model.config.save_pretrained(out)
    proc.save_pretrained(out)
    tok.save_pretrained(out)
    for f in os.listdir(out):
        if f not in {"config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"}:
            os.remove(os.path.join(out, f))
    # Transformers.js knows the plain SigLIP image processor; the fast/processor variants are Python-only names.
    pc = json.load(open(os.path.join(out, "preprocessor_config.json")))
    pc["image_processor_type"] = "SiglipImageProcessor"
    pc.pop("processor_class", None)
    json.dump(pc, open(os.path.join(out, "preprocessor_config.json"), "w"), indent=2)
    print("preprocessor:", pc)
    tc = json.load(open(os.path.join(out, "tokenizer_config.json")))
    tc["model_max_length"] = TEXT_LENGTH
    json.dump(tc, open(os.path.join(out, "tokenizer_config.json"), "w"), indent=2)

    # Reference outputs from the original model.
    image = Image.open(requests.get(CATS, stream=True, timeout=60).raw).convert("RGB")
    pix = proc(images=image, return_tensors="pt")["pixel_values"]
    ids = tok(TEXTS, padding="max_length", max_length=TEXT_LENGTH, truncation=True, return_tensors="pt")["input_ids"]
    with torch.no_grad():
        ref_img = model.get_image_features(pixel_values=pix)
        ref_txt = model.get_text_features(input_ids=ids)
        ref_img = getattr(ref_img, "pooler_output", ref_img).numpy()
        ref_txt = getattr(ref_txt, "pooler_output", ref_txt).numpy()
    sims = (unit(ref_img) @ unit(ref_txt).T)[0]
    print("reference similarities:", dict(zip(TEXTS, [round(float(s), 4) for s in sims])))
    assert int(np.argmax(sims)) == 0, "reference model doesn't pick the cats caption"

    # Export.
    common = dict(opset_version=17, do_constant_folding=True, dynamo=False)
    torch.onnx.export(Vision(model), (pix,), os.path.join(out, "vision_model.onnx"),
                      input_names=["pixel_values"], output_names=["last_hidden_state", "pooler_output"],
                      dynamic_axes={"pixel_values": {0: "batch"}, "last_hidden_state": {0: "batch"}, "pooler_output": {0: "batch"}},
                      **common)
    fp32_text = os.path.join(out, "text_model.fp32.onnx")
    torch.onnx.export(Text(model), (ids,), fp32_text,
                      input_names=["input_ids"], output_names=["last_hidden_state", "pooler_output"],
                      dynamic_axes={"input_ids": {0: "batch", 1: "sequence"}, "last_hidden_state": {0: "batch", 1: "sequence"}, "pooler_output": {0: "batch"}},
                      **common)

    # 8-bit versions.
    quantize_dynamic(os.path.join(out, "vision_model.onnx"), os.path.join(out, "vision_model_quantized.onnx"), weight_type=QuantType.QUInt8)
    quantize_dynamic(fp32_text, os.path.join(out, "text_model_quantized.onnx"), weight_type=QuantType.QUInt8)

    # Check every export against the reference.
    def run(name, feed):
        s = ort.InferenceSession(os.path.join(out, name), providers=["CPUExecutionProvider"])
        return s.run(["pooler_output"], feed)[0]

    v32 = run("vision_model.onnx", {"pixel_values": pix.numpy()})
    v8 = run("vision_model_quantized.onnx", {"pixel_values": pix.numpy()})
    t32 = run("text_model.fp32.onnx", {"input_ids": ids.numpy().astype(np.int64)})
    t8 = run("text_model_quantized.onnx", {"input_ids": ids.numpy().astype(np.int64)})
    checks = {
        "vision fp32": cos(v32, ref_img),
        "vision q8": cos(v8, ref_img),
        "text fp32": cos(t32, ref_txt),
        "text q8": cos(t8, ref_txt),
    }
    print("agreement with PyTorch (cosine, worst row):", {k: round(v, 5) for k, v in checks.items()})
    assert checks["vision fp32"] > 0.9999 and checks["text fp32"] > 0.9999, "fp32 export doesn't match"
    assert checks["text q8"] > 0.98, "8-bit text model drifted too far"
    q_sims = (unit(v32) @ unit(t8).T)[0]
    print("shipped pair (vision fp32 + text q8) similarities:", [round(float(s), 4) for s in q_sims])
    assert list(np.argsort(-q_sims)) == list(np.argsort(-sims)), "8-bit text changes the ranking"
    os.remove(fp32_text)

    json.dump({
        "texts": TEXTS,
        "image_url": CATS,
        "image": unit(ref_img)[0].tolist(),
        "text": unit(ref_txt).tolist(),
        "input_ids": ids.numpy().tolist(),
    }, open(os.path.join(out, "reference.json"), "w"))

    files = []
    for name in sorted(os.listdir(out)):
        if name in {"manifest.json", "reference.json"}:
            continue
        p = os.path.join(out, name)
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        files.append({"name": name, "path": f"onnx/{name}" if name.endswith(".onnx") else name,
                      "size": os.path.getsize(p), "sha256": h.hexdigest()})
    # The app downloads everything in the manifest except the 8-bit photo model (kept for comparisons).
    shipped = [f for f in files if f["name"] != "vision_model_quantized.onnx"]
    json.dump({"model": MODEL, "files": shipped, "extra": [f for f in files if f not in shipped]}, open(os.path.join(out, "manifest.json"), "w"), indent=2)
    for f in files:
        print(f"{f['name']:32} {f['size'] / 1e6:8.1f} MB  {f['sha256'][:12]}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
