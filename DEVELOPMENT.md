# VoxLocal 开发指南

## 环境要求

- Apple Silicon Mac（本地 MLX 推理的正式支持目标）
- macOS 13 或更高版本
- Node.js 20+
- Rust stable 与 Cargo
- Xcode Command Line Tools
- 至少 15GB 可用磁盘空间（具体取决于下载的模型）

Intel Mac 或其他系统可以开发 React 界面和 MCP 协议层，但 MLX 语音生成需要 Apple Silicon。

## 从源码启动

```bash
git clone git@github.com:hanchn/VoxLocal.git
cd VoxLocal
npm install
npm run tauri dev
```

首次使用非系统音色时，桌面端会使用仓库内的 `vendor/uv` 创建隔离 Python 3.12 环境。Python 包、模型和音色包都写入 `~/Library/Application Support/VoxLocal`，不会污染项目目录或系统 Python。

## 资源管理

```bash
# 查看所有模型和本机安装状态
npm run resources -- status

# 下载 Qwen 公共预设模型
npm run resources -- download qwen-custom

# 下载均衡档克隆模型
npm run resources -- download qwen-clone-balanced

# 只下载 Kokoro 基础模型和一个中文音色
npm run resources -- download kokoro zf_xiaobei

# 主动下载全部 Kokoro 音色
npm run resources -- download kokoro --all
```

完整资源定义见 `resources/catalog.json`。Git 仓库只包含 9 个公共试听 WAV 和运行时安装器，不包含数 GB 的模型权重、用户录音、生成历史或文档数据。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/` | React 页面、播放器、音色库、录音、文档导入和本地状态 |
| `src-tauri/` | macOS 桌面外壳、文件权限、任务队列、分片拼接和进程管理 |
| `backend/` | MLX/Qwen3-TTS/Kokoro Python 推理适配器 |
| `plugins/voxlocal/` | Codex 插件、技能和 MCP Server |
| `assets/public-voice-previews/` | 随仓库分发的公共试听缓存 |
| `resources/` | 可下载模型和音色的机器可读清单 |
| `scripts/` | 集成测试、资源下载和缓存预热工具 |

## 验证

```bash
npm run build
(cd src-tauri && cargo test)
npm run check:plugin
npm run test:mcp
```

需要模型的真实集成测试：

```bash
npm run test:open-voice
npm run test:kokoro-voice
npm run test:mcp:clone
```

`npm run test:clone-voices` 会生成并登记测试克隆音色，仅用于本地质量验证，不应在 CI 中默认运行。

## 数据位置

运行数据统一位于 `~/Library/Application Support/VoxLocal`：

- `models/`：模型和公共声音包
- `runtime/`：隔离 Python/MLX 环境
- `voices/`：活跃克隆音色及参考录音
- `voice-trash/`：可恢复的已删除克隆音色
- `voice-previews/`：试听缓存
- `exports/`：用户主动生成的完整音频
- `audio-trash/`：可恢复的已删除生成音频
- `jobs/`：任务状态与历史索引

## 提交约定

不要提交 `node_modules`、`dist`、Rust `target`、模型目录、用户数据或应用支持目录。新增第三方模型时，必须同步更新 `resources/catalog.json` 与 `THIRD_PARTY_NOTICES.md`。
