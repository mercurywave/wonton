export interface TruncationResult {
  content: string;
  wasTruncated: boolean;
  originalLines: number;
  returnedLines: number;
  originalBytes: number;
  returnedBytes: number;
  truncationReason?: string;
}

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB

function countBytes(str: string): number {
  return new TextEncoder().encode(str).byteLength;
}

export function truncateContentByLines(
  content: string,
  maxLines: number = DEFAULT_MAX_LINES
): TruncationResult {
  const lines = content.split("\n");
  const originalLines = lines.length;
  const originalBytes = countBytes(content);

  if (originalLines <= maxLines) {
    return {
      content,
      wasTruncated: false,
      originalLines,
      returnedLines: originalLines,
      originalBytes,
      returnedBytes: originalBytes,
    };
  }

  const truncatedLines = lines.slice(0, maxLines);
  const truncatedContent = truncatedLines.join("\n");

  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLines,
    returnedLines: maxLines,
    originalBytes,
    returnedBytes: countBytes(truncatedContent),
    truncationReason: `Truncated from ${originalLines} to ${maxLines} lines (file too long)`,
  };
}

export function truncateContentByBytes(
  content: string,
  maxBytes: number = DEFAULT_MAX_BYTES
): TruncationResult {
  const originalBytes = countBytes(content);
  const originalLines = content.split("\n").length;

  if (originalBytes <= maxBytes) {
    return {
      content,
      wasTruncated: false,
      originalLines,
      returnedLines: originalLines,
      originalBytes,
      returnedBytes: originalBytes,
    };
  }

  // Binary search for the maximum number of complete lines that fit within maxBytes
  let lo = 0;
  let hi = content.split("\n").length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidateLines = content.split("\n").slice(0, mid);
    const candidateContent = candidateLines.join("\n");

    if (countBytes(candidateContent) <= maxBytes) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const truncatedContent = content.split("\n").slice(0, best).join("\n");

  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLines,
    returnedLines: best,
    originalBytes,
    returnedBytes: countBytes(truncatedContent),
    truncationReason: `Truncated from ${originalLines} lines (${originalBytes} bytes) to ${best} lines (${countBytes(truncatedContent)} bytes) (file too large)`,
  };
}

export function truncateContent(
  content: string,
  maxLines: number = DEFAULT_MAX_LINES,
  maxBytes: number = DEFAULT_MAX_BYTES
): TruncationResult {
  const lines = content.split("\n");
  const originalLines = lines.length;
  const originalBytes = countBytes(content);

  // If content fits within both limits, return as-is
  if (originalLines <= maxLines && originalBytes <= maxBytes) {
    return {
      content,
      wasTruncated: false,
      originalLines,
      returnedLines: originalLines,
      originalBytes,
      returnedBytes: originalBytes,
    };
  }

  // First, try limiting by lines
  let truncatedContent = content;
  let result: TruncationResult;

  if (originalLines > maxLines) {
    const linesResult = truncateContentByLines(content, maxLines);
    truncatedContent = linesResult.content;

    // After line limit, check if still too large by bytes
    if (countBytes(truncatedContent) > maxBytes) {
      const bytesResult = truncateContentByBytes(truncatedContent, maxBytes);
      result = {
        content: bytesResult.content,
        wasTruncated: true,
        originalLines,
        returnedLines: bytesResult.returnedLines,
        originalBytes,
        returnedBytes: bytesResult.returnedBytes,
        truncationReason: `Truncated from ${originalLines} lines to ${bytesResult.returnedLines} lines (${bytesResult.returnedBytes} bytes) (exceeded both line and byte limits)`,
      };
    } else {
      result = {
        content: truncatedContent,
        wasTruncated: true,
        originalLines,
        returnedLines: linesResult.returnedLines,
        originalBytes,
        returnedBytes: linesResult.returnedBytes,
        truncationReason: `Truncated from ${originalLines} to ${linesResult.returnedLines} lines (file too long)`,
      };
    }
  } else {
    // Lines are fine, but bytes exceed limit - truncate by bytes
    const bytesResult = truncateContentByBytes(content, maxBytes);
    result = {
      content: bytesResult.content,
      wasTruncated: true,
      originalLines,
      returnedLines: bytesResult.returnedLines,
      originalBytes,
      returnedBytes: bytesResult.returnedBytes,
      truncationReason: `Truncated from ${originalLines} lines (${originalBytes} bytes) to ${bytesResult.returnedLines} lines (${bytesResult.returnedBytes} bytes) (file too large)`,
    };
  }

  return result;
}
