import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileAudio, Film, FolderOpen, ImagePlus, Play, ShieldAlert, Trash2, Upload, WandSparkles } from "lucide-react";
import type { SynthesisJob } from "../lib/synthesis";
import { getPortrait, getVideoEngineStatus, getVideoJob, importVideoAudio, listVideoJobs, readPortrait, readVideo, removePortrait, revealVideo, savePortrait, startVideo, type ImportedAudioAsset, type PortraitAsset, type VideoEngine, type VideoEngineStatus, type VideoJob } from "../lib/video";

interface Props {
  audioJobs: SynthesisJob[];
  onNotice: (message: string) => void;
}

export function LipSyncView({ audioJobs, onNotice }: Props) {
  const [portrait, setPortrait] = useState<PortraitAsset | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<VideoEngineStatus | null>(null);
  const [engine, setEngine] = useState<VideoEngine>("still");
  const [audioSource, setAudioSource] = useState<"history" | "import">("history");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [importedAudio, setImportedAudio] = useState<ImportedAudioAsset | null>(null);
  const [currentJob, setCurrentJob] = useState<VideoJob | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const portraitInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const completedAudio = useMemo(() => audioJobs.filter((job) => job.status === "completed" && job.outputPath), [audioJobs]);
  const selectedAudio = completedAudio.find((job) => job.id === selectedJobId);

  async function load() {
    try {
      const [nextPortrait, status, nextJobs] = await Promise.all([getPortrait(), getVideoEngineStatus(), listVideoJobs()]);
      setPortrait(nextPortrait); setEngineStatus(status); setJobs(nextJobs);
      if (!selectedJobId && completedAudio[0]) setSelectedJobId(completedAudio[0].id);
      if (nextPortrait) setPortraitUrl(URL.createObjectURL(await readPortrait(nextPortrait.path)));
    } catch (error) { onNotice(error instanceof Error ? error.message : "无法载入视频工作台"); }
  }

  useEffect(() => { void load(); return () => { if (portraitUrl) URL.revokeObjectURL(portraitUrl); if (playingUrl) URL.revokeObjectURL(playingUrl); }; }, []);

  async function choosePortrait(file?: File) {
    if (!file) return;
    try {
      const saved = await savePortrait(file);
      if (portraitUrl) URL.revokeObjectURL(portraitUrl);
      setPortrait(saved); setPortraitUrl(URL.createObjectURL(await readPortrait(saved.path)));
      onNotice("人物照片已保存在本机");
    } catch (error) { onNotice(error instanceof Error ? error.message : "照片保存失败"); }
  }

  async function deletePortrait() {
    if (!window.confirm("确定删除当前人物照片吗？")) return;
    await removePortrait(); if (portraitUrl) URL.revokeObjectURL(portraitUrl); setPortrait(null); setPortraitUrl(null);
  }

  async function chooseAudio(file?: File) {
    if (!file) return;
    try { setImportedAudio(await importVideoAudio(file)); onNotice("音频已导入，仅保存在本机"); }
    catch (error) { onNotice(error instanceof Error ? error.message : "音频导入失败"); }
  }

  async function generate() {
    const audioPath = audioSource === "history" ? selectedAudio?.outputPath : importedAudio?.path;
    if (!portrait || !audioPath) return;
    try {
      let job = await startVideo({ title: `口型视频-${Date.now()}`, engine, portraitPath: portrait.path, audioPath, synthesisJobId: audioSource === "history" ? selectedAudio?.id : undefined });
      setCurrentJob(job); setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      while (job.status === "queued" || job.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        job = await getVideoJob(job.id); setCurrentJob(job); setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      }
      if (job.status === "failed") throw new Error(job.error || "视频生成失败");
      onNotice("视频已生成并保存在本机");
    } catch (error) { onNotice(error instanceof Error ? error.message : "视频生成失败"); }
  }

  async function play(job: VideoJob) {
    if (!job.outputPath) return;
    try { if (playingUrl) URL.revokeObjectURL(playingUrl); setPlayingUrl(URL.createObjectURL(await readVideo(job.outputPath))); }
    catch (error) { onNotice(error instanceof Error ? error.message : "视频无法打开"); }
  }

  const audioReady = audioSource === "history" ? !!selectedAudio?.outputPath : !!importedAudio?.path;
  const engineReady = engine === "still" ? !!engineStatus?.ffmpegReady : !!engineStatus?.wav2lipReady;
  return <section className="page video-page">
    <header className="page-header"><div><p className="eyebrow">本地视频工作台</p><h1>照片 + 声音，生成讲述视频</h1><p className="subtitle">维护一张人物照片，复用已经生成的完整音频。</p></div></header>
    <div className="video-workspace">
      <div className="video-setup-card">
        <div className="video-step-title"><span>1</span><div><h2>人物照片</h2><p>当前只维护一张，替换后下次继续使用</p></div></div>
        <button className={`portrait-picker ${portraitUrl ? "has-image" : ""}`} onClick={() => portraitInput.current?.click()}>{portraitUrl ? <img src={portraitUrl} alt="当前人物照片" /> : <><ImagePlus size={34}/><strong>选择正面人物照片</strong><small>JPG / PNG，建议脸部清晰、无遮挡</small></>}</button>
        {portrait && <div className="asset-row"><span><Check size={15}/> {portrait.fileName}</span><button onClick={deletePortrait}><Trash2 size={14}/>删除</button></div>}
        <input ref={portraitInput} className="hidden-file-input" type="file" accept="image/jpeg,image/png" onChange={(event) => { void choosePortrait(event.target.files?.[0]); event.currentTarget.value = ""; }}/>

        <div className="video-step-title"><span>2</span><div><h2>声音来源</h2><p>声音生成与视频合成互相独立</p></div></div>
        <div className="video-tabs"><button className={audioSource === "history" ? "active" : ""} onClick={() => setAudioSource("history")}>生成历史</button><button className={audioSource === "import" ? "active" : ""} onClick={() => setAudioSource("import")}>本地导入</button></div>
        {audioSource === "history" ? <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}><option value="">选择已完成音频</option>{completedAudio.map((job) => <option key={job.id} value={job.id}>{job.voiceId} · {job.createdAt}</option>)}</select> : <button className="audio-import" onClick={() => audioInput.current?.click()}><Upload size={17}/>{importedAudio?.fileName ?? "选择 WAV / MP3 / M4A / AAC"}</button>}
        <input ref={audioInput} className="hidden-file-input" type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/aac" onChange={(event) => { void chooseAudio(event.target.files?.[0]); event.currentTarget.value = ""; }}/>

        <div className="video-step-title"><span>3</span><div><h2>合成方式</h2><p>可替换引擎，不改变照片和音频</p></div></div>
        <div className="engine-options"><button className={engine === "still" ? "active" : ""} onClick={() => setEngine("still")}><Film/><span><strong>基础合成</strong><small>静态照片 + 完整声音</small></span><em>{engineStatus?.ffmpegReady ? "可用" : "缺少 ffmpeg"}</em></button><button className={engine === "wav2lip" ? "active" : ""} onClick={() => setEngine("wav2lip")}><WandSparkles/><span><strong>Wav2Lip 口型同步</strong><small>嘴型跟随声音，单照片模式</small></span><em>{engineStatus?.wav2lipReady ? "可用" : "待安装"}</em></button></div>
        {engine === "wav2lip" && <div className="license-note"><ShieldAlert size={17}/><span><strong>仅个人、研究与非商业用途</strong><small>官方 Wav2Lip 权重受 LRS2 数据许可限制；商业产品请切换为已获商业许可的引擎。</small></span></div>}
        <button className="generate-button video-generate" disabled={!portrait || !audioReady || !engineReady || currentJob?.status === "running" || currentJob?.status === "queued"} onClick={() => void generate()}><WandSparkles size={17}/>{!engineReady ? engineStatus?.message ?? "组件未就绪" : "生成视频"}</button>
        {currentJob && <div className={`job-progress ${currentJob.status}`}><div><span>{currentJob.stage}</span><strong>{currentJob.progress}%</strong></div><div className="progress-track"><span style={{ width: `${currentJob.progress}%` }}/></div>{currentJob.error && <p>{currentJob.error}</p>}</div>}
      </div>

      <div className="video-preview-card"><div className="section-title"><h2>视频预览</h2><span>{jobs.filter((job) => job.status === "completed").length} 个成品</span></div>{playingUrl ? <video key={playingUrl} controls autoPlay src={playingUrl}/> : <div className="video-empty"><Film size={42}/><strong>完成后在这里播放</strong><p>视频文件不会上传到网络</p></div>}<div className="video-history">{jobs.filter((job) => job.status === "completed" && job.outputPath).map((job) => <div className="video-history-row" key={job.id}><FileAudio size={18}/><span><strong>{job.title}</strong><small>{job.engine === "wav2lip" ? "Wav2Lip 口型同步" : "基础照片视频"}</small></span><button onClick={() => void play(job)}><Play size={14}/>播放</button><button onClick={() => void revealVideo(job.outputPath!)}><FolderOpen size={14}/>Finder</button></div>)}</div></div>
    </div>
  </section>;
}
