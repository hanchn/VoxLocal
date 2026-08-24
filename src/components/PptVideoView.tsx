import { useEffect, useMemo, useState } from "react";
import { Download, Film, Image, Play, WandSparkles } from "lucide-react";
import type { SynthesisJob } from "../lib/synthesis";
import { getVideoJob, listVideoJobs, persistPptSlides, readVideo, startPptVideo, type PptSlide, type VideoAudioMode, type VideoJob } from "../lib/video";

type Theme = "ink" | "paper" | "sunset" | "aurora" | "mono";

function splitSlides(text: string, smart: boolean): PptSlide[] {
  const blocks = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const source = blocks.length ? blocks : [text.trim()];
  const slides: PptSlide[] = [];
  source.forEach((block, index) => {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^#+\s*/, "") || `第 ${index + 1} 页`;
    const body = lines.slice(1).join("\n") || title;
    if (body.length <= 180) slides.push({ id: `slide-${index + 1}`, title, body });
    else for (let offset = 0; offset < body.length; offset += 160) slides.push({ id: `slide-${slides.length + 1}`, title: slides.length ? `${title}（续）` : title, body: body.slice(offset, offset + 160) });
  });
  if (smart && slides.length > 0) {
    const first = slides[0];
    const summary = slides.map((slide) => slide.title).slice(0, 5).join("、");
    return [{ id: "slide-1", title: first.title, body: "一段清晰、节奏自然的本地口播视频" }, ...slides.map((slide, index) => ({ ...slide, id: `slide-${index + 2}` })), { id: `slide-${slides.length + 2}`, title: "总结与行动", body: `本次内容围绕：${summary}。\n建议保留一个明确的下一步，让观众知道接下来做什么。` }].slice(0, 60);
  }
  return slides.slice(0, 60);
}

function themeColors(theme: Theme) {
  return theme === "paper" ? { bg: "#f8f3eb", fg: "#24211d", accent: "#be684d" } : theme === "sunset" ? { bg: "#2b1d2a", fg: "#fff4e8", accent: "#ffab73" } : theme === "aurora" ? { bg: "#102a43", fg: "#f4fbff", accent: "#8af0c4" } : theme === "mono" ? { bg: "#202020", fg: "#f5f5f5", accent: "#d6d6d6" } : { bg: "#14202b", fg: "#f5f8fb", accent: "#7fd1c8" };
}

