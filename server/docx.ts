import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { embeddedDocumentSchema, type EmbeddedDocument } from "../shared/document";
import { ModelError } from "../shared/model";

const NAMESPACE = "urn:sopimuskartta:document:1";
const MAX_ENTRIES = 600;
const MAX_UNCOMPRESSED = 100 * 1024 * 1024;

export type ReadDocx = {
  packageBase64: string;
  fileName: string;
  textFingerprint: string;
  textChanged: boolean;
  embedded: EmbeddedDocument | null;
};

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function xmlDecode(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function fingerprintDocumentXml(xml: string) {
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((paragraph) =>
    [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((text) => xmlDecode(text[1]))
      .join(""),
  );
  return createHash("sha256").update(paragraphs.join("\n"), "utf8").digest("hex");
}

function safeFileName(value: string) {
  const name = value.replaceAll("\\", "/").split("/").at(-1)?.trim() || "sopimus.docx";
  const withoutControls = name.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 180);
  return withoutControls.toLowerCase().endsWith(".docx") ? withoutControls : `${withoutControls}.docx`;
}

async function loadZip(buffer: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch {
    throw new ModelError("Tiedosto ei ole kelvollinen DOCX-dokumentti.");
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new ModelError("DOCX sisältää liian monta osaa.");
  let total = 0;
  for (const entry of entries) {
    const unsafeName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName;
    if (unsafeName && unsafeName !== entry.name)
      throw new ModelError("DOCX sisältää turvattoman tiedostopolun.");
    if (entry.name.startsWith("/") || entry.name.includes("\\") || entry.name.split("/").includes(".."))
      throw new ModelError("DOCX sisältää turvattoman tiedostopolun.");
    total += Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    if (total > MAX_UNCOMPRESSED) throw new ModelError("DOCX on purettuna liian suuri.");
  }
  if (entries.some((entry) => /(^|\/)vbaProject\.bin$/i.test(entry.name)))
    throw new ModelError("Makroja sisältäviä Word-tiedostoja ei tueta.");
  const types = await zip.file("[Content_Types].xml")?.async("string");
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!types || !documentXml || !types.includes("wordprocessingml.document.main+xml"))
    throw new ModelError("Tiedosto ei ole tavallinen DOCX-dokumentti.");
  if (/macroEnabled/i.test(types)) throw new ModelError("Makroja sisältäviä Word-tiedostoja ei tueta.");
  return { zip, documentXml };
}

function readEmbedded(xml: string) {
  if (!new RegExp(`xmlns(?::[\\w.-]+)?\\s*=\\s*["']${NAMESPACE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(xml))
    throw new ModelError("DOCX:n Sopimuskartta-dataosa on tuntematon.");
  const match = xml.match(/<(?:[\w.-]+:)?data\b[^>]*\bencoding\s*=\s*["']base64["'][^>]*>([A-Za-z0-9+/=\s]+)<\/(?:[\w.-]+:)?data>/);
  if (!match) throw new ModelError("DOCX:n Sopimuskartta-dataosa on vioittunut.");
  try {
    return embeddedDocumentSchema.parse(JSON.parse(Buffer.from(match[1].replace(/\s/g, ""), "base64").toString("utf8")));
  } catch {
    throw new ModelError("DOCX:n Sopimuskartta-dataa ei voitu lukea.");
  }
}

async function findEmbeddedParts(zip: JSZip) {
  const matches: Array<{ path: string; xml: string }> = [];
  for (const path of Object.keys(zip.files).filter((name) => /^customXml\/item\d+\.xml$/i.test(name))) {
    const xml = await zip.file(path)!.async("string");
    if (new RegExp(`xmlns(?::[\\w.-]+)?\\s*=\\s*["']${NAMESPACE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(xml))
      matches.push({ path, xml });
  }
  if (matches.length > 1) throw new ModelError("DOCX sisältää useita Sopimuskartta-dataosia.");
  return matches[0] ?? null;
}

export async function readDocx(buffer: Buffer, originalName: string): Promise<ReadDocx> {
  if (!buffer.length) throw new ModelError("DOCX-tiedosto on tyhjä.");
  const { zip, documentXml } = await loadZip(buffer);
  const textFingerprint = fingerprintDocumentXml(documentXml);
  const dataPart = await findEmbeddedParts(zip);
  const embedded = dataPart ? readEmbedded(dataPart.xml) : null;
  return {
    packageBase64: buffer.toString("base64"),
    fileName: safeFileName(originalName),
    textFingerprint,
    textChanged: Boolean(embedded && embedded.documentTextFingerprint !== textFingerprint),
    embedded,
  };
}

function minimalPackage(title: string, draft: string | null) {
  const zip = new JSZip();
  const paragraphs = (draft?.trim() || title).split(/\r?\n/).map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
  ).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  return zip;
}

function appendBeforeClose(xml: string, close: string, content: string) {
  if (xml.includes(content)) return xml;
  if (!xml.includes(close)) throw new ModelError("DOCX-paketin relaatiorakenne on vioittunut.");
  return xml.replace(close, `${content}${close}`);
}

export async function writeDocx(base64: string | null, payload: Omit<EmbeddedDocument, "documentTextFingerprint">) {
  let zip: JSZip;
  let documentXml: string;
  if (base64) {
    const loaded = await loadZip(Buffer.from(base64, "base64"));
    zip = loaded.zip;
    documentXml = loaded.documentXml;
  } else {
    zip = minimalPackage(payload.model.title, payload.draft?.text ?? null);
    documentXml = (await zip.file("word/document.xml")!.async("string"));
  }
  const existingPart = await findEmbeddedParts(zip);
  const usedNumbers = Object.keys(zip.files)
    .map((name) => name.match(/^customXml\/item(\d+)\.xml$/i)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const number = existingPart
    ? Number(existingPart.path.match(/item(\d+)\.xml$/i)![1])
    : Math.max(0, ...usedNumbers) + 1;
  const dataPath = `customXml/item${number}.xml`;
  const propsPath = `customXml/itemProps${number}.xml`;
  const dataRelPath = `customXml/_rels/item${number}.xml.rels`;
  const complete: EmbeddedDocument = { ...payload, documentTextFingerprint: fingerprintDocumentXml(documentXml) };
  const encoded = Buffer.from(JSON.stringify(complete), "utf8").toString("base64");
  zip.file(dataPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><contract-map xmlns="${NAMESPACE}" version="1"><data encoding="base64">${encoded}</data></contract-map>`);
  zip.file(propsPath, `<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="{${payload.documentId.toUpperCase()}}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${NAMESPACE}"/></ds:schemaRefs></ds:datastoreItem>`);
  zip.file(dataRelPath, `<?xml version="1.0" encoding="UTF-8" standalone="no"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${number}.xml"/></Relationships>`);

  const relPath = "word/_rels/document.xml.rels";
  let rels = await zip.file(relPath)?.async("string");
  if (!rels) rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  if (!rels.includes(`../${dataPath}`)) {
    const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
    const id = Math.max(0, ...ids) + 1;
    rels = appendBeforeClose(rels, "</Relationships>", `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${dataPath}"/>`);
  }
  zip.file(relPath, rels);

  const typesPath = "[Content_Types].xml";
  let types = await zip.file(typesPath)!.async("string");
  if (!/Extension="xml"/i.test(types))
    types = appendBeforeClose(types, "</Types>", `<Default Extension="xml" ContentType="application/xml"/>`);
  if (!types.includes(`/${propsPath}`))
    types = appendBeforeClose(types, "</Types>", `<Override PartName="/${propsPath}" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/>`);
  zip.file(typesPath, types);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function newDocumentId() {
  return randomUUID();
}
