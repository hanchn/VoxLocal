use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use tauri::Manager;
use sha2::{Digest, Sha256};

struct SpeechState {
    pid: Mutex<Option<u32>>,
}

struct JobState {
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceProfile {
    architecture: String,
    memory_gb: u64,
    performance_tier: String,
    recommended_model: String,
    chunk_characters: usize,
    system_concurrency: usize,
    clone_concurrency: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    supported: bool,
    ready: bool,
    model_ready: bool,
    runtime_path: Option<String>,
    model_id: String,
    message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesisJob {
    id: String,
    source: String,
    engine_id: String,
    voice_id: String,
    created_at: String,
    status: String,
    stage: String,
    progress: u8,
    completed_chunks: usize,
    total_chunks: usize,
    output_path: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SynthesisRequest {
    text: String,
    title: String,
    voice_id: String,
    rate: f32,
    reference_path: Option<String>,
    reference_text: Option<String>,
    speaker: Option<String>,
    instruct: Option<String>,
    language: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicVoiceRequest {
    id: String,
    speaker: String,
}

fn app_root() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("无法确定用户目录")?;
    Ok(PathBuf::from(home).join("Library/Application Support/VoxLocal"))
}

fn jobs_root() -> Result<PathBuf, String> {
    let path = app_root()?.join("jobs");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn exports_root() -> Result<PathBuf, String> {
    let path = app_root()?.join("exports");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn voice_previews_root() -> Result<PathBuf, String> {
    let path = app_root()?.join("voice-previews");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn voice_preview_cache_path(voice_id: &str, text: &str) -> Result<PathBuf, String> {
    let mut hasher = Sha256::new();
    hasher.update(b"v1\0");
    hasher.update(voice_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(text.as_bytes());
    let digest = hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    Ok(voice_previews_root()?.join(format!("{}-{}.wav", safe_stem(voice_id), &digest[..24])))
}

fn job_path(id: &str) -> Result<PathBuf, String> {
    Ok(jobs_root()?.join(format!("{id}.json")))
}

fn write_job(job: &SynthesisJob) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(job).map_err(|error| error.to_string())?;
    fs::write(job_path(&job.id)?, data).map_err(|error| error.to_string())
}

fn update_job(id: &str, mutate: impl FnOnce(&mut SynthesisJob)) -> Result<SynthesisJob, String> {
    let mut job: SynthesisJob = serde_json::from_slice(&fs::read(job_path(id)?).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    mutate(&mut job);
    write_job(&job)?;
    Ok(job)
}

fn memory_bytes() -> u64 {
    Command::new("/usr/sbin/sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(8 * 1024 * 1024 * 1024)
}

fn current_device_profile() -> DeviceProfile {
    let memory_gb = memory_bytes() / 1024 / 1024 / 1024;
    let (performance_tier, model, chunk_characters, system_concurrency) = if memory_gb >= 24 {
        ("quality", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", 300, 4)
    } else if memory_gb >= 12 {
        ("balanced", "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit", 240, 3)
    } else {
        ("compact", "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit", 160, 2)
    };
    DeviceProfile {
        architecture: std::env::consts::ARCH.into(),
        memory_gb,
        performance_tier: performance_tier.into(),
        recommended_model: model.into(),
        chunk_characters,
        system_concurrency,
        clone_concurrency: 1,
    }
}

fn open_voice_model() -> &'static str {
    "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit"
}

#[tauri::command]
fn public_voice_availability(voices: Vec<PublicVoiceRequest>) -> Result<HashMap<String, bool>, String> {
    let models = app_root()?.join("models");
    let qwen = models.join(open_voice_model().replace('/', "--"));
    let qwen_ready = qwen.join("model.safetensors").exists() && qwen.join("speech_tokenizer/model.safetensors").exists();
    let kokoro = models.join("mlx-community--Kokoro-82M-8bit");
    let kokoro_ready = kokoro.join("kokoro-v1_0.safetensors").exists();
    Ok(voices.into_iter().map(|voice| {
        let ready = if voice.id.starts_with("qwen-") {
            qwen_ready
        } else if voice.id.starts_with("kokoro-") {
            kokoro_ready && kokoro.join("voices").join(format!("{}.safetensors", voice.speaker)).exists()
        } else {
            false
        };
        (voice.id, ready)
    }).collect())
}

#[tauri::command]
async fn download_public_voice(app: tauri::AppHandle, voice_id: String, speaker: String) -> Result<(), String> {
    if !(voice_id.starts_with("qwen-") || voice_id.starts_with("kokoro-")) || !speaker.chars().all(|character| character.is_ascii_alphanumeric() || character == '_') {
        return Err("公共音色标识无效".into());
    }
    let model_id = if voice_id.starts_with("kokoro-") { "mlx-community/Kokoro-82M-8bit" } else { open_voice_model() };
    let model_dir = app_root()?.join("models").join(model_id.replace('/', "--"));
    let temporary = app_root()?.join("temp").join(format!("voice-download-{}", Uuid::new_v4()));
    fs::create_dir_all(&temporary).map_err(|error| error.to_string())?;
    let request_path = temporary.join("request.json");
    fs::write(&request_path, serde_json::to_vec(&serde_json::json!({ "model_id": model_id, "model_dir": model_dir, "speaker": speaker })).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let python = runtime_python()?;
    let runner = engine_script(&app)?;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(python);
        command.arg(runner).args(["--download-request", request_path.to_string_lossy().as_ref()]);
        let china_timezone = fs::read_link("/etc/localtime").map(|path| path.to_string_lossy().contains("Asia/Shanghai") || path.to_string_lossy().contains("Asia/Chongqing") || path.to_string_lossy().contains("Asia/Hong_Kong")).unwrap_or(false);
        if china_timezone { command.env("VOXLOCAL_MODEL_SOURCE", "modelscope"); }
        command.output().map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())??;
    let _ = fs::remove_dir_all(temporary);
    if result.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&result.stdout).lines().last().unwrap_or("音色下载失败").to_owned()) }
}

#[tauri::command]
fn device_profile() -> DeviceProfile {
    current_device_profile()
}

fn runtime_python() -> Result<PathBuf, String> {
    Ok(app_root()?.join("runtime/.venv/bin/python"))
}

fn find_uv(app: &tauri::AppHandle) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let resource = app.path().resource_dir().ok();
    [
        resource.as_ref().map(|path| path.join("vendor/uv")),
        resource.as_ref().map(|path| path.join("uv")),
        home.as_ref().map(|path| path.join(".local/bin/uv")),
        Some(PathBuf::from("/opt/homebrew/bin/uv")),
        Some(PathBuf::from("/usr/local/bin/uv")),
    ]
    .into_iter()
    .flatten()
    .find(|path| path.exists())
}

#[tauri::command]
fn engine_status() -> EngineStatus {
    let profile = current_device_profile();
    let supported = cfg!(target_os = "macos") && std::env::consts::ARCH == "aarch64";
    let runtime_root = app_root().ok().map(|root| root.join("runtime"));
    let runtime = runtime_python().ok().filter(|path| path.exists());
    let multilingual_runtime_ready = runtime_root.as_ref().map(|path| path.join(".kokoro-multilingual-ready").exists()).unwrap_or(false);
    let model_directory = app_root().ok().map(|root| root.join("models").join(profile.recommended_model.replace('/', "--")));
    let model_ready = model_directory.as_ref().map(|path| path.join("model.safetensors").exists() && path.join("speech_tokenizer/model.safetensors").exists()).unwrap_or(false);
    EngineStatus {
        supported,
        ready: supported && runtime.is_some() && multilingual_runtime_ready,
        model_ready,
        runtime_path: runtime.map(|path| path.to_string_lossy().into_owned()),
        model_id: profile.recommended_model,
        message: if !supported {
            "Qwen3-TTS 克隆引擎当前需要 Apple Silicon Mac".into()
        } else if model_ready && multilingual_runtime_ready {
            "MLX 运行时和克隆模型已就绪".into()
        } else if runtime_python().map(|path| path.exists()).unwrap_or(false) && multilingual_runtime_ready {
            "MLX 运行时已就绪；首次生成会下载模型".into()
        } else if runtime_python().map(|path| path.exists()).unwrap_or(false) {
            "需要补齐多语言音色组件".into()
        } else {
            "需要安装一次本地 MLX 运行时".into()
        },
    }
}

#[tauri::command]
async fn prepare_ai_engine(app: tauri::AppHandle) -> Result<EngineStatus, String> {
    if !(cfg!(target_os = "macos") && std::env::consts::ARCH == "aarch64") {
        return Err("Qwen3-TTS 克隆引擎当前需要 Apple Silicon Mac".into());
    }
    let uv = find_uv(&app).ok_or("未找到内置运行时安装器")?;
    let runtime_dir = app_root()?.join("runtime");
    fs::create_dir_all(&runtime_dir).map_err(|error| error.to_string())?;
    let venv = runtime_dir.join(".venv");
    if !venv.join("bin/python").exists() {
        let result = Command::new(&uv).args(["venv", "--python", "3.12"]).arg(&venv).status().map_err(|error| error.to_string())?;
        if !result.success() { return Err("创建本地 Python 运行时失败".into()); }
    }
    let python = venv.join("bin/python");
    let result = Command::new(&uv)
        .args(["pip", "install", "--python"])
        .arg(&python)
        .args(["mlx-audio", "soundfile", "modelscope", "misaki[en,ja,zh]", "unidic-lite"])
        .status()
        .map_err(|error| error.to_string())?;
    if !result.success() { return Err("安装 MLX 音频引擎失败".into()); }
    let english_ready = Command::new(&python).args(["-c", "import spacy; spacy.load('en_core_web_sm')"]).status().map(|status| status.success()).unwrap_or(false);
    if !english_ready {
        let result = Command::new(&uv)
            .args(["pip", "install", "--python"])
            .arg(&python)
            .arg("https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl")
            .status()
            .map_err(|error| error.to_string())?;
        if !result.success() { return Err("安装英语发音组件失败".into()); }
    }
    let japanese_ready = Command::new(&python).args(["-c", "import pathlib, unidic_lite; raise SystemExit(0 if (pathlib.Path(unidic_lite.DICDIR) / 'mecabrc').exists() else 1)"]).status().map(|status| status.success()).unwrap_or(false);
    if !japanese_ready { return Err("安装日语发音词典失败".into()); }
    fs::write(runtime_dir.join(".kokoro-multilingual-ready"), b"misaki-en-ja-zh-v2\n").map_err(|error| error.to_string())?;
    fs::copy(engine_script(&app)?, runtime_dir.join("voxlocal_engine.py")).map_err(|error| error.to_string())?;
    Ok(engine_status())
}

fn voice_name(profile: &str) -> Option<String> {
    let output = Command::new("/usr/bin/say").args(["-v", "?"]).output().ok()?;
    let listing = String::from_utf8_lossy(&output.stdout);
    let hints: &[&str] = match profile {
        "calm" => &["Li-mu", "Eddy"],
        "clear" => &["Tingting", "Sinji"],
        "bright" => &["Meijia", "Flo"],
        _ => &["Tingting", "Ting-Ting", "Meijia"],
    };
    for hint in hints {
        if let Some(line) = listing.lines().find(|line| line.to_lowercase().starts_with(&hint.to_lowercase())) {
            return line.split_whitespace().next().map(str::to_owned);
        }
    }
    listing.lines().find(|line| line.contains("zh_CN")).or_else(|| listing.lines().find(|line| line.contains("zh_"))).and_then(|line| line.split_whitespace().next()).map(str::to_owned)
}

#[tauri::command]
async fn speak_text(text: String, voice_id: String, words_per_minute: u16, state: tauri::State<'_, SpeechState>) -> Result<(), String> {
    if text.trim().is_empty() { return Err("没有可朗读的文字".into()); }
    if let Some(pid) = state.pid.lock().map_err(|_| "播放状态不可用")?.take() { let _ = Command::new("/bin/kill").arg(pid.to_string()).status(); }
    let mut command = Command::new("/usr/bin/say");
    command.args(["-r", &words_per_minute.clamp(80, 320).to_string()]);
    if let Some(name) = voice_name(&voice_id) { command.args(["-v", &name]); }
    command.arg(text);
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let pid = child.id();
    *state.pid.lock().map_err(|_| "播放状态不可用")? = Some(pid);
    let result = tauri::async_runtime::spawn_blocking(move || child.wait()).await.map_err(|error| error.to_string())?.map_err(|error| error.to_string())?;
    let mut active = state.pid.lock().map_err(|_| "播放状态不可用")?;
    if *active == Some(pid) { *active = None; }
    if result.success() || result.code().is_none() { Ok(()) } else { Err(format!("本地播放失败：{result}")) }
}

#[tauri::command]
fn stop_speech(state: tauri::State<'_, SpeechState>) -> Result<(), String> {
    if let Some(pid) = state.pid.lock().map_err(|_| "播放状态不可用")?.take() { Command::new("/bin/kill").arg(pid.to_string()).status().map_err(|error| error.to_string())?; }
    Ok(())
}

#[tauri::command]
fn persist_voice_recording(recording_id: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 100 * 1024 * 1024 { return Err("录音数据无效或过大".into()); }
    let safe_id: String = recording_id.chars().filter(|character| character.is_ascii_alphanumeric() || *character == '-').collect();
    if safe_id.is_empty() { return Err("录音标识无效".into()); }
    let directory = app_root()?.join("voices");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let input = directory.join(format!("{safe_id}.input"));
    let output = directory.join(format!("{safe_id}.wav"));
    fs::write(&input, bytes).map_err(|error| error.to_string())?;
    let status = Command::new("/usr/bin/afconvert").args(["-f", "WAVE", "-d", "LEI16@24000", "-c", "1"]).arg(&input).arg(&output).status().map_err(|error| error.to_string())?;
    let _ = fs::remove_file(input);
    if !status.success() { return Err("录音转换为模型格式失败".into()); }
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_voice_recording(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(path).canonicalize().map_err(|error| error.to_string())?;
    let voices = app_root()?.join("voices").canonicalize().map_err(|error| error.to_string())?;
    if !candidate.starts_with(&voices) { return Err("只能删除 VoxLocal 的音色录音".into()); }
    let stem = candidate.file_stem().and_then(|value| value.to_str()).unwrap_or_default().to_owned();
    fs::remove_file(candidate).map_err(|error| error.to_string())?;
    let metadata = voices.join(format!("{stem}.json"));
    if metadata.exists() { fs::remove_file(metadata).map_err(|error| error.to_string())?; }
    Ok(())
}

#[tauri::command]
fn persist_voice_profile(profile: serde_json::Value) -> Result<(), String> {
    let id = profile.get("id").and_then(|value| value.as_str()).ok_or("音色标识无效")?;
    let safe_id: String = id.chars().filter(|character| character.is_ascii_alphanumeric() || *character == '-').collect();
    if safe_id != id || !id.starts_with("voice-") { return Err("音色标识无效".into()); }
    let directory = app_root()?.join("voices");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    fs::write(directory.join(format!("{safe_id}.json")), serde_json::to_vec_pretty(&profile).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_voice_profiles() -> Result<Vec<serde_json::Value>, String> {
    let directory = app_root()?.join("voices");
    if !directory.exists() { return Ok(Vec::new()); }
    let mut profiles = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        let Ok(data) = fs::read(&path) else { continue; };
        let Ok(profile) = serde_json::from_slice::<serde_json::Value>(&data) else { continue; };
        let Some(id) = profile.get("id").and_then(|value| value.as_str()) else { continue; };
        if id.starts_with("voice-") { profiles.push(profile); }
    }
    profiles.sort_by(|left, right| right.get("createdAt").and_then(|value| value.as_str()).cmp(&left.get("createdAt").and_then(|value| value.as_str())));
    Ok(profiles)
}

fn validated_voice_id(voice_id: &str) -> Result<&str, String> {
    if voice_id.starts_with("voice-") && voice_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') { Ok(voice_id) } else { Err("音色标识无效".into()) }
}

#[tauri::command]
fn trash_voice_profile(voice_id: String) -> Result<serde_json::Value, String> {
    validated_voice_id(&voice_id)?;
    let voices = app_root()?.join("voices");
    let trash = app_root()?.join("voice-trash");
    fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
    let metadata = voices.join(format!("{voice_id}.json"));
    let mut profile: serde_json::Value = serde_json::from_slice(&fs::read(&metadata).map_err(|_| "找不到这个克隆音色档案")?).map_err(|error| error.to_string())?;
    if let Some(recording) = profile.get("recordingPath").and_then(|value| value.as_str()).map(PathBuf::from) {
        if recording.exists() {
            let destination = trash.join(format!("{voice_id}.wav"));
            fs::rename(&recording, &destination).map_err(|error| error.to_string())?;
            profile["recordingPath"] = serde_json::Value::String(destination.to_string_lossy().into_owned());
        }
    }
    profile["trashedAt"] = serde_json::Value::String(format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()));
    fs::write(trash.join(format!("{voice_id}.json")), serde_json::to_vec_pretty(&profile).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::remove_file(metadata).map_err(|error| error.to_string())?;
    Ok(profile)
}

#[tauri::command]
fn list_trash_voice_profiles() -> Result<Vec<serde_json::Value>, String> {
    let trash = app_root()?.join("voice-trash");
    if !trash.exists() { return Ok(Vec::new()); }
    let mut profiles = Vec::new();
    for entry in fs::read_dir(trash).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        if let Ok(profile) = fs::read(&path).ok().and_then(|data| serde_json::from_slice::<serde_json::Value>(&data).ok()).ok_or(()) { profiles.push(profile); }
    }
    Ok(profiles)
}

#[tauri::command]
fn restore_voice_profile(voice_id: String) -> Result<serde_json::Value, String> {
    validated_voice_id(&voice_id)?;
    let voices = app_root()?.join("voices");
    let trash = app_root()?.join("voice-trash");
    fs::create_dir_all(&voices).map_err(|error| error.to_string())?;
    let metadata = trash.join(format!("{voice_id}.json"));
    let mut profile: serde_json::Value = serde_json::from_slice(&fs::read(&metadata).map_err(|_| "回收站中找不到这个音色")?).map_err(|error| error.to_string())?;
    let recording = trash.join(format!("{voice_id}.wav"));
    if recording.exists() {
        let destination = voices.join(format!("{voice_id}.wav"));
        fs::rename(recording, &destination).map_err(|error| error.to_string())?;
        profile["recordingPath"] = serde_json::Value::String(destination.to_string_lossy().into_owned());
    }
    if let Some(object) = profile.as_object_mut() { object.remove("trashedAt"); }
    fs::write(voices.join(format!("{voice_id}.json")), serde_json::to_vec_pretty(&profile).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::remove_file(metadata).map_err(|error| error.to_string())?;
    Ok(profile)
}

#[tauri::command]
fn purge_voice_trash() -> Result<(), String> {
    let trash = app_root()?.join("voice-trash");
    if !trash.exists() { return Ok(()); }
    for entry in fs::read_dir(&trash).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_file() { fs::remove_file(path).map_err(|error| error.to_string())?; }
    }
    Ok(())
}

fn split_text(text: &str, limit: usize) -> Vec<String> {
    let cleaned = text.replace("\r\n", "\n").trim().to_owned();
    if cleaned.is_empty() { return vec![]; }
    let mut chunks = Vec::new();
    let mut current = String::new();
    for sentence in cleaned.split_inclusive(|character| matches!(character, '。' | '！' | '？' | '；' | '\n' | '.' | '!' | '?')) {
        if current.chars().count() + sentence.chars().count() > limit && !current.trim().is_empty() {
            chunks.push(current.trim().to_owned());
            current.clear();
        }
        if sentence.chars().count() > limit {
            for character in sentence.chars() {
                current.push(character);
                if current.chars().count() >= limit { chunks.push(current.trim().to_owned()); current.clear(); }
            }
        } else { current.push_str(sentence); }
    }
    if !current.trim().is_empty() { chunks.push(current.trim().to_owned()); }
    chunks
}

fn safe_stem(value: &str) -> String {
    let result: String = value.chars().map(|character| if character.is_alphanumeric() || matches!(character, '-' | '_') { character } else { '-' }).take(60).collect();
    if result.trim_matches('-').is_empty() { "voxlocal".into() } else { result.trim_matches('-').into() }
}

fn concat_wav(parts: &[PathBuf], output: &Path) -> Result<(), String> {
    let first = parts.first().ok_or("没有生成音频分片")?;
    let reader = hound::WavReader::open(first).map_err(|error| error.to_string())?;
    let spec = reader.spec();
    drop(reader);
    let mut joined: Vec<i16> = Vec::new();
    let crossfade_samples = ((spec.sample_rate as f32 * 0.02).round() as usize * spec.channels as usize).max(spec.channels as usize);
    for part in parts {
        let mut reader = hound::WavReader::open(part).map_err(|error| error.to_string())?;
        if reader.spec() != spec { return Err("音频分片格式不一致".into()); }
        let samples: Vec<i16> = reader.samples::<i16>().collect::<Result<_, _>>().map_err(|error| error.to_string())?;
        if joined.is_empty() { joined.extend(samples); continue; }
        let overlap = crossfade_samples.min(joined.len()).min(samples.len());
        let start = joined.len() - overlap;
        for index in 0..overlap {
            let ratio = (index + 1) as f32 / (overlap + 1) as f32;
            joined[start + index] = (joined[start + index] as f32 * (1.0 - ratio) + samples[index] as f32 * ratio).round().clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        }
        joined.extend_from_slice(&samples[overlap..]);
    }
    let mut writer = hound::WavWriter::create(output, spec).map_err(|error| error.to_string())?;
    for sample in joined { writer.write_sample(sample).map_err(|error| error.to_string())?; }
    writer.finalize().map_err(|error| error.to_string())
}

fn generate_system_parts(job_id: &str, request: &SynthesisRequest, chunks: &[String], temp: &Path, cancelled: &AtomicBool) -> Result<Vec<PathBuf>, String> {
    let rate = (180.0 * request.rate.clamp(0.5, 2.0)).round() as u16;
    let resolved_voice = voice_name(&request.voice_id);
    let concurrency = current_device_profile().system_concurrency.max(1);
    let parts: Vec<PathBuf> = (0..chunks.len()).map(|index| temp.join(format!("part-{index:05}.wav"))).collect();
    for batch_start in (0..chunks.len()).step_by(concurrency) {
        if cancelled.load(Ordering::Relaxed) { return Err("__cancelled__".into()); }
        let batch_end = (batch_start + concurrency).min(chunks.len());
        std::thread::scope(|scope| -> Result<(), String> {
            let mut handles = Vec::new();
            for index in batch_start..batch_end {
                let text = &chunks[index];
                let wav = parts[index].clone();
                let aiff = temp.join(format!("part-{index:05}.aiff"));
                let voice = resolved_voice.clone();
                handles.push(scope.spawn(move || -> Result<(), String> {
                    let mut command = Command::new("/usr/bin/say");
                    command.args(["-o", aiff.to_string_lossy().as_ref(), "-r", &rate.to_string()]);
                    if let Some(name) = voice { command.args(["-v", &name]); }
                    let status = command.arg(text).status().map_err(|error| error.to_string())?;
                    if !status.success() { return Err(format!("第 {} 段系统语音生成失败", index + 1)); }
                    let status = Command::new("/usr/bin/afconvert").args(["-f", "WAVE", "-d", "LEI16@24000", "-c", "1"]).arg(&aiff).arg(&wav).status().map_err(|error| error.to_string())?;
                    if status.success() { Ok(()) } else { Err(format!("第 {} 段音频转换失败", index + 1)) }
                }));
            }
            for handle in handles { handle.join().map_err(|_| "系统语音工作线程异常退出".to_owned())??; }
            Ok(())
        })?;
        let percent = ((batch_end as f32 / chunks.len() as f32) * 88.0).round() as u8;
        update_job(job_id, |job| { job.stage = format!("已生成 {}/{} 段", batch_end, chunks.len()); job.progress = percent; job.completed_chunks = batch_end; })?;
    }
    Ok(parts)
}

fn engine_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource) = app.path().resource_dir() {
        for candidate in [resource.join("backend/voxlocal_engine.py"), resource.join("voxlocal_engine.py")] {
            if candidate.exists() { return Ok(candidate); }
        }
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend/voxlocal_engine.py");
    if development.exists() { Ok(development) } else { Err("找不到本地模型执行程序".into()) }
}

fn sync_engine_runner(app: &tauri::AppHandle) -> Result<(), String> {
    let runtime_dir = app_root()?.join("runtime");
    fs::create_dir_all(&runtime_dir).map_err(|error| error.to_string())?;
    fs::copy(engine_script(app)?, runtime_dir.join("voxlocal_engine.py"))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn sync_bundled_voice_previews(app: &tauri::AppHandle) -> Result<(), String> {
    let mut candidates = vec![PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/public-voice-previews")];
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("assets/public-voice-previews"));
        candidates.push(resource.join("public-voice-previews"));
    }
    let Some(source) = candidates.into_iter().find(|path| path.is_dir()) else { return Ok(()); };
    let target = voice_previews_root()?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("wav") { continue; }
        let destination = target.join(path.file_name().ok_or("试听缓存文件名无效")?);
        if !destination.exists() { fs::copy(path, destination).map_err(|error| error.to_string())?; }
    }
    Ok(())
}

fn generate_mlx_parts(app: &tauri::AppHandle, job_id: &str, request: &SynthesisRequest, chunks: &[String], temp: &Path, cancelled: &AtomicBool) -> Result<Vec<PathBuf>, String> {
    let is_preset_voice = request.voice_id.starts_with("qwen-") || request.voice_id.starts_with("kokoro-");
    if !is_preset_voice {
        let reference = request.reference_path.as_ref().ok_or("克隆音色缺少参考录音")?;
        if !Path::new(reference).exists() { return Err("克隆音色的参考录音不存在".into()); }
    }
    let python = runtime_python()?;
    if !python.exists() { return Err("请先安装本地 MLX 引擎".into()); }
    let profile = current_device_profile();
    let parts: Vec<PathBuf> = (0..chunks.len()).map(|index| temp.join(format!("part-{index:05}.wav"))).collect();
    let items: Vec<serde_json::Value> = chunks.iter().zip(parts.iter()).map(|(text, output)| serde_json::json!({"text": text, "output": output})).collect();
    let model_id = if request.voice_id.starts_with("qwen-") {
        open_voice_model().to_owned()
    } else if request.voice_id.starts_with("kokoro-") {
        "mlx-community/Kokoro-82M-8bit".to_owned()
    } else {
        profile.recommended_model
    };
    let model_dir = app_root()?.join("models").join(model_id.replace('/', "--"));
    let payload = serde_json::json!({ "model_id": model_id, "model_dir": model_dir, "reference_audio": request.reference_path, "reference_text": request.reference_text, "speaker": request.speaker, "instruct": request.instruct, "language": request.language.as_deref().unwrap_or("Chinese"), "chunks": items });
    let request_path = temp.join("request.json");
    fs::write(&request_path, serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let china_timezone = fs::read_link("/etc/localtime").map(|path| path.to_string_lossy().contains("Asia/Shanghai") || path.to_string_lossy().contains("Asia/Chongqing") || path.to_string_lossy().contains("Asia/Hong_Kong")).unwrap_or(false);
    let mut command = Command::new(python);
    command.arg(engine_script(app)?).args(["--request", request_path.to_string_lossy().as_ref()]);
    if china_timezone { command.env("VOXLOCAL_MODEL_SOURCE", "modelscope"); }
    let mut child = command.stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|error| error.to_string())?;
    let stdout = child.stdout.take().ok_or("无法读取模型进度")?;
    let event_result = std::thread::scope(|scope| {
        let reader = scope.spawn(|| -> Result<(), String> {
            for line in BufReader::new(stdout).lines() {
                let line = line.map_err(|error| error.to_string())?;
                let event: serde_json::Value = match serde_json::from_str(&line) { Ok(value) => value, Err(_) => continue };
                match event["type"].as_str() {
                    Some("stage") => {
                        let message = event["message"].as_str().unwrap_or("本地模型处理中").to_owned();
                        update_job(job_id, |job| job.stage = message)?;
                    }
                    Some("chunk_complete") => {
                        let completed = event["index"].as_u64().unwrap_or(0) as usize + 1;
                        let percent = 20 + ((completed as f32 / chunks.len() as f32) * 68.0).round() as u8;
                        update_job(job_id, |job| { job.completed_chunks = completed; job.progress = percent; })?;
                    }
                    Some("model_progress") => {
                        let download = event["percent"].as_u64().unwrap_or(0) as u8;
                        let message = event["message"].as_str().unwrap_or("正在准备本地克隆模型").to_owned();
                        update_job(job_id, |job| { job.stage = message; job.progress = 2 + (download as f32 * 0.18).round() as u8; })?;
                    }
                    Some("error") => return Err(event["message"].as_str().unwrap_or("本地模型生成失败").into()),
                    _ => {}
                }
            }
            Ok(())
        });
        while !reader.is_finished() {
            if cancelled.load(Ordering::Relaxed) { let _ = child.kill(); }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        reader.join().map_err(|_| "模型进度读取线程异常退出".to_owned())?
    });
    if cancelled.load(Ordering::Relaxed) { let _ = child.wait(); return Err("__cancelled__".into()); }
    event_result?;
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() { return Err("本地模型进程异常退出".into()); }
    Ok(parts)
}

#[tauri::command]
fn start_synthesis(app: tauri::AppHandle, request: SynthesisRequest, state: tauri::State<'_, JobState>) -> Result<SynthesisJob, String> {
    if request.text.trim().is_empty() { return Err("没有可生成的文字".into()); }
    if request.text.chars().count() > 2_000_000 { return Err("单个任务最多支持 200 万字".into()); }
    let profile = current_device_profile();
    let chunks = split_text(&request.text, profile.chunk_characters);
    let id = Uuid::new_v4().to_string();
    let uses_mlx = request.voice_id.starts_with("voice-") || request.voice_id.starts_with("qwen-") || request.voice_id.starts_with("kokoro-");
    let source = if request.title.ends_with("试听") || request.title.contains("-试听") { "preview" } else { "text" };
    let job = SynthesisJob { id: id.clone(), source: source.into(), engine_id: if uses_mlx { "mlx-qwen3-tts".into() } else { "macos-system".into() }, voice_id: request.voice_id.clone(), created_at: format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()), status: "queued".into(), stage: "准备分片".into(), progress: 0, completed_chunks: 0, total_chunks: chunks.len(), output_path: None, error: None };
    write_job(&job)?;
    let cancellation = Arc::new(AtomicBool::new(false));
    state.cancellations.lock().map_err(|_| "任务状态不可用")?.insert(id.clone(), cancellation.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| -> Result<String, String> {
            update_job(&id, |job| { job.status = "running".into(); job.stage = "正在初始化本地引擎".into(); job.progress = 2; })?;
            let temp = app_root()?.join("temp").join(&id);
            fs::create_dir_all(&temp).map_err(|error| error.to_string())?;
            let parts = if request.voice_id.starts_with("voice-") || request.voice_id.starts_with("qwen-") || request.voice_id.starts_with("kokoro-") {
                generate_mlx_parts(&app, &id, &request, &chunks, &temp, &cancellation)?
            } else {
                generate_system_parts(&id, &request, &chunks, &temp, &cancellation)?
            };
            update_job(&id, |job| { job.stage = "正在无缝拼接音频".into(); job.progress = 92; })?;
            let output = exports_root()?.join(format!("{}-{}.wav", safe_stem(&request.title), &id[..8]));
            concat_wav(&parts, &output)?;
            let _ = fs::remove_dir_all(&temp);
            Ok(output.to_string_lossy().into_owned())
        })();
        match result {
            Ok(output) => { let _ = update_job(&id, |job| { job.status = "completed".into(); job.stage = "生成完成".into(); job.progress = 100; job.output_path = Some(output); }); }
            Err(error) if error == "__cancelled__" => { let _ = update_job(&id, |job| { job.status = "cancelled".into(); job.stage = "已取消".into(); }); }
            Err(error) => { let _ = update_job(&id, |job| { job.status = "failed".into(); job.stage = "生成失败".into(); job.error = Some(error); }); }
        }
    });
    Ok(job)
}

#[tauri::command]
fn get_synthesis_job(job_id: String) -> Result<SynthesisJob, String> {
    serde_json::from_slice(&fs::read(job_path(&job_id)?).map_err(|_| "找不到这个生成任务")?).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_synthesis_jobs() -> Result<Vec<SynthesisJob>, String> {
    let mut jobs = Vec::new();
    for entry in fs::read_dir(jobs_root()?).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        if let Ok(job) = fs::read(&path).ok().and_then(|data| serde_json::from_slice::<SynthesisJob>(&data).ok()).ok_or(()) {
            if job.status == "trashed" { continue; }
            let missing_completed_audio = job.status == "completed" && job.output_path.as_ref().map(|output| !Path::new(output).exists()).unwrap_or(true);
            if !missing_completed_audio { jobs.push(job); }
        }
    }
    jobs.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(jobs)
}

#[tauri::command]
fn rename_generated_audio(job_id: String, new_name: String) -> Result<SynthesisJob, String> {
    validated_job_id(&job_id)?;
    let trimmed = new_name.trim().trim_end_matches(".wav");
    if trimmed.is_empty() { return Err("文件名不能为空".into()); }
    let safe = safe_stem(trimmed);
    if safe.is_empty() { return Err("文件名无效".into()); }
    let mut job: SynthesisJob = serde_json::from_slice(&fs::read(job_path(&job_id)?).map_err(|_| "找不到这个生成任务")?).map_err(|error| error.to_string())?;
    let current = PathBuf::from(job.output_path.as_ref().ok_or("这个任务没有音频文件")?);
    if !current.exists() { return Err("历史音频文件不存在".into()); }
    let destination = current.parent().ok_or("音频目录无效")?.join(format!("{safe}.wav"));
    if destination != current && destination.exists() { return Err("已存在同名音频文件".into()); }
    if destination != current { fs::rename(&current, &destination).map_err(|error| error.to_string())?; }
    job.output_path = Some(destination.to_string_lossy().into_owned());
    write_job(&job)?;
    Ok(job)
}

fn validated_job_id(job_id: &str) -> Result<&str, String> {
    if !job_id.is_empty() && job_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') { Ok(job_id) } else { Err("生成任务标识无效".into()) }
}

#[tauri::command]
fn trash_generated_audio(job_id: String) -> Result<SynthesisJob, String> {
    validated_job_id(&job_id)?;
    let mut job: SynthesisJob = serde_json::from_slice(&fs::read(job_path(&job_id)?).map_err(|_| "找不到这个生成任务")?).map_err(|error| error.to_string())?;
    let current = PathBuf::from(job.output_path.as_ref().ok_or("这个任务没有音频文件")?);
    if !current.exists() { return Err("历史音频文件不存在".into()); }
    let trash = app_root()?.join("audio-trash");
    fs::create_dir_all(&trash).map_err(|error| error.to_string())?;
    let destination = trash.join(current.file_name().ok_or("音频文件名无效")?);
    if destination.exists() { return Err("回收站中已有同名音频".into()); }
    fs::rename(current, &destination).map_err(|error| error.to_string())?;
    job.status = "trashed".into();
    job.stage = "已移入回收站".into();
    job.output_path = Some(destination.to_string_lossy().into_owned());
    write_job(&job)?;
    Ok(job)
}

#[tauri::command]
fn list_trashed_audio_jobs() -> Result<Vec<SynthesisJob>, String> {
    let mut jobs = Vec::new();
    for entry in fs::read_dir(jobs_root()?).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") { continue; }
        let Ok(job) = fs::read(&path).ok().and_then(|data| serde_json::from_slice::<SynthesisJob>(&data).ok()).ok_or(()) else { continue; };
        if job.status == "trashed" && job.output_path.as_ref().map(|output| Path::new(output).exists()).unwrap_or(false) { jobs.push(job); }
    }
    jobs.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(jobs)
}

