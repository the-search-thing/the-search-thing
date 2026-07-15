import { Schema } from "effect";

export class DocumentIndexError extends Schema.TaggedErrorClass<DocumentIndexError>()(
  "DocumentIndexError",
  {
    message: Schema.String,
  },
) {}
