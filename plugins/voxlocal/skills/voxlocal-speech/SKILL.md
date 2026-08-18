---
name: voxlocal-speech
description: Convert generated text, Markdown, or local documents into private on-device speech with VoxLocal. Use when Codex or another agent is asked to narrate, read aloud, voice, dub, or create an audio version of text or a document, including requests to use a default voice or a saved user voice.
---

# VoxLocal Speech

Use VoxLocal tools to create audio locally. Do not upload source text, documents, recordings, or generated audio to a remote service.

## Workflow

1. Call `list_voices` and choose the requested voice. Use the default voice when the user gives no preference.
2. For generated or pasted content, call `synthesize_text` with the final text.
3. For an existing file, call `synthesize_document` with its absolute path. Prefer the source file over copying a long document into a tool argument.
4. Report the returned job ID when generation continues in the background.
5. Call `get_job` until the job is `completed` or `failed`. Do not start a duplicate job while the first remains queued or running.
6. Return the absolute audio path. If the user asks to hear it in Codex, render that local audio file.

## Voice Rules

- Use only voice IDs returned by `list_voices`.
- Never imply that a system voice is the user's cloned voice.
- Use a saved cloned voice only when its status is `ready`.
- If the requested voice is unavailable, present the available voices and use the default only when the user did not specify a particular identity.

## Output Rules

- Preserve source wording unless the user explicitly asks for rewriting or a listening-friendly adaptation.
- Prefer a user-provided output directory. Otherwise accept VoxLocal's private local export directory.
- Treat a generated path as an output, not as proof that the user has listened to or approved the audio.
