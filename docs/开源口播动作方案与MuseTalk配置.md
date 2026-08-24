# 开源口播动作方案与 MuseTalk 配置

## 结论

当前 VoxLocal 使用的 Wav2Lip 只修改嘴部，不会生成头部、身体或手部动作。对于 Mac 本地运行，继续堆叠 SadTalker、EchoMimicV2 或 MuseTalk 的收益有限，主要瓶颈是 Apple GPU/MPS 兼容性和推理速度。

后续如果迁移到 NVIDIA CUDA 机器，推荐分层使用：

1. **MuseTalk 1.5**：替换 Wav2Lip，优先解决口型准确度和脸部稳定性；
2. **EchoMimicV2**：作为动作模式，生成半身、头部、表情和一定程度的手部动作；
3. **Hallo2**：适合长时间、高分辨率的人像口播，但主要是头部/脸部运动，不是手势方案；
4. **TalkingPose**：适合用动作参考视频迁移上半身和手势，但部署和模型生态相对更新。

## MuseTalk 官方配置

官方建议：

- Python 3.10；
- PyTorch 2.0.1；
- CUDA 11.7/11.8；
- torchvision 0.15.2、torchaudio 2.0.2；
- MMCV 2.0.1、MMDetection 3.1.0、MMPose 1.1.0；
- FFmpeg；
- 模型组件：MuseTalk 1.5、SD-VAE、Whisper、DWPose、SyncNet、face-parse-bisent、ResNet18；
- 官方演示最低测试配置为 NVIDIA RTX 3050 Ti Laptop 4GB VRAM，8 秒视频约 5 分钟；
- 官方实时性能参考为 NVIDIA Tesla V100 上 30fps+，不能直接类比 Mac 性能。

MuseTalk 的脸部区域为 256×256，支持中文、英文和日语；它仍然是口型同步模型，不负责手部动作。官方仓库还说明，当前管线可能存在抖动、身份细节丢失等限制。

## 对 Mac 的判断

MuseTalk 官方安装和性能路径是 CUDA，项目没有给出 Apple Silicon/MPS 的稳定支持承诺。因此在 Mac 上可以尝试移植 PyTorch/MPS，但不建议把它作为产品默认引擎：依赖、算子兼容性、显存和速度都可能成为问题。

## 参考仓库

- MuseTalk：https://github.com/TMElyralab/MuseTalk
- EchoMimic：https://github.com/antgroup/echomimic
- Hallo2：https://github.com/fudan-generative-vision/hallo2
- TalkingPose：https://github.com/dfki-av/TalkingPose

## 当前项目决定

本项目暂不继续推进 MuseTalk/EchoMimicV2 的本地集成，保留现有 Mac 可运行的语音、视频导出、历史记录和 Wav2Lip 代码，后续如有 NVIDIA CUDA 环境再按上述分层方案恢复评估。
