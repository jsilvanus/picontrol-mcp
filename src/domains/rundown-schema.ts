/**
 * Rundown v2 Schemas and Guides
 * Provides JSON Schema definitions and detailed documentation for authoring
 * Rundown v2 cue sheets and executing rundown actions.
 */

export const RUNDOWN_V2_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'RundownV2',
  description: 'Schema for complete liturgical Rundown v2 cue sheets',
  type: 'object',
  required: ['version', 'title', 'rundown'],
  properties: {
    version: {
      type: 'integer',
      const: 2,
      description: 'Document specification version, must be 2',
    },
    title: {
      type: 'string',
      minLength: 1,
      description: 'Title of the service or event, e.g. "Messu 1. adventtisunnuntaina"',
    },
    service: {
      type: 'string',
      description: 'Service type, e.g. "Sunday Mass", "Vespers", "Baptism"',
    },
    church: {
      type: 'string',
      description: 'Parish or church name, e.g. "Keskuskirkko"',
    },
    date: {
      type: 'string',
      description: 'ISO-8601 date string, e.g. "2026-11-29"',
    },
    ai: {
      description: 'Global AI director guidelines, pacing, framing constraints, and camera roles',
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            general: { type: 'string' },
            pacing: {
              type: 'string',
              enum: ['meditative', 'calm', 'liturgical', 'dynamic', 'brisk'],
            },
            style: { type: 'string' },
            guidelines: { type: 'array', items: { type: 'string' } },
            constraints: {
              type: 'object',
              properties: {
                disallowCongregationCloseup: { type: 'boolean' },
                minShotDwellSec: { type: 'number', minimum: 0 },
                maxShotDwellSec: { type: 'number', minimum: 0 },
                avoidCutsDuringPrayer: { type: 'boolean' },
                disallowMoveWhileOnAir: { type: 'boolean' },
              },
            },
            cameraRoles: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            sections: {
              type: 'object',
              additionalProperties: {
                oneOf: [{ type: 'string' }, { type: 'object' }],
              },
            },
          },
        },
      ],
    },
    connectors: {
      type: 'object',
      description: 'External data connector definitions for dynamic variable fetching (e.g. liturgical calendar, hymn API)',
      additionalProperties: {
        type: 'object',
        required: ['baseUrl'],
        properties: {
          baseUrl: { type: 'string', format: 'uri' },
          auth: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['none', 'bearer', 'api_key', 'basic', 'custom'] },
              token: { type: 'string' },
              headerName: { type: 'string' },
              value: { type: 'string' },
              username: { type: 'string' },
              password: { type: 'string' },
              headers: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          headers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'value'],
              properties: { key: { type: 'string' }, value: { type: 'string' } },
            },
          },
          requests: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
                path: { type: 'string', default: '' },
                query: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['key', 'value'],
                    properties: { key: { type: 'string' }, value: { type: 'string' } },
                  },
                },
                headers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['key', 'value'],
                    properties: { key: { type: 'string' }, value: { type: 'string' } },
                  },
                },
                bodyType: { type: 'string', enum: ['none', 'json', 'text'] },
                body: { type: 'string' },
                responseType: { type: 'string', enum: ['auto', 'json', 'text', 'binary', 'image'] },
                mappings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['jsonPath', 'variable'],
                    properties: {
                      jsonPath: { type: 'string' },
                      variable: { type: 'string' },
                      skipIfNull: { type: 'boolean' },
                    },
                  },
                },
                timeoutMs: { type: 'number', minimum: 1 },
              },
            },
          },
        },
      },
    },
    preflight: {
      type: 'object',
      description: 'Pre-service automated queries and variable initializations',
      properties: {
        fetch: {
          type: 'array',
          items: {
            type: 'object',
            required: ['connector', 'request'],
            properties: {
              connector: { type: 'string' },
              request: { type: 'string' },
            },
          },
        },
        variables: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    rundown: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/definitions/RundownItem' },
    },
  },
  definitions: {
    RundownItem: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        section: { type: 'string', description: 'Section name for grouping (e.g. "Johdanto-osa", "Sana", "Ehtoollinen")' },
        notes: { type: 'string', description: 'Liturgical instructions or notes for human operators' },
        ai: { $ref: '#/definitions/AiItemInstructions' },
        cue: { $ref: '#/definitions/Cue' },
        actions: {
          type: 'array',
          items: { $ref: '#/definitions/ActionItem' },
          default: [],
        },
        subitems: {
          type: 'array',
          items: { $ref: '#/definitions/RundownSubitem' },
        },
        items: {
          type: 'array',
          items: { $ref: '#/definitions/RundownItem' },
        },
      },
    },
    RundownSubitem: {
      type: 'object',
      required: ['id', 'title'],
      properties: {
        id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
        notes: { type: 'string' },
        ai: { $ref: '#/definitions/AiItemInstructions' },
        cue: { $ref: '#/definitions/Cue' },
        actions: {
          type: 'array',
          items: { $ref: '#/definitions/ActionItem' },
          default: [],
        },
      },
    },
    Cue: {
      description: 'Trigger condition advancing or executing this rundown item',
      oneOf: [
        {
          type: 'object',
          required: ['type', 'phrase'],
          properties: {
            type: { type: 'string', const: 'phrase' },
            phrase: { type: 'string', minLength: 1 },
            caseSensitive: { type: 'boolean', default: false },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'phrase'],
          properties: {
            type: { type: 'string', const: 'fuzzy' },
            phrase: { type: 'string', minLength: 1 },
            threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'pattern'],
          properties: {
            type: { type: 'string', const: 'regex' },
            pattern: { type: 'string', minLength: 1 },
            flags: { type: 'string', default: 'i' },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'event'],
          properties: {
            type: { type: 'string', const: 'sound' },
            event: {
              type: 'string',
              enum: ['music_start', 'music_stop', 'speech_start', 'speech_stop', 'silence'],
            },
            duration_ms: { type: 'number', minimum: 0 },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', const: 'manual' },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'conditions'],
          properties: {
            type: { type: 'string', const: 'all' },
            conditions: { type: 'array', items: { $ref: '#/definitions/Cue' }, minItems: 1 },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
        {
          type: 'object',
          required: ['type', 'conditions'],
          properties: {
            type: { type: 'string', const: 'any' },
            conditions: { type: 'array', items: { $ref: '#/definitions/Cue' }, minItems: 1 },
            mode: { type: 'string', enum: ['next', 'skip', 'any'], default: 'next' },
            cooldown_ms: { type: 'number', minimum: 0 },
          },
        },
      ],
    },
    ActionItem: { $ref: 'pi://schema/actions#/definitions/ActionItem' },
    AiItemInstructions: {
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            instructions: { type: 'string' },
            targetZone: { type: 'string' },
            primarySubject: { type: 'string' },
            preferredCameras: {
              type: 'array',
              items: { oneOf: [{ type: 'number' }, { type: 'string' }] },
            },
            framing: {
              type: 'string',
              enum: ['wide', 'medium', 'close', 'extreme-close', 'over-shoulder', 'ambient'],
            },
            pacing: {
              type: 'string',
              enum: ['meditative', 'calm', 'liturgical', 'dynamic', 'brisk'],
            },
            minDurationSec: { type: 'number', minimum: 0 },
            shotRules: {
              type: 'array',
              items: {
                type: 'object',
                required: ['condition', 'target'],
                properties: {
                  condition: { type: 'string' },
                  target: { type: 'string' },
                  priority: { type: 'number', minimum: 1, maximum: 10 },
                },
              },
            },
            graphicsCue: { type: 'object' },
          },
        },
      ],
    },
  },
};

