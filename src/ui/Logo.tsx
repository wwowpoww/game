const LOGO_SRC = new URL("art/logo.png", document.baseURI).href;

/** The Veil wordmark: a carved, sunlit stone arch over the letters, with an olive sprig. */
export function Logo() {
  return <img className="logo" src={LOGO_SRC} alt="Veil" width={1024} height={409} draggable={false} />;
}
