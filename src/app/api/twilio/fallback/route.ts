import { NextResponse } from 'next/server'

export async function POST() {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="ja-JP" voice="Polly.Mizuki">申し訳ございません。システムエラーが発生しました。後ほどおかけ直しいたします。</Say>
  <Hangup/>
</Response>`

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