#[tauri::command]
fn restore_trashed_audio(job_id: String) -> Result<SynthesisJob, String> {
    validated_job_id(&job_id)?;
    let mut job: SynthesisJob = serde_json::from_slice(&fs::read(job_path(&job_id)?).map_err(|_| "回收站中找不到这个音频")?).map_err(|error| error.to_string())?;
    if job.status != "trashed" { return Err("这个音频不在回收站".into()); }
    let current = PathBuf::from(job.output_path.as_ref().ok_or("回收站音频路径无效")?);
    let destination = exports_root()?.join(current.file_name().ok_or("音频文件名无效")?);
    if destination.exists() { return Err("生成目录中已有同名音频".into()); }
    fs::rename(current, &destination).map_err(|error| error.to_string())?;
    job.status = "completed".into();
    job.stage = "生成完成".into();
    job.output_path = Some(destination.to_string_lossy().into_owned());
    write_job(&job)?;
    Ok(job)
}

#[tauri::command]
fn purge_audio_trash() -> Result<(), String> {
    for job in list_trashed_audio_jobs()? {
        if let Some(output) = job.output_path { if Path::new(&output).exists() { fs::remove_file(output).map_err(|error| error.to_string())?; } }
        let metadata = job_path(&job.id)?;
        if metadata.exists() { fs::remove_file(metadata).map_err(|error| error.to_string())?; }
    }
    Ok(())
}

