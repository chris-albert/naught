/** Small "i" that shows a blurb on hover, or on tap/focus where there is no hover. */
export function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} aria-label={text}>
      <span className="info-icon" aria-hidden>
        i
      </span>
      <span className="info-bubble" role="tooltip">
        {text}
      </span>
    </span>
  )
}