export const ACTIONS_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'RundownActionItem',
  description: 'Schema for single Rundown v2 actions: structured objects or shorthand strings',
  definitions: {
    ActionItem: {
      oneOf: [
        {
          type: 'string',
          description: 'Shorthand string format, e.g. "cam:1:preset:altar", "atem:program:2", "atem:cut:1", "tally:1:cue:wide", "delay:500", "var:name=value"',
        },
        {
          type: 'object',
          required: ['switch'],
          properties: {
            switch: {
              type: 'object',
              properties: {
                cut: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                preview: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                program: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                auto: { type: 'boolean' },
                dsk: { type: 'number' },
                state: { type: 'string', enum: ['on', 'off', 'toggle'] },
                ftb: { type: 'boolean' },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['atem'],
          properties: {
            atem: {
              type: 'object',
              properties: {
                cut: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                preview: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                program: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                auto: { type: 'boolean' },
                dsk: { type: 'number' },
                state: { type: 'string', enum: ['on', 'off', 'toggle'] },
                ftb: { type: 'boolean' },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['cam'],
          properties: {
            cam: {
              type: 'object',
              required: ['id'],
              properties: {
                id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                preset: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                move: { type: 'string', enum: ['up', 'down', 'left', 'right', 'stop'] },
                speed: { type: 'number' },
                zoom: { type: 'string', enum: ['in', 'out', 'stop'] },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['tally'],
          properties: {
            tally: {
              type: 'object',
              required: ['unit'],
              properties: {
                unit: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                cue: { type: 'string' },
                state: { type: 'string', enum: ['pgm', 'prv', 'off'] },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['pipgm'],
          properties: {
            pipgm: {
              type: 'object',
              properties: {
                hymn: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                slide: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                ftb: { type: 'boolean' },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['var'],
          properties: {
            var: {
              type: 'object',
              additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
            },
          },
        },
        {
          type: 'object',
          required: ['fetch'],
          properties: {
            fetch: {
              type: 'object',
              required: ['connector', 'request'],
              properties: {
                connector: { type: 'string' },
                request: { type: 'string' },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['delay'],
          properties: {
            delay: {
              type: 'object',
              required: ['ms'],
              properties: {
                ms: { type: 'number', minimum: 1 },
              },
            },
          },
        },
        {
          type: 'object',
          required: ['alternate'],
          properties: {
            alternate: {
              type: 'object',
              properties: {
                interval_sec: {
                  oneOf: [
                    { type: 'number', minimum: 0 },
                    { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                  ],
                },
                during: {
                  type: 'string',
                  enum: ['any', 'speech', 'music', 'silence'],
                  default: 'any',
                },
                cut: { type: 'array', items: { type: 'number' } },
                steps: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      ],
    },
  },
  $ref: '#/definitions/ActionItem',
};

export const RUNDOWN_GUIDE = `# Rundown v2 Authoring Guide

Rundown v2 is the cue sheet format for worship broadcasts and multi-camera church productions. It synchronizes live automated switching, PTZ presets, slide presentation, audio captions, and wireless tally cues with speech transcription and sound events.

## Top-Level Document Structure

\`\`\`yaml
version: 2
title: "Messu 1. adventtisunnuntaina"
service: "Messu"
church: "Keskuskirkko"
date: "2026-11-29"

# AI Director Guidelines
ai:
  pacing: liturgical # meditative | calm | liturgical | dynamic | brisk
  constraints:
    disallowCongregationCloseup: true
    minShotDwellSec: 4
    avoidCutsDuringPrayer: true

# Pre-service dynamic variables
preflight:
  variables:
    liturgist: "Celebrant / Liturgi"
    preacher: "Preacher / Saarnaaja"

rundown:
  - id: "alkusoitto"
    section: "Johdanto-osa"
    title: "Alkusoitto"
    cue:
      type: sound
      event: music_start
    actions:
      - cam: { id: 1, preset: "organ-gallery" }
      - atem: { program: 1 }

  - id: "alkuvirsi"
    title: "Alkuvirsi 1"
    cue:
      type: phrase
      phrase: "Veisaamme alkuvirren yksi"
    actions:
      - pipgm: { hymn: 1, slide: 1 }
      - cam: { id: 2, preset: "altar-wide" }
      - alternate:
          interval_sec: [8, 15]
          during: music
          cut: [2, 1]
\`\`\`

## Cue Types

1. **phrase**: Exact spoken phrase match against real-time voice transcription.
   - \`phrase\`: Spoken text (e.g. \`"Isän ja Pojan ja Pyhän Hengen nimeen"\`).
   - \`caseSensitive\`: default \`false\`.
2. **fuzzy**: Resilient speech recognition matching using phonetic Jaro-Winkler substring search.
   - \`threshold\`: \`0.0\` to \`1.0\` (default \`0.8\`). Excellent for handling transcription misrecognitions in Finnish liturgies.
3. **regex**: Regular expression matching on the live transcript.
4. **sound**: Triggers on audio events from \`pisound\`:
   - \`music_start\`, \`music_stop\`, \`speech_start\`, \`speech_stop\`, \`silence\`.
5. **manual**: Advanced only by manual operator tap or space clicker.
6. **composite (all / any)**: Combines multiple conditions (e.g. \`sound: speech_start\` AND \`phrase: "Herra olkoon teidän kanssanne"\`).

## Shorthand Strings vs Object Actions

Actions in an item can be written as structured objects or concise strings:
- Object: \`cam: { id: 1, preset: "pulpit" }\`
- String: \`"cam:1:preset:pulpit"\`
- Object: \`atem: { cut: 2 }\`
- String: \`"atem:cut:2"\`

## Validating and Executing in MCP

1. Read the JSON Schema at \`pi://schema/rundown-v2\` and \`pi://schema/actions\`.
2. Test individual actions or sequences live with the \`rundown_action_exec\` tool.
3. Deploy or update the full sheet using \`rundown_create_or_update\`.
`;

export const ACTIONS_GUIDE = `# Rundown Actions and Macro Reference

Rundown actions are instructions dispatched to live broadcast hardware and software pipelines when an item triggers. They can be fired as part of a cue sheet or tested on-demand using \`rundown_action_exec\`.

## Action Catalog

### 1. Camera (\`cam\`)
Control PTZ cameras via \`pimatrix\` / VISCA.
- **Preset Recall**:
  - Object: \`{ cam: { id: 1, preset: "altar" } }\`
  - Shorthand: \`"cam:1:preset:altar"\`
- **Manual Move / Zoom**:
  - \`{ cam: { id: 2, move: "left", speed: 5 } }\`
  - \`{ cam: { id: 2, zoom: "in", speed: 3 } }\`

### 2. Video Switcher / ATEM (\`atem\` or \`switch\`)
Control ATEM Mini / Constellation video routing:
- **Cut**: \`{ atem: { cut: 2 } }\` or \`"atem:cut:2"\`
- **Preview & Auto Transition**: \`{ atem: { preview: 1, auto: true } }\`
- **Fade to Black (FTB)**: \`{ atem: { ftb: true } }\`
- **Downstream Keyer (DSK)**: \`{ atem: { dsk: 1, state: "on" } }\`

### 3. Tally & Director Cues (\`tally\`)
Wireless tally cues for camera operators and talent:
- **Tally State**: \`{ tally: { unit: 1, state: "pgm" } }\` (values: \`pgm\`, \`prv\`, \`off\`)
- **Operator Cue**: \`{ tally: { unit: 1, cue: "zoom-wide" } }\` or \`"tally:1:cue:zoom-wide"\`

### 4. Slides and Presentation (\`pipgm\`)
Presentation slides, hymns, and lyric overlays:
- **Show Hymn**: \`{ pipgm: { hymn: 301, slide: 1 } }\` or \`"pipgm:hymn:301:1"\`
- **FTB Slides**: \`{ pipgm: { ftb: true } }\`

### 5. Automated Alternator (\`alternate\`)
Dynamically cuts between multiple camera angles at specified intervals while a condition holds:
\`\`\`yaml
alternate:
  interval_sec: [8, 14] # Random interval between 8 and 14 seconds
  during: music         # any | speech | music | silence
  cut: [1, 2, 3]        # Cycle through inputs 1, 2, and 3
\`\`\`

### 6. Variables (\`var\`)
Update liturgy variables in the runtime variable store:
- Object: \`{ var: { lector: "Lukija" } }\`
- Shorthand: \`"var:lector=Lukija"\`

### 7. Delays & Connectors
- **Sleep delay**: \`{ delay: { ms: 800 } }\` or \`"delay:800"\`
- **Varfetch**: \`{ fetch: { connector: "calendar", request: "todays-readings" } }\`

## Testing with \`rundown_action_exec\`

Use the MCP tool \`rundown_action_exec\` to dispatch an action directly:
- **Live execution**:
  \`\`\`json
  { "action": "cam:1:preset:altar" }
  \`\`\`
- **Dry-run syntax validation** (verifies structure without touching hardware):
  \`\`\`json
  { "action": { "atem": { "cut": 2 } }, "dryRun": true }
  \`\`\`
`;
