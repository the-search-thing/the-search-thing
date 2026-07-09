import { Effect } from "effect"

const program = Effect.logInfo("backend scaffold ready")

Effect.runSync(program)
