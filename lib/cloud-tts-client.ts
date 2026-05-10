export interface CloudTtsRequest {
  ssml: string
  voiceName: string
  languageCode: string
  apiKey: string
  /** Set to true to request MP3 encoding for browser playback (default: false = LINEAR16) */
  useMp3?: boolean
}

export interface CloudTtsResponse {
  /** base64-encoded audio data (WAV for LINEAR16, MP3 for MP3) */
  audioContent: string
  timepoints: Array<{
    markName: string
    timeSeconds: number
  }>
}

export async function callCloudTTS(req: CloudTtsRequest): Promise<CloudTtsResponse> {
  const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${req.apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml: req.ssml },
      voice: {
        languageCode: req.languageCode,
        name: req.voiceName,
      },
      audioConfig: {
        audioEncoding: req.useMp3 ? 'MP3' : 'LINEAR16',
        sampleRateHertz: 24000,
      },
      enableTimePointing: ['SSML_MARK'],
    }),
  })

  if (!res.ok) throw new Error(`Cloud TTS API error: ${res.status} ${await res.text()}`)
  return res.json()
}