async function renderSlide(slide: PptSlide, theme: Theme): Promise<Uint8Array> {
  const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext("2d"); if (!context) throw new Error("无法创建幻灯片画布");
  const colors = themeColors(theme); context.fillStyle = colors.bg; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = colors.accent; context.fillRect(0, 0, 18, canvas.height);
  context.fillStyle = colors.accent; context.beginPath(); context.arc(1080, 80, 180, 0, Math.PI * 2); context.globalAlpha = 0.14; context.fill(); context.globalAlpha = 1;
  context.fillStyle = colors.fg; context.font = "700 54px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif"; context.fillText(slide.title.slice(0, 28), 96, 150);
  context.font = "400 30px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  const lines: string[] = []; let line = ""; for (const char of slide.body.replace(/\n/g, "  ")) { if (line.length >= 28) { lines.push(line); line = ""; } line += char; } if (line) lines.push(line);
  lines.slice(0, 12).forEach((value, index) => context.fillText(value, 100, 245 + index * 42));
  context.fillStyle = colors.accent; context.font = "500 20px -apple-system, BlinkMacSystemFont, sans-serif"; context.fillText(`${String(slide.id.replace("slide-", "")).padStart(2, "0")}  /  VOXLOCAL`, 100, 660);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("幻灯片导出失败")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function PptVideoView({ audioJobs, onNotice }: { audioJobs: SynthesisJob[]; onNotice: (message: string) => void }) {
  const [text, setText] = useState("产品发布会\n让复杂信息变得简单\n\n核心价值\n用清晰的结构、自然的旁白和稳定的节奏，快速制作一段可分享的讲解视频。\n\n行动建议\n先从一个主题开始，控制每页信息量，让观众跟得上你的表达。\n");
  const [theme, setTheme] = useState<Theme>("ink"); const [smart, setSmart] = useState(true); const [audioMode, setAudioMode] = useState<VideoAudioMode>("with-audio"); const [selectedJobId, setSelectedJobId] = useState(""); const [jobs, setJobs] = useState<VideoJob[]>([]); const [currentJob, setCurrentJob] = useState<VideoJob | null>(null); const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const slides = useMemo(() => splitSlides(text, smart), [text, smart]); const completedAudio = audioJobs.filter((job) => job.status === "completed" && job.outputPath);
  useEffect(() => { void listVideoJobs().then((items) => setJobs(items.filter((job) => job.engine === "ppt"))); }, []);
  async function enhanceWithGemma() {
    try {
      onNotice("正在尝试调用本机 Gemma…");
      const response = await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "gemma3:4b", stream: false, prompt: `把下面文案整理成 4-8 页中文 PPT 口播稿。每页用“# 标题”开头，页面之间用空行分隔；每页正文 2-4 句，补充必要的背景、要点和行动建议，不要编造具体数据。只输出幻灯片内容。\n\n${text}` }) });
      if (!response.ok) throw new Error("Gemma 服务不可用");
      const data = await response.json() as { response?: string }; if (!data.response?.trim()) throw new Error("Gemma 没有返回内容");
      setText(data.response.trim()); setSmart(false); onNotice("已用本机 Gemma 补充并整理文案");
    } catch { onNotice("未检测到本机 Gemma（Ollama）。当前先保留本地结构化预览；安装并启动 Ollama 后可启用智能补充。"); }
  }
  async function generate() {
    const audio = completedAudio.find((job) => job.id === selectedJobId); if (!audio?.outputPath) { onNotice("请先在阅读页生成完整音频，再选择这条历史音频"); return; }
    try { onNotice("正在生成幻灯片画面…"); const paths = await persistPptSlides(await Promise.all(slides.map(async (slide) => ({ id: slide.id, bytes: await renderSlide(slide, theme) })))); let job = await startPptVideo({ title: "PPT口播视频", slidePaths: paths, audioPath: audio.outputPath, synthesisJobId: audio.id, audioMode }); setCurrentJob(job); setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]); while (job.status === "queued" || job.status === "running") { await new Promise((resolve) => window.setTimeout(resolve, 600)); job = await getVideoJob(job.id); setCurrentJob(job); setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]); } if (job.status === "failed") throw new Error(job.error || "PPT视频生成失败"); onNotice("PPT口播视频已生成"); } catch (error) { onNotice(error instanceof Error ? error.message : "PPT视频生成失败"); }
  }
  async function play(job: VideoJob) { if (!job.outputPath) return; if (playingUrl) URL.revokeObjectURL(playingUrl); setPlayingUrl(URL.createObjectURL(await readVideo(job.outputPath))); }
  function exportSlide(slide: PptSlide) { void renderSlide(slide, theme).then((bytes) => { const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" })); const link = document.createElement("a"); link.href = url; link.download = `${slide.id}.png`; link.click(); URL.revokeObjectURL(url); }); }
  return <section className="page video-page"><header className="page-header"><div><p className="eyebrow">PPT 口播模式</p><h1>文案变成一段讲解视频</h1><p className="subtitle">自动分页、生成幻灯片画面，并复用本地语音历史合成 MP4；也可单独导出每页 PNG。</p></div></header><div className="ppt-workspace"><div className="video-setup-card"><div className="video-step-title"><span>1</span><div><h2>输入文案</h2><p>用空行分隔页面，也支持 Markdown 标题</p></div></div><textarea className="ppt-script" value={text} onChange={(event) => setText(event.target.value)} /><div className="video-option-grid"><label><span>视觉主题</span><select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="ink">深海青绿</option><option value="paper">暖白纸张</option><option value="sunset">暮色橙光</option></select></label><label><span>导出内容</span><select value={audioMode} onChange={(event) => setAudioMode(event.target.value as VideoAudioMode)}><option value="with-audio">视频 + 语音</option><option value="video-only">纯视频（无声音）</option></select></label></div><div className="video-step-title"><span>2</span><div><h2>选择旁白</h2><p>使用阅读页已生成的完整音频</p></div></div><select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}><option value="">选择已完成音频</option>{completedAudio.map((job) => <option key={job.id} value={job.id}>{job.voiceId} · {job.createdAt}</option>)}</select><button className="generate-button video-generate" disabled={!slides.length || !selectedJobId || currentJob?.status === "running" || currentJob?.status === "queued"} onClick={() => void generate()}><WandSparkles size={17}/>{currentJob?.status === "running" || currentJob?.status === "queued" ? currentJob.stage : "生成 PPT 口播视频"}</button>{currentJob && <div className={`job-progress ${currentJob.status}`}><div><span>{currentJob.stage}</span><strong>{currentJob.progress}%</strong></div><div className="progress-track"><span style={{ width: `${currentJob.progress}%` }}/></div>{currentJob.error && <p>{currentJob.error}</p>}</div>}</div><div className="video-preview-card"><div className="section-title"><h2>幻灯片预览</h2><span>{slides.length} 页</span></div><div className="ppt-slide-grid">{slides.map((slide) => <article key={slide.id} className={`ppt-slide ppt-${theme}`}><div><small>{slide.id.replace("slide-", "第 ")} 页</small><h3>{slide.title}</h3><p>{slide.body}</p></div><button onClick={() => exportSlide(slide)} title="导出 PNG"><Download size={15}/></button></article>)}</div>{playingUrl && <div className="ppt-output"><h3><Film size={17}/>生成视频</h3><video controls autoPlay src={playingUrl}/></div>}<div className="video-history-heading"><h3>PPT 视频历史</h3><span>{jobs.length} 个任务</span></div><div className="video-history">{jobs.length ? jobs.map((job) => <div className="video-history-row" key={job.id}><Image size={18}/><span><strong>{job.title}</strong><small>{job.status === "completed" ? "已完成" : job.status === "failed" ? "失败" : job.stage}</small></span>{job.status === "completed" && <button type="button" onClick={() => void play(job)}><Play size={14}/>播放</button>}</div>) : <p className="video-history-empty">还没有 PPT 视频</p>}</div></div></div></section>;
}
