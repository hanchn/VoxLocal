export type ImportedDocument = {
  name: string;
  type: "text" | "markdown" | "pdf" | "word" | "epub";
  text: string;
};

function cleanDocumentText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  return pages.join("\n\n");
}

async function readEpub(file: File) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new Error("这个 EPUB 缺少内容索引");
  const rootPath = new DOMParser().parseFromString(container, "application/xml").querySelector("rootfile")?.getAttribute("full-path");
  if (!rootPath) throw new Error("无法读取 EPUB 书目");
  const packageXml = await zip.file(rootPath)?.async("text");
  if (!packageXml) throw new Error("无法读取 EPUB 书目");
  const packageDoc = new DOMParser().parseFromString(packageXml, "application/xml");
  const manifest = new Map(Array.from(packageDoc.querySelectorAll("manifest item")).map((node) => [node.getAttribute("id"), node.getAttribute("href")]));
  const base = rootPath.includes("/") ? rootPath.slice(0, rootPath.lastIndexOf("/") + 1) : "";
  const sections: string[] = [];
  for (const item of Array.from(packageDoc.querySelectorAll("spine itemref"))) {
    const href = manifest.get(item.getAttribute("idref"));
    if (!href) continue;
    const html = await zip.file(`${base}${decodeURIComponent(href.split("#")[0])}`)?.async("text");
    if (!html) continue;
    const body = new DOMParser().parseFromString(html, "text/html").body;
    sections.push(body.textContent ?? "");
  }
  return sections.join("\n\n");
}

export async function importDocument(file: File): Promise<ImportedDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  let type: ImportedDocument["type"];
  if (extension === "txt") {
    type = "text";
    text = await file.text();
  } else if (extension === "md" || extension === "markdown") {
    type = "markdown";
    text = (await file.text()).replace(/```[\s\S]*?```/g, "代码块。").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "");
  } else if (extension === "pdf") {
    type = "pdf";
    text = await readPdf(file);
  } else if (extension === "docx") {
    type = "word";
    const { default: mammoth } = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (extension === "epub") {
    type = "epub";
    text = await readEpub(file);
  } else {
    throw new Error("支持 TXT、Markdown、PDF、Word (.docx) 和 EPUB");
  }
  const cleaned = cleanDocumentText(text);
  if (!cleaned) throw new Error("文档中没有可朗读的文字");
  return { name: file.name.replace(/\.[^.]+$/, ""), type, text: cleaned };
}
