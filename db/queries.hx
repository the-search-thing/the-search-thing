// create file node
QUERY CreateFile (file_id: String, content_hash: String, content: String, path:String) =>
    file <- AddN<File>({
    file_id: file_id,
    content_hash: content_hash,
    content: content,
    path: path,
    })
    RETURN file

// create image node
QUERY CreateImage (image_id: String, content_hash: String, content: String, path:String) =>
    image <- AddN<Image>({
        image_id: image_id,
        content_hash: content_hash,
        content: content,
        path: path,
    })
    RETURN image

// create a video
QUERY CreateVideo (video_id: String, content_hash: String, no_of_chunks: U8, path:String) =>
    video <- AddN<Video>({
        video_id: video_id,
        content_hash: content_hash,
        no_of_chunks: no_of_chunks,
        path: path
    })
    RETURN video

// create a chunk
QUERY CreateChunk (video_id: String, chunk_id:String, start_time:I16, end_time: I16, transcript:String) =>
    chunk <- AddN<Chunk>({
        video_id: video_id,
        chunk_id: chunk_id,
        start_time: start_time,
        end_time: end_time,
        transcript: transcript
    })
    RETURN chunk

// create transcript node
QUERY CreateTranscript (chunk_id: String, content: String) =>
    transcript <- AddN<Transcript>({
        chunk_id: chunk_id,
        content: content
    })
    RETURN transcript

// create frame summary node
QUERY CreateFrameSummary(chunk_id: String, content: String) =>
    frame_summary <- AddN<FrameSummary>({
        chunk_id: chunk_id,
        content: content
    })
    RETURN frame_summary

// a video has a chunk
// need help for traversal in CreateVideoToChunkRelationship
QUERY CreateVideoToChunkRelationship (video_id: String, chunk_id: String) =>
    video <- N<Video>({video_id: video_id})
    chunk <- N<Chunk>({chunk_id: chunk_id})
    hasChunk <- AddE<Has>::From(video)::To(chunk)
    RETURN hasChunk

// create chunk to transcript
QUERY CreateChunkToTranscriptRelationship (chunk_id: String, transcript_id: ID) =>
    chunk <- N<Chunk>({chunk_id: chunk_id})
    transcript <- N<Transcript>(transcript_id)
    hasTranscript <- AddE<Has>::From(chunk)::To(transcript)
    RETURN hasTranscript

// create chunk to frame summary
QUERY CreateChunkToFrameSummaryRelationship (chunk_id: String,frame_summary_id: ID) =>
    chunk <- N<Chunk>({chunk_id: chunk_id})
    frame_summary <- N<FrameSummary>(frame_summary_id)
    HasFrameSummary <- AddE<HasFrameSummaryEmbeddings>::From(chunk)::To(frame_summary)
    RETURN HasFrameSummary



// create file embeddings vector and connect to file node
QUERY CreateFileEmbeddings (file_id: String, content: String, path:String) =>
    file <- N<File>({file_id: file_id})
    file_embeddings <- AddV<FileEmbeddings>(Embed(content), {file_id: file_id, content: content, path: path})
    edge <- AddE<HasFileEmbeddings>::From(file)::To(file_embeddings)
    RETURN "Success"


// create image embeddings vector and connect to image node
QUERY CreateImageEmbeddings (image_id: String, content: String, path: String) =>
    image <- N<Image>({image_id: image_id})
    image_embeddings <- AddV<ImageEmbeddings>(Embed(content), {image_id: image_id, content: content, path: path})
    edge <- AddE<HasImageEmbeddings>::From(image)::To(image_embeddings)
    RETURN "Success"


// create a vector and connect to chunk node for transcript embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY CreateTranscriptEmbeddings (chunk_id: String, content: String) =>
    chunk <- N<Chunk>({chunk_id: chunk_id})
    transcript_embeddings <- AddV<TranscriptEmbeddings>(Embed(content), {chunk_id: chunk_id, content: content})
    edge <- AddE<HasTranscriptEmbeddings>::From(chunk)::To(transcript_embeddings)
    RETURN "Success"

// create a vector and connect to chunk node for frame summary embeddings
// for Embed to work we need OPENAI_API_KEY set in our env
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY CreateFrameSummaryEmbeddings (chunk_id:String, content: String) =>
    chunk <- N<Chunk>({chunk_id: chunk_id})
    frame_summary_embeddings <- AddV<FrameSummaryEmbeddings>(Embed(content),  {chunk_id: chunk_id, content: content })
    edge <- AddE<HasFrameSummaryEmbeddings>::From(chunk)::To(frame_summary_embeddings)
    RETURN "Success"


// search file embeddings separate
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchFileEmbeddings(search_text: String) =>
    file_embeddings <- SearchV<FileEmbeddings>(Embed(search_text), 100)
    chunks <- file_embeddings::In<HasFileEmbeddings>
    RETURN chunks

// search image embeddings
QUERY SearchImageEmbeddings(search_text: String) =>
    image_embeddings <- SearchV<ImageEmbeddings>(Embed(search_text), 100)
    images <- image_embeddings::In<HasImageEmbeddings>
    RETURN images


// search transcript & frame embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchTranscriptAndFrameEmbeddings(search_text: String) =>
    transcript <- SearchV<TranscriptEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    frame <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    transcript_videos <- transcript::In<HasTranscriptEmbeddings>::In<Has>
    frame_videos <- frame::In<HasFrameSummaryEmbeddings>::In<Has>
    RETURN transcript_videos, frame_videos


// search file keywords
QUERY SearchFileKeyword(keywords: String, limit: I64) =>
    documents <- SearchBM25<File>(keywords, limit)
    RETURN documents

