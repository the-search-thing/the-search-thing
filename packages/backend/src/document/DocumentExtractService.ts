import { Context, Effect, Schema } from "effect";

export class DocumentExtractError extends Schema.TaggedErrorClass<DocumentExtractError>()(
  "DocumentExtractError",
  {
    message: Schema.String,
    path: Schema.optional(Schema.String),
  },
) {}

export class DocumentExtractService extends Context.Service<
  DocumentExtractService,
  {
    readonly libreOfficeAvailable: boolean;

    readonly supports: (path: string) => boolean;

    readonly extract: (path: string) => Effect.Effect<
      {
        text: string;
        contentType: string;
      },
      DocumentExtractError
    >;
  }
>()("DocumentExtractService") {}
