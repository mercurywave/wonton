import { ImageAttachment } from "../types/chat";
import { filesystem } from "./electronFs";
import { getProjectDataDir, getRootDataDir } from "./platformUtils";

const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 20 * 1024 * 1024;

async function attachmentPath(attachment: ImageAttachment): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(attachment.id) || !supportedTypes.has(attachment.mimeType) ||
      (attachment.projectId !== undefined && !/^[a-z0-9_-]+$/i.test(attachment.projectId))) {
    throw new Error("Invalid image attachment reference");
  }
  const dataDir = attachment.projectId === undefined
    ? await getRootDataDir()
    : await getProjectDataDir(attachment.projectId);
  return filesystem.joinPath(dataDir, "attachments", attachment.id);
}

export async function saveImageAttachment(file: File, projectId: string): Promise<ImageAttachment> {
  if (!supportedTypes.has(file.type)) throw new Error("Unsupported image format. Use PNG, JPEG, WebP, or GIF.");
  if (!file.size || file.size > maxImageBytes) throw new Error("Image must be smaller than 20 MB.");
  const attachment = { id: crypto.randomUUID(), name: file.name || "Pasted image", mimeType: file.type, projectId };
  const filePath = await attachmentPath(attachment);
  const dir = await filesystem.joinPath(await getProjectDataDir(projectId), "attachments");
  await filesystem.createDirectory(dir);
  await filesystem.writeBinaryFile(filePath, new Uint8Array(await file.arrayBuffer()));
  return attachment;
}

export async function readImageAttachment(attachment: ImageAttachment): Promise<Blob> {
  try {
    const bytes = await filesystem.readBinaryFile(await attachmentPath(attachment));
    return new Blob([new Uint8Array(bytes).buffer], { type: attachment.mimeType });
  } catch {
    throw new Error(`Could not read image attachment: ${attachment.name}`);
  }
}

export async function imageAttachmentDataUrl(attachment: ImageAttachment): Promise<string> {
  const blob = await readImageAttachment(attachment);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not encode image attachment: ${attachment.name}`));
    reader.readAsDataURL(blob);
  });
}