fn recover_interrupted_jobs() {
    let Ok(root) = jobs_root() else { return; };
    let Ok(entries) = fs::read_dir(root) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(data) = fs::read(&path) else { continue; };
        let Ok(mut job) = serde_json::from_slice::<SynthesisJob>(&data) else { continue; };
        if job.status == "queued" || job.status == "running" {
            job.status = "interrupted".into();
            job.stage = "上次生成被中断，可重新生成".into();
            job.error = Some("应用关闭或设备重启导致任务中断".into());
            let _ = write_job(&job);
        }
    }
}

#[tauri::command]
fn cancel_synthesis_job(job_id: String, state: tauri::State<'_, JobState>) -> Result<(), String> {
    if let Some(flag) = state.cancellations.lock().map_err(|_| "任务状态不可用")?.get(&job_id) { flag.store(true, Ordering::Relaxed); }
    Ok(())
}

#[tauri::command]
fn read_audio_file(path: String) -> Result<Vec<u8>, String> {
    let canonical = PathBuf::from(path).canonicalize().map_err(|error| error.to_string())?;
    let exports = exports_root()?.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(exports) { return Err("只能读取 VoxLocal 生成的音频".into()); }
    fs::read(canonical).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_voice_preview_cache(voice_id: String, text: String) -> Result<Option<Vec<u8>>, String> {
    let path = voice_preview_cache_path(&voice_id, &text)?;
    if !path.exists() { return Ok(None); }
    fs::read(path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
fn cache_voice_preview(source_path: String, voice_id: String, text: String) -> Result<String, String> {
    let source = PathBuf::from(source_path).canonicalize().map_err(|error| error.to_string())?;
    let exports = exports_root()?.canonicalize().map_err(|error| error.to_string())?;
    if !source.starts_with(exports) { return Err("只能缓存 VoxLocal 生成的试听音频".into()); }
    let target = voice_preview_cache_path(&voice_id, &text)?;
    fs::copy(source, &target).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn reveal_audio_file(path: String) -> Result<(), String> {
    let canonical = PathBuf::from(path).canonicalize().map_err(|error| error.to_string())?;
    let registered = list_synthesis_jobs()?.into_iter().chain(list_trashed_audio_jobs()?).filter_map(|job| job.output_path).filter_map(|output| PathBuf::from(output).canonicalize().ok()).any(|output| output == canonical);
    if !registered { return Err("只能显示 VoxLocal 已登记的音频".into()); }
    let status = Command::new("/usr/bin/open").arg("-R").arg(canonical).status().map_err(|error| error.to_string())?;
    if status.success() { Ok(()) } else { Err("无法在 Finder 中显示文件".into()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    recover_interrupted_jobs();
    tauri::Builder::default()
        .manage(SpeechState { pid: Mutex::new(None) })
        .manage(JobState { cancellations: Mutex::new(HashMap::new()) })
        .setup(|app| {
            sync_engine_runner(app.handle()).map_err(std::io::Error::other)?;
            sync_bundled_voice_previews(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            speak_text, stop_speech, device_profile, engine_status, prepare_ai_engine, public_voice_availability, download_public_voice,
            persist_voice_recording, delete_voice_recording, persist_voice_profile, list_voice_profiles, trash_voice_profile, list_trash_voice_profiles, restore_voice_profile, purge_voice_trash, start_synthesis, get_synthesis_job, list_synthesis_jobs, rename_generated_audio, trash_generated_audio, list_trashed_audio_jobs, restore_trashed_audio, purge_audio_trash, cancel_synthesis_job, read_audio_file, read_voice_preview_cache, cache_voice_preview, reveal_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running VoxLocal");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semantic_chunking_respects_limit_and_content() {
        let text = "第一句话比较短。第二句话也不长！这是第三句话，用来确认分片不会丢字。";
        let chunks = split_text(text, 18);
        assert!(chunks.len() >= 2);
        assert!(chunks.iter().all(|chunk| chunk.chars().count() <= 18));
        assert_eq!(chunks.concat(), text);
    }

    #[test]
    fn preview_cache_key_is_stable_across_frontend_and_native() {
        let text = "清晨的阳光落在窗边，我打开一本喜欢的书。文字不只是信息，也保存着一个人的语气、节奏和温度。";
        let path = voice_preview_cache_path("qwen-vivian", text).unwrap();
        assert_eq!(path.file_name().and_then(|name| name.to_str()), Some("qwen-vivian-8667a97679f883cdbb820584.wav"));
    }

    #[test]
    fn wav_parts_are_concatenated_in_order() {
        let directory = std::env::temp_dir().join(format!("voxlocal-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let spec = hound::WavSpec { channels: 1, sample_rate: 24_000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let parts: Vec<PathBuf> = [120_i16, -240_i16].iter().enumerate().map(|(index, value)| {
            let path = directory.join(format!("{index}.wav"));
            let mut writer = hound::WavWriter::create(&path, spec).unwrap();
            for _ in 0..1000 { writer.write_sample(*value).unwrap(); }
            writer.finalize().unwrap();
            path
        }).collect();
        let output = directory.join("joined.wav");
        concat_wav(&parts, &output).unwrap();
        let samples: Vec<i16> = hound::WavReader::open(&output).unwrap().samples::<i16>().map(Result::unwrap).collect();
        assert!(samples.len() >= 1000 && samples.len() < 2000);
        assert_eq!(samples[0], 120);
        assert_eq!(*samples.last().unwrap(), -240);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn mac_system_voice_generates_real_audio_parts() {
        let id = format!("test-{}", Uuid::new_v4());
        let directory = std::env::temp_dir().join(&id);
        fs::create_dir_all(&directory).unwrap();
        let chunks = vec!["这是第一段。".to_owned(), "这是第二段。".to_owned()];
        let request = SynthesisRequest { text: chunks.concat(), title: "test".into(), voice_id: "warm".into(), rate: 1.0, reference_path: None, reference_text: None, speaker: None, instruct: None, language: None };
        write_job(&SynthesisJob { id: id.clone(), source: "text".into(), engine_id: "macos-system".into(), voice_id: "warm".into(), created_at: "test".into(), status: "running".into(), stage: "test".into(), progress: 0, completed_chunks: 0, total_chunks: chunks.len(), output_path: None, error: None }).unwrap();
        let parts = generate_system_parts(&id, &request, &chunks, &directory, &AtomicBool::new(false)).unwrap();
        let output = directory.join("joined.wav");
        concat_wav(&parts, &output).unwrap();
        let reader = hound::WavReader::open(&output).unwrap();
        assert_eq!(reader.spec().sample_rate, 24_000);
        assert!(reader.duration() > 24_000);
        fs::remove_dir_all(directory).unwrap();
        fs::remove_file(job_path(&id).unwrap()).unwrap();
    }
}
