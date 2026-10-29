export const HELP = `# Pi stack guide

This server controls the church's Pi video and audio system. Read state from the pi:// resources first, then change it with a tool. Tools you may not use are not listed (system_whoami says why).

## Tool groups
- **routing**: what each output shows (routing_set_output_source), the Atlona matrix (routing_request_route, routing_set_lock), multiview, crop/rotation of sources (source_set_framing), fade-to-black/mute per source, RTSP output.
- **cameras**: camera_move and camera_zoom (always finish with "stop"), camera_preset (recall is the normal way to frame a shot), smart framing, camera streams.
- **atem**: atem_switch. Normal sequence: preview the input, check pi://atem, then cut. "program" goes straight on air.
- **program**: the PiPGM pipelines (hymn slides, media, PowerPoint, Canva): program_control, program_playlist, program_create_item, fade-to-black and audio per pipeline; slides_canva_* for Canva presentations.
- **composites**: slide overlay for the ATEM key: composite_set_slide, composite_control.
- **voice**: microphone, web radio, transcription and captions (on / off / auto): voice_set_radio_mode, voice_set_transcription_mode, voice_set_captions_mode, voice_capture.
- **youtube**: YouTube live stream broadcast management (pitube): youtube_broadcast_list, youtube_broadcast_select, youtube_broadcast_create, youtube_broadcast_start (Go Live), youtube_broadcast_stop, and youtube_status.
- **tally**: Tally-Ma wireless tally lights & director cues (pilight): tally_list, tally_set_state (PGM/PRV/OFF), tally_cue (pan/zoom cues), tally_call, tally_hold, tally_brightness, tally_set_segments, tally_cycle.
- **radio**: Web radio relay streaming: radio_status, radio_start, radio_stop.
- **encoder**: Matrox Monarch HDX hardware encoder: encoder_status, encoder_control (start/stop encoder 1 or 2), encoder_input_status.

## Safety during a service
- Tools marked destructive can change what the congregation sees or hears at once. Confirm with the user before using them unless they just asked for exactly that.
- Read the state after a change to check it took effect; states such as "busy" or "waiting" settle after a few seconds.
- Stopping capture silences radio, transcription and captions together.
- Secrets (stream keys, passwords, tokens) are never shown. Do not ask for them.
`;
