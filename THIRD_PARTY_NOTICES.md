# Third-party model notices

## Qwen3-TTS CustomVoice

- Source: `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- Apple Silicon conversion: `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`
- License: Apache License 2.0
- Included speaker presets: Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee

VoxLocal displays the model origin and license alongside these public voices. The model runs locally and is stored in the user's VoxLocal application-support directory.

## Kokoro 82M

- Source: `mlx-community/Kokoro-82M-8bit`
- License: Apache License 2.0
- Catalog: 54 independent voice packs across Mandarin Chinese, English, Japanese, Spanish, French, Hindi, Italian and Portuguese

Kokoro model files and individual voice packs are downloaded only when the user clicks the download control. They are not committed to this repository.

## FFmpeg

- Source: `https://ffmpeg.org/`
- Purpose: combine a maintained portrait and a complete audio file into an MP4
- License: depends on the installed build configuration (LGPL or GPL)

VoxLocal detects an existing system installation and does not commit an FFmpeg binary to this repository.

## Wav2Lip (optional)

- Source: `https://github.com/Rudrabha/Wav2Lip`
- Purpose: optional lip synchronization for a still portrait
- Usage restriction: personal, research and non-commercial use only for the official open-source model and weights

VoxLocal does not bundle Wav2Lip code or checkpoints. The application keeps it behind a replaceable video-engine adapter and displays the restriction before use. A commercial distribution must use a separately licensed lip-sync engine.
