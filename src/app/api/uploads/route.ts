import { NextRequest, NextResponse } from "next/server";
import {
  StorageFolder,
  uploadFileToS3,
} from "@/lib/s3/storage.service";


const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const VALID_FOLDERS: StorageFolder[] = ["spaces", "avatars", "documents"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const accessToken = request.cookies.get("access_token")?.value;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No autorizado. Inicia sesión para subir archivos." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const folderInput = (formData.get("folder") as string | null) ?? "spaces";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se envió ningún archivo válido en el campo 'file'." },
        { status: 400 }
      );
    }

    const extension = ALLOWED_MIME_TYPES[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Formato no permitido. Usa JPG, PNG, WEBP o PDF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "El archivo supera el límite máximo de 5 MB." },
        { status: 400 }
      );
    }

    const folder: StorageFolder = VALID_FOLDERS.includes(
      folderInput as StorageFolder
    )
      ? (folderInput as StorageFolder)
      : "spaces";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadFileToS3({
      buffer,
      contentType: file.type,
      extension,
      folder,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error interno al subir archivo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