// search transcript keywords
QUERY SearchTranscriptKeyword(keywords: String, limit: I64) =>
    documents <- SearchBM25<Transcript>(keywords, limit)
    RETURN documents

// search frame summary keywords
QUERY SearchFrameSummaryKeyword(keywords: String, limit: I64) =>
    documents <- SearchBM25<FrameSummary>(keywords, limit)
    RETURN documents


// hybrid search frame summary keywords + embeddings
// this doesnt work as of now
QUERY SearchFrameSummaryCombined(search_string: String, keywords: String) =>
    vec_results <- SearchV<FrameSummaryEmbeddings>(Embed(search_string), 100)
    bm25_results <- SearchBM25<FrameSummary>(keywords, 100)
    // Use RerankRRF to combine both result sets
    combined_results <- vec_results::RerankRRF(k: 60)::RANGE(0, 10)
    RETURN combined_results


// updating nodes
// https://docs.helix-db.com/documentation/hql/updating


// testing combiend file and vidoe Search
QUERY CombinedFileAndVideo(search_text: String) =>
    // File search
    file_embeddings <- SearchV<FileEmbeddings>(Embed(search_text), 100)

    // Video searches
    transcripts <- SearchV<TranscriptEmbeddings>(Embed(search_text), 100)
    frames <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 100)

    // Combine all results with RRF
    combined <- file_embeddings
        ::RerankRRF(k: 60)
    combined_with_transcripts <- transcripts
        ::RerankRRF(k: 60)
    combined_with_frames <- frames
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)

    // Get related items
    chunks <- file_embeddings::In<HasFileEmbeddings>
    transcript_videos <- transcripts::In<HasTranscriptEmbeddings>::In<Has>
    frame_videos <- frames::In<HasFrameSummaryEmbeddings>::In<Has>

    RETURN combined_with_frames, chunks, transcript_videos, frame_videos


// testing combiend file and vidoe Search
QUERY CombinedFileVidAndImage(search_text: String) =>
    // File search
    file_embeddings <- SearchV<FileEmbeddings>(Embed(search_text), 100)

    // Video searches
    transcripts <- SearchV<TranscriptEmbeddings>(Embed(search_text), 100)
    frames <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 100)

    // image search
    image_embeddings <- SearchV<ImageEmbeddings>(Embed(search_text), 100)

    // Combine all results with RRF
    combined <- file_embeddings
        ::RerankRRF(k: 60)
    combined_with_transcripts <- transcripts
        ::RerankRRF(k: 60)
    combined_with_frames <- frames
        ::RerankRRF(k: 60)
    combined_with_images <- image_embeddings
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)

    // Get related items
    chunks <- file_embeddings::In<HasFileEmbeddings>
    transcript_videos <- transcripts::In<HasTranscriptEmbeddings>::In<Has>
    frame_videos <- frames::In<HasFrameSummaryEmbeddings>::In<Has>
    images <- image_embeddings::In<HasImageEmbeddings>

    RETURN combined_with_frames, chunks, transcript_videos, frame_videos, images



QUERY GetAllImagemebeddings()=>
    images <- N<Image>
    RETURN images


QUERY TestFileSearch(search_text: String) =>
    results <- SearchV<FileEmbeddings>(Embed(search_text), 10)
    RETURN results

QUERY TestTranscriptSearch(search_text: String) =>
    results <- SearchV<TranscriptEmbeddings>(Embed(search_text), 10)
    RETURN results

QUERY TestFrameSearch(search_text: String) =>
    results <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 10)
    RETURN results


// last resort is to have a single vector type for all fields

// combined search
QUERY CombinedSearch(search_text: String) =>
    transcripts <- SearchV<TranscriptEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    frames <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    transcript_videos <- transcripts::In<HasTranscriptEmbeddings>::In<Has>
    frame_videos <- frames::In<HasFrameSummaryEmbeddings>::In<Has>

    RETURN transcripts, frames, transcript_videos, frame_videos

// get all videos
QUERY GetAllVideos() =>
    videos <- N<Video>
    RETURN videos

QUERY GetAllFiles() =>
    files <- N<File>
    RETURN files

// get all chunks
QUERY GetAllChunks()=>
    chunks <- N<Chunk>
    RETURN chunks

// get chunks by id
QUERY GetChunksByChunkID(chunk_id:String)=>
    chunk <- N<Chunk>({chunk_id: chunk_id})
    RETURN chunk

// delete all videos
QUERY DeleteAllVideos() =>
    videos <- N<Video>
    DROP N<Video>
    RETURN "Deleted all video nodes"

QUERY DeleteAllChunks() =>
    chunks <- N<Chunk>
    DROP N<Chunk>
    RETURN "deleted all chunk nodes"

QUERY DeleteOutgoingNeighbours() =>
    videos <- N<Video>
    DROP N<Video>::Out<Has>
    RETURN "Removed outgoing neighbours"

QUERY DeleteOutgoingNeighboursChunkT() =>
    chunk <- N<Chunk>
    DROP N<Chunk>::Out<HasTranscriptEmbeddings>
    RETURN "removed has trasncript emebddings neighbours"

QUERY DeleteOutgoingNeighboursChunkF() =>
    chunk <- N<Chunk>
    DROP N<Chunk>::Out<HasFrameSummaryEmbeddings>
    RETURN "removed has frame summary emebddings neighbours"



QUERY GetFileByHash(content_hash: String)=>
    file <- N<File>({content_hash: content_hash})
    RETURN file

QUERY GetImageByHash(content_hash: String)=>
    image <- N<Image>({content_hash: content_hash})
    RETURN image

QUERY GetVideoByHash(content_hash: String)=>
    video <- N<Video>({content_hash: content_hash})
    RETURN video
