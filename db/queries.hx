// create file node
QUERY CreateFile (file_id: String, content: String, path:String) =>
    file <- AddN<File>({
    file_id: file_id,
    content: content,
    path: path,
    })
    RETURN file


// create a video
QUERY CreateVideo (video_id: String, no_of_chunks: U8, path:String) =>
    video <- AddN<Video>({
        video_id: video_id,
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


// search transcript embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchFileEmbeddings(query: String, limit: I64) =>
    text <- SearchV<FileEmbeddings>(Embed(query), limit)
    chunks <- text::In<HasFileEmbeddings>
    RETURN text


// search transcript embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchTranscriptEmbeddings(query: String, limit: I64) =>
    text <- SearchV<TranscriptEmbeddings>(Embed(query), limit)
    chunks <- text::In<HasTranscriptEmbeddings>
    RETURN text

// search transcript embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchTranscriptEmbeddingsVideo(query: String, limit: I64, video_id: String) =>
    //video <- N<Video>({video_id: video_id})
    text <- SearchV<TranscriptEmbeddings>(Embed(query), limit)
    chunks <- text::In<HasTranscriptEmbeddings>::WHERE(_::{video_id}::EQ(video_id))
    RETURN text

// search frame summary embeddings
// #[model("gemini:gemini-embedding-001:RETRIEVAL_DOCUMENT")]
QUERY SearchFrameSummaryEmbeddings(query:String, limit: I64) =>
    text <- SearchV<FrameSummaryEmbeddings>(Embed(query), limit)
    chunks <- text::In<HasFrameSummaryEmbeddings>
    RETURN text

QUERY SearchFrameSummaryEmbeddingsVideo(query:String, limit: I64,video_id: String) =>
    //video <- N<Video>({video_id: video_id})
    text <- SearchV<FrameSummaryEmbeddings>(Embed(query), limit)
    chunks <- text::In<HasFrameSummaryEmbeddings>::WHERE(_::{video_id}::EQ(video_id))
    RETURN text

// search transcript keywords
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

// combined search with video_id from parent chunk
QUERY CombinedSearchWithVideoId(search_text: String) =>
    transcripts <- SearchV<TranscriptEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    transcript_chunks <- transcripts::In<HasTranscriptEmbeddings>
    frames <- SearchV<FrameSummaryEmbeddings>(Embed(search_text), 100)
        ::RerankRRF(k: 60)
        ::RANGE(0, 50)
    frame_chunks <- frames::In<HasFrameSummaryEmbeddings>
    RETURN transcripts, transcript_chunks, frames, frame_chunks

// hybrid search transcript keywords + transcript embedddings
// this doesnt work as of now
QUERY SearchTranscriptCombined(search_string: String, keywords: String) =>
    vec_results <- SearchV<TranscriptEmbeddings>(Embed(search_string), 100)
    bm25_results <- SearchBM25<Transcript>(keywords, 100)
    // Use RerankRRF to combine both result sets
    combined_results <- vec_results::RerankRRF(k: 60)::RANGE(0, 10)
    RETURN combined_results

// hybrid search frame summary keywords + embeddings
// this doesnt work as of now
QUERY SearchFrameSummaryCombined(search_string: String, keywords: String) =>
    vec_results <- SearchV<FrameSummaryEmbeddings>(Embed(search_string), 100)
    bm25_results <- SearchBM25<FrameSummary>(keywords, 100)
    // Use RerankRRF to combine both result sets
    combined_results <- vec_results::RerankRRF(k: 60)::RANGE(0, 10)
    RETURN combined_results

// get all videos
QUERY GetAllVideos() =>
    videos <- N<Video>
    RETURN videos

QUERY GetAllFiles() =>
    files <- N<File>
    RETURN files

// get video by video id
//QUERY GetVideoByVideoId(video_id: String) =>
//    video <- N<Video>({video_id: video_id})
//    RETURN video

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


// last resort is to have a single vector type for all fiels
