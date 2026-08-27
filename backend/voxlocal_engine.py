#!/usr/bin/env python3
"""Persistent-per-job MLX Qwen3-TTS runner used by the VoxLocal desktop app."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def emit(kind: str, **payload: object) -> None:
    print(json.dumps({"type": kind, **payload}, ensure_ascii=False), flush=True)


def ensure_model(model_id: str, model_dir: Path) -> None:
    if (model_dir / "model.safetensors").exists() and (model_dir / "speech_tokenizer" / "model.safetensors").exists():
        return
    source = os.environ.get("VOXLOCAL_MODEL_SOURCE", "huggingface")
    if source == "modelscope" and "Qwen3-TTS-12Hz" in model_id:
        from modelscope import snapshot_download as modelscope_download

        size = "1.7B" if "1.7B" in model_id else "0.6B"
        variant = "CustomVoice" if "CustomVoice" in model_id else "Base"
        original_id = f"Qwen/Qwen3-TTS-12Hz-{size}-{variant}"
        original_dir = model_dir.parent / f"original-Qwen3-TTS-12Hz-{size}-{variant}"
        emit("model_progress", percent=1, message="正在从 ModelScope 下载官方模型")
        modelscope_download(original_id, local_dir=str(original_dir))
        bits = "4" if "4bit" in model_id else "6" if "6bit" in model_id else "8"
        emit("model_progress", percent=82, message="正在针对 Apple Silicon 转换模型")
        subprocess.check_call([
            sys.executable, "-m", "mlx_audio.convert", "--hf-path", str(original_dir),
            "--mlx-path", str(model_dir), "--quantize", "--q-bits", bits, "--model-domain", "tts",
        ])
        emit("model_progress", percent=100, message="本地模型准备完成")
        return

    from huggingface_hub import snapshot_download
    from tqdm.auto import tqdm

    class DownloadProgress(tqdm):
        def update(self, n: int = 1) -> bool | None:
            result = super().update(n)
            if self.total:
                emit("model_progress", percent=min(100, round(self.n / self.total * 100)), message="正在下载本地模型")
            return result

    snapshot_download(model_id, local_dir=model_dir, max_workers=2, tqdm_class=DownloadProgress)


def download_public_voice(request: dict[str, object]) -> None:
    model_id = str(request["model_id"])
    model_dir = Path(str(request["model_dir"]))
    speaker = str(request.get("speaker") or "")
    model_dir.mkdir(parents=True, exist_ok=True)
    if "Kokoro-82M" in model_id:
        from huggingface_hub import snapshot_download

        emit("model_progress", percent=2, message="正在下载 Kokoro 轻量模型与音色包")
        snapshot_download(
            model_id,
            local_dir=model_dir,
            allow_patterns=[
                "config.json", "kokoro-v1_0.safetensors", ".gitattributes",
                f"voices/{speaker}.safetensors",
            ],
            max_workers=2,
        )
        emit("model_progress", percent=100, message="音色下载完成")
        return
    ensure_model(model_id, model_dir)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request")
    parser.add_argument("--download-request")
    args = parser.parse_args()
    if args.download_request:
        try:
            download_public_voice(json.loads(Path(args.download_request).read_text(encoding="utf-8")))
            return 0
        except Exception as exc:
            emit("error", message=str(exc))
            return 1
    if not args.request:
        parser.error("--request or --download-request is required")
    request = json.loads(Path(args.request).read_text(encoding="utf-8"))

    if request.get("language") == "j":
        try:
            import unidic
            import unidic_lite

            # Misaki's Japanese tokenizer discovers the `unidic` module by
            # default. Point it at the bundled lightweight dictionary so a
            # Japanese voice does not require a separate 526 MB download.
            unidic.DICDIR = unidic_lite.DICDIR
        except Exception as exc:
            emit("error", message=f"日语发音词典不可用：{exc}")
            return 2

    try:
        import numpy as np
        import soundfile as sf
        from mlx_audio.tts.utils import load_model
    except Exception as exc:
        emit("error", message=f"本地 MLX 运行时不可用：{exc}")
        return 2

    model_id = request["model_id"]
    model_dir = Path(request["model_dir"])
    model_dir.mkdir(parents=True, exist_ok=True)
    emit("stage", stage="checking_model", message="正在检查本地模型")
    try:
        ensure_model(model_id, model_dir)
        emit("stage", stage="loading_model", message="正在加载本地模型")
        model = load_model(str(model_dir))
        chunks = request["chunks"]
        total = len(chunks)
        for index, item in enumerate(chunks):
            emit("stage", stage="generating", index=index, total=total, message=f"正在生成第 {index + 1}/{total} 段")
            generation = {
                "text": item["text"],
                "lang_code": request.get("language", "Chinese"),
                "stream": False,
            }
            speaker = item.get("speaker") or request.get("speaker")
            if speaker:
                generation.update(voice=speaker, instruct=item.get("instruct") or request.get("instruct") or None)
            else:
                generation.update(
                    ref_audio=request.get("reference_audio"),
                    ref_text=request.get("reference_text") or None,
                )
                # Keep cloned-voice chunks stylistically consistent.  Without
                # an instruction the model may choose a different speaking
                # rate for every independent chunk of a long narration.
                if request.get("instruct"):
                    generation["instruct"] = request["instruct"]
            results = list(model.generate(**generation))
            if not results:
                raise RuntimeError("模型没有返回音频")
            result = results[0]
            audio = np.asarray(result.audio, dtype=np.float32)
            sample_rate = int(getattr(result, "sample_rate", 24000))
            sf.write(item["output"], audio, sample_rate, subtype="PCM_16")
            emit("chunk_complete", index=index, total=total, output=item["output"])
        emit("complete", total=total)
        return 0
    except Exception as exc:
        emit("error", message=str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
