import { describe, expect, it } from 'vitest'

import { extractPreheader } from '@/lib/email-preview'
import { SAMPLE_EMAIL } from '@/lib/sample-email'

describe('extractPreheader', () => {
  it('reads a hidden span from the sample email', () => {
    expect(extractPreheader(SAMPLE_EMAIL)).toBe(
      'See what shipped this month — Variables 2.0, faster prototyping, and a smarter AI.',
    )
  })

  it('strips Gmail filler characters from a Design Studio-style preheader', () => {
    const html = `<!doctype html><html><body>
      <div class="preheader" style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;opacity:0;">
        The latest Figma product updates.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
      </div>
      <table><tr><td>Visible body copy that should not become the preheader.</td></tr></table>
    </body></html>`
    expect(extractPreheader(html)).toBe('The latest Figma product updates.')
  })

  it('does not treat a huge hidden wrapper as the preheader', () => {
    const html = `<div style="display:none">${'x'.repeat(400)}<span class="preheader">Short preview line</span></div>`
    expect(extractPreheader(html)).toBe('Short preview line')
  })
})
