import React from 'react'

import './qa.css'

export const metadata = {
  description: 'Collaborative email QA for Figma stakeholders',
  title: 'Email QA',
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  )
}
