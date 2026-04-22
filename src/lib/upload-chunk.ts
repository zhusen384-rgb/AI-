/**
 * 分块上传文件到后端
 *
 * @param blob 要上传的文件
 * @param interviewId 面试 ID
 * @param fileName 文件名
 * @param contentType 文件类型
 * @param onProgress 进度回调
 * @param onChunkProgress 分块进度回调
 */
export async function uploadFileInChunks(
  blob: Blob,
  interviewId: string,
  fileName: string,
  contentType: string,
  onProgress: (progress: number) => void,
  onChunkProgress: (chunkIndex: number, totalChunks: number) => void
): Promise<{ fileKey: string; fileSize: number }> {
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB per chunk
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

  console.log(`[分块上传] 开始分块上传:`, {
    fileName,
    fileSize: blob.size,
    chunkSize: CHUNK_SIZE,
    totalChunks,
  });

  // 依次上传每个分块
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const chunk = blob.slice(start, end);

    console.log(`[分块上传] 上传分块 ${chunkIndex + 1}/${totalChunks}, 大小: ${chunk.size} bytes`);
    onChunkProgress(chunkIndex + 1, totalChunks);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('interviewId', interviewId);

    const response = await fetch('/api/full-ai-interview/upload-chunk', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`上传分块 ${chunkIndex + 1} 失败: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || `上传分块 ${chunkIndex + 1} 失败`);
    }

    // 更新总进度
    const overallProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    onProgress(overallProgress);
  }

  // 所有分块上传完成，通知后端合并并上传到 S3
  console.log(`[分块上传] 所有分块上传完成，开始合并...`);

  const mergeResponse = await fetch('/api/full-ai-interview/merge-chunks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interviewId,
      totalChunks,
      fileName,
      contentType,
    }),
  });

  if (!mergeResponse.ok) {
    const errorText = await mergeResponse.text();
    throw new Error(`合并分块失败: ${mergeResponse.status} ${errorText}`);
  }

  const mergeResult = await mergeResponse.json();
  if (!mergeResult.success) {
    throw new Error(mergeResult.error || "合并分块失败");
  }

  console.log(`[分块上传] 合并并上传成功:`, {
    fileKey: mergeResult.data.fileKey,
    fileName: mergeResult.data.fileName,
    fileSize: mergeResult.data.fileSize,
  });

  return mergeResult.data;
}
