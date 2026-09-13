export const SPLASH_SESSION_KEY = 'dapcook_splash'

// Synchronous, runs before #dapcook-splash is parsed. Must never throw —
// a thrown error here would break page load. Falls back to showing the
// splash whenever sessionStorage is unavailable (private browsing, blocked
// storage) rather than risk a stuck overlay.
export const SPLASH_GATE_SCRIPT = `(function(){try{if(sessionStorage.getItem('${SPLASH_SESSION_KEY}')){document.documentElement.setAttribute('data-splash','skip')}else{sessionStorage.setItem('${SPLASH_SESSION_KEY}','1')}}catch(e){}})()`

export function SplashScreen() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE_SCRIPT }} />
      <div id="dapcook-splash" aria-hidden="true">
        <div className="splash-lockup">
          <div className="splash-tile-wrap">
            <div className="splash-tile font-fraunces">d</div>
            <span className="splash-ripple splash-ripple--1" />
            <span className="splash-ripple splash-ripple--2" />
            <span className="splash-ripple splash-ripple--3" />
          </div>
          <div className="splash-word font-fraunces">
            <span className="splash-letter splash-letter--1">d</span>
            <span className="splash-letter splash-letter--2">a</span>
            <span className="splash-letter splash-letter--3">p</span>
            <span className="splash-cook">cook</span>
          </div>
        </div>
      </div>
    </>
  )
}